// Agregações dos imóveis (CAR) em SQL no DuckDB. Filtros de imóvel viram WHERE; tudo agrupado por codmun.
import { q, status } from './db.js';

export const TIP = ['AST', 'PCT', 'PRONAF', 'PRONAF B', 'Minifúndio', 'Pequeno', 'Médio', 'Grande'];
// Valores de tipologia_car2 no banco → rótulos do Relatório 2 (decisão de Pedro, 24/11: exibir como no relatório)
export const TIPDB = ['AST', 'PCT', 'Pronaf', 'Pronaf B', 'Minifundio', 'Pequeno', 'Medio', 'Grande'];
const DB2TIP = new Map(TIPDB.map((v, i) => [v, TIP[i]]));
export const AR = ['A', 'B', 'C', 'D', 'E', 'F'];
export const RF = ['MUITO_BAIXO', 'BAIXO', 'MODERADO_BAIXO', 'MODERADO', 'ALTO'];
// Critérios de salvaguarda (colunas booleanas do arquivo de imóveis)
export const CRIT = [
  ['apto_status', 'status e condição do CAR'], ['apto_desm_2023', 'desmatamento após 2023'], ['apto_desm_2008', 'desmatamento sem autorização desde 2008'],
  ['apto_embargo', 'embargo'], ['apto_fpnd', 'floresta pública não destinada'], ['apto_uc', 'UC (UCPI e UCUS)'], ['apto_uc_semucus', 'UC (só UCPI)'],
  ['apto_ti_tq', 'TI e território quilombola'], ['apto_areas_degradadas', 'possui área degradada'],
];
// Uso da terra: [rótulo, cor, coluna degradada, coluna não degradada]. Padrão: agricultura + pastagem (Pedro, 24/11/2026)
export const USOS = [['Agricultura', '#c9a227', 'agri_deg_ha', 'agri_ndeg_ha'], ['Pastagem', '#8c4a2f', 'past_deg_ha', 'past_ndeg_ha'],
  ['Mosaico de usos', '#d17a3a', 'mos_deg_ha', 'mos_ndeg_ha'], ['Vegetação nativa', '#4f6b55', 'vn_deg_ha', 'vn_ndeg_ha']];
export const DEF_USO = new Set([0, 1]);
// Área degradada efetiva = soma dos usos marcados (nulos como zero)
export const degExpr = uso => { const u = [...(uso || DEF_USO)].sort(); return u.length ? '(' + u.map(i => `coalesce(${USOS[i][2]}, 0)`).join(' + ') + ')' : '0::FLOAT'; };
export const CEN = { com: ['apto_todos', 'Com UCUS como restrição (apto_todos)'], sem: ['apto_todos_semucus', 'Sem UCUS como restrição (apto_todos_semucus)'] };

const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
const inList = (col, vals) => `${col} IN (${vals.map(lit).join(',')})`;

// fi: {tip:Set<idx>, ar:Set<idx>, rf:Set<idx>, degmin, apt:'t'|'s'|'n', cen:'com'|'sem'}
// Dimensão com tudo marcado não filtra (inclui 'Sem tipologia'/'Sem classe', se existirem).
export function whereOf(fi) {
  const w = [];
  if (!fi) return w;
  if (fi.tip.size < TIP.length) w.push(fi.tip.size ? inList('tipologia', [...fi.tip].map(i => TIPDB[i])) : 'false');
  if (fi.ar.size < AR.length) w.push(fi.ar.size ? inList('aridez', [...fi.ar].map(i => AR[i])) : 'false');
  if (fi.rf.size < RF.length) w.push(fi.rf.size ? inList('risco_fund', [...fi.rf].map(i => RF[i])) : 'false');
  if (fi.degmin != null && isFinite(fi.degmin)) w.push(`${degExpr(fi.uso)} >= ${+fi.degmin}`);
  const ac = CEN[fi.cen || 'com'][0];
  if (fi.apt === 's') w.push(ac); else if (fi.apt === 'n') w.push(`NOT ${ac}`);
  return w;
}

const Z = () => ({ n: 0, area: 0, deg: 0, elig: 0, apt: 0, u: [0, 0, 0, 0], f: [0, 0, 0, 0] });

// Uma consulta, quatro agrupamentos: por município e por município × tipologia/aridez/risco.
// O resultado (~25 mil linhas) permite somar qualquer conjunto de municípios no JS.
let seq = 0;
const cache = new Map(); // chave = filtros; evita repetir a consulta ao redimensionar ou trocar de aba
const keyOf = fi => fi ? JSON.stringify({ ...fi, tip: [...fi.tip], ar: [...fi.ar], rf: [...fi.rf], uso: [...fi.uso] }) : 'todos';
export async function aggAll(fi) {
  if (!status.imoveis) return null;
  const key = keyOf(fi);
  if (cache.has(key)) { ++seq; return cache.get(key); }
  const my = ++seq, w = whereOf(fi), ac = CEN[fi?.cen || 'com'][0], dg = degExpr(fi?.uso);
  const usoAgg = USOS.map(([, , d, nd], i) => `sum(coalesce(${d}, 0) + coalesce(${nd}, 0)) AS u${i}, sum(coalesce(${d}, 0)) AS f${i}`).join(',');
  const crit = CRIT.map(([c]) => `count(*) FILTER (WHERE ${c})::DOUBLE AS "${c}"`).join(',');
  const sql = `SELECT codmun, tipologia, aridez, risco_fund,
      GROUPING(tipologia) AS gt, GROUPING(aridez) AS ga, GROUPING(risco_fund) AS gr,
      count(*)::DOUBLE AS n, sum(area_ha) AS area, sum(${dg}) AS deg, ${usoAgg},
      coalesce(sum(${dg}) FILTER (WHERE ${ac}), 0) AS elig, count(*) FILTER (WHERE ${ac})::DOUBLE AS apt,
      count(*) FILTER (WHERE apto_todos)::DOUBLE AS apto_todos, count(*) FILTER (WHERE apto_todos_semucus)::DOUBLE AS apto_todos_semucus, ${crit}
    FROM imoveis ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
    GROUP BY GROUPING SETS ((codmun), (codmun, tipologia), (codmun, aridez), (codmun, risco_fund))`;
  const rows = await q(sql);
  if (my !== seq) return undefined; // resultado velho: houve outra mudança de filtro
  // (o resultado velho é descartado; a chamada mais recente desenha)
  const by = new Map(), tip = new Map(), ar = new Map(), rf = new Map();
  for (const r of rows) {
    const o = { n: r.n, area: r.area || 0, deg: r.deg || 0, elig: r.elig || 0, apt: r.apt, u: [r.u0, r.u1, r.u2, r.u3].map(x => x || 0), f: [r.f0, r.f1, r.f2, r.f3].map(x => x || 0) };
    if (!r.gt) push(tip, r.codmun, DB2TIP.get(r.tipologia) ?? r.tipologia ?? 'Sem tipologia', o);
    else if (!r.ga) push(ar, r.codmun, r.aridez ?? 'Sem classe', o);
    else if (!r.gr) push(rf, r.codmun, r.risco_fund ?? 'Sem classe', o);
    else { for (const [c] of CRIT) o[c] = r[c]; o.apto_todos = r.apto_todos; o.apto_todos_semucus = r.apto_todos_semucus; by.set(r.codmun, o); }
  }
  const res = { by, tip, ar, rf, sql, uso: new Set(fi?.uso || DEF_USO) };
  if (cache.size > 20) cache.delete(cache.keys().next().value);
  cache.set(key, res);
  return res;
}
function push(m, cod, k, o) { let x = m.get(cod); if (!x) m.set(cod, x = new Map()); x.set(k, o); }

// Soma por categoria num conjunto de municípios (null = todos)
export function sumBy(m, cods, keys) {
  const out = new Map(keys.map(k => [k, Z()]));
  for (const [cod, x] of m) {
    if (cods && !cods.has(cod)) continue;
    for (const [k, o] of x) { let t = out.get(k); if (!t) out.set(k, t = Z()); t.n += o.n; t.area += o.area; t.deg += o.deg; t.elig += o.elig; t.apt += o.apt; for (let i = 0; i < 4; i++) { t.u[i] += o.u[i]; t.f[i] += o.f[i]; } }
  }
  return out;
}
