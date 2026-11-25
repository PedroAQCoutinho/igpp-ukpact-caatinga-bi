// BI Caatinga — porte do prototipo/app.js para dados reais (DuckDB-WASM + Parquet).
// Comportamento e visual seguem o protótipo aprovado; mudanças de dados estão comentadas.
import { init, q, status, dataUrl } from './db.js';
import { TIP, AR, RF, CRIT, USOS, DEF_USO, aggAll, sumBy } from './geo.js';
import { initConsole } from './console.js';
import { initFeedback } from './feedback.js';

// ---------- utilidades ----------
const $ = id => document.getElementById(id);
const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => { const a = Math.abs(v); return a >= 1e9 ? 'R$ ' + nf.format(v / 1e9) + ' bi' : a >= 1e6 ? 'R$ ' + nf.format(v / 1e6) + ' mi' : 'R$ ' + nf.format(v / 1e3) + ' mil' }; // entrada em R$ (no protótipo era R$ mil)
const pc = (a, b) => b ? nf.format(100 * a / b) + '%' : '—';
const nfs = new Intl.NumberFormat('pt-BR', { maximumSignificantDigits: 3 });
const fmt = v => v == null || !isFinite(v) ? '—' : Math.abs(v) >= 100 ? nf0.format(v) : Math.abs(v) >= 1 ? nf.format(v) : nfs.format(v);
const S = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
const kpi = (v, l) => `<div class="kpi"><span>${l}</span><b>${v}</b></div>`;
const bar = (lab, w, val, c, dim) => `<div class="row"${dim ? ' style="opacity:.35"' : ''}><span>${esc(lab)}</span><div class="track"><i style="width:${Math.max(0, w)}%;background:${c || 'var(--main)'}"></i></div><span class="v">${val}</span></div>`;
const opt = (v, l, s) => `<option value="${esc(v)}"${s ? ' selected' : ''}>${esc(l)}</option>`;

const AG = { agroextrativismo: 'Agroextrativismo', aves_e_suinos: 'Aves e suínos', bovinos_e_bubalinos: 'Bovinos e bubalinos', caprinos_e_ovinos: 'Caprinos e ovinos', fruticultura_rustica: 'Fruticultura rústica', lavouras_de_sequeiro: 'Lavouras de sequeiro', lavouras_de_aeh: 'Lavouras de AEH', fibras_xerofitas: 'Fibras xerófitas', outra_producao: 'Outra produção', base_forrageira: 'Base forrageira', nao_classificado: 'Não classificado' };
const COL = { agroextrativismo: '#7b8f3a', aves_e_suinos: '#c9a227', bovinos_e_bubalinos: '#8c4a2f', caprinos_e_ovinos: '#d17a3a', fruticultura_rustica: '#b84a6b', lavouras_de_sequeiro: '#4f6b55', lavouras_de_aeh: '#3d7ea6', fibras_xerofitas: '#6f5ba7', outra_producao: '#9aa79f', base_forrageira: '#5a9e8c', nao_classificado: '#c7ccc8' };
const PAL = { lr: ['Laranja → roxo', ['#fde0b6', '#f6a75f', '#d9744a', '#a3568a', '#6b4c9a', '#3b2a6e']], az: ['Cinza → azul', ['#e8edf1', '#b7cde0', '#7fa9cc', '#4c84b5', '#2b5f93', '#173f6b']], gr: ['Verde → vermelho', ['#1a9850', '#91cf60', '#d9ef8b', '#fee08b', '#fc8d59', '#d73027']], rg: ['Vermelho → verde', ['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#91cf60', '#1a9850']] };
const METH = { q4: 'Quartis', q5: 'Quintis', q10: 'Decis', eq: 'Intervalos iguais (5)', jk: 'Quebras naturais (5)', fx: 'Limites fixos' };
const OPS = { '>': '>', '>=': '≥', '<': '<', '<=': '≤' };

let R = [], RM = new Map(), UF = '', UFS = [], POLY = {}, AREA = new Map(), BIOMA = [], BASEAGG = { by: new Map() };
// Arranjos citados nas entrevistas (seção 12.1): só os pontos com local; liga/desliga único para todos os mapas
let PTS = [], PTS_ON = false;
const PCL = { A: '#1a7f3c', B: '#2f6fb0', C: '#c4761a', D: '#7a5a8c' }, PRL = { municipio: 'município citado', municipio_inferido: 'município inferido (conferir)', regiao_aprox: 'região aproximada' };

// ---------- variáveis municipais ----------
const prA = k => 'pr_ag_' + k + '_rs', crA = k => 'cr_ag_' + k + '_vol_rs';
const mi = v => v == null ? null : v / 1e6; // R$ -> R$ mi
const rat = (a, b, m = 100) => a == null || !b ? null : m * a / b;
const V = {
  vbp: { l: 'VBP agropecuário', u: 'R$ mi', g: 'IBGE', ext: 1, ag: 'pr', f: (r, a) => mi(a ? r[prA(a)] : r.pr_agropecuaria_rs) },
  vbp_sh: { l: 'Participação do agrupamento no VBP', u: '%', g: 'IBGE', ag: 'need', f: (r, a) => a ? rat(r[prA(a)], r.pr_agropecuaria_rs) : null },
  vbp_agri: { l: 'VBP agrícola e extrativo', u: 'R$ mi', g: 'IBGE', ext: 1, f: r => mi(r.pr_agricola_rs) },
  vbp_pec: { l: 'VBP pecuário', u: 'R$ mi', g: 'IBGE', ext: 1, f: r => mi(r.pr_pecuaria_rs) },
  pec_med: { l: 'Pecuária apurada pelo IBGE', u: '%', g: 'IBGE', f: r => rat(r.pr_pec_medido_rs, r.pr_pecuaria_rs) },
  estab: { l: 'Estabelecimentos (2017)', u: 'n', g: 'IBGE', ext: 1, f: r => r.ca_estabelecimentos },
  af: { l: 'Agricultura familiar (2017)', u: '%', g: 'IBGE', f: r => rat(r.ca_af_estab, r.ca_estabelecimentos) },
  pbe: { l: 'Estabelecimentos Pronaf B (2017)', u: '%', g: 'IBGE', f: r => rat(r.ca_pronafb_estab, r.ca_estabelecimentos) },
  a20: { l: 'Estabelecimentos até 20 ha (2017)', u: '%', g: 'IBGE', f: r => r.ca_estab_ate20ha_pct },
  ater: { l: 'Receberam ATER (2017)', u: '%', g: 'IBGE', f: r => r.ca_ater_pct },
  mul: { l: 'Dirigidos por mulheres (2017)', u: '%', g: 'IBGE', f: r => r.ca_prod_fem_pct },
  neg: { l: 'Dirigidos por pretos ou pardos (2017)', u: '%', g: 'IBGE', f: r => r.ca_prod_negra_pct },
  cred: { l: 'Crédito rural', u: 'R$ mi', g: 'SICOR', ext: 1, ag: 'cr', f: (r, a) => mi(a ? r[crA(a)] : r.cr_volume_rs) },
  cred_sh: { l: 'Participação do agrupamento no crédito', u: '%', g: 'SICOR', ag: 'need', f: (r, a) => a ? rat(r[crA(a)], r.cr_volume_rs) : null },
  contr: { l: 'Contratos de crédito', u: 'n', g: 'SICOR', ext: 1, f: r => r.cr_contratos },
  ticket: { l: 'Ticket médio', u: 'R$ mil', g: 'SICOR', f: r => rat(r.cr_volume_rs, r.cr_contratos, 1e-3) },
  pronaf: { l: 'Pronaf no volume', u: '%', g: 'SICOR', f: r => rat(r.cr_pronaf_volume_rs, r.cr_volume_rs) },
  pronafb: { l: 'Pronaf B no volume', u: '%', g: 'SICOR', f: r => rat(r.cr_pronafb_volume_rs, r.cr_volume_rs) },
  inv: { l: 'Investimento no volume', u: '%', g: 'SICOR', f: r => rat(r.cr_investimento_rs, r.cr_volume_rs) },
  femc: { l: 'Contratos de mulheres (PF)', u: '%', g: 'SICOR', f: r => rat(r.cr_fem_contratos, r.cr_pf_contratos) },
  femv: { l: 'Volume de mulheres (PF)', u: '%', g: 'SICOR', f: r => rat(r.cr_fem_volume_rs, r.cr_pf_volume_rs) },
  trad: { l: 'Volume de povos tradicionais (PF)', u: '%', g: 'SICOR', f: r => rat(r.cr_trad_volume_rs, r.cr_pf_volume_rs) },
  cvbp: { l: 'Crédito por R$ produzido', u: 'centavos', g: 'SICOR', ag: 'both', f: (r, a) => a ? rat(r[crA(a)], r[prA(a)]) : rat(r.cr_volume_rs, r.pr_agropecuaria_rs) },
  n_im: { l: 'Imóveis (CAR)', u: 'n', g: 'Geo', ext: 1, geo: 1, f: (r, a, g) => g?.n ?? null },
  ar_im: { l: 'Área dos imóveis', u: 'ha', g: 'Geo', ext: 1, geo: 1, f: (r, a, g) => g?.area ?? null },
  deg: { l: 'Área potencialmente degradada', u: 'ha', g: 'Geo', ext: 1, geo: 1, f: (r, a, g) => g?.deg ?? null },
  ...Object.fromEntries([['ag', 'Agricultura', 0], ['pa', 'Pastagem', 1], ['mo', 'Mosaico de usos', 2], ['vn', 'Vegetação nativa', 3]].flatMap(([k, l, i]) => [
    ['u_' + k, { l: 'Área de ' + l.toLowerCase(), u: 'ha', g: 'Geo', ext: 1, geo: 1, f: (r, a, g) => g?.u?.[i] ?? null }],
    ['f_' + k, { l: l + ' potencialmente degradada', u: 'ha', g: 'Geo', ext: 1, geo: 1, f: (r, a, g) => g?.f?.[i] ?? null }],
    ['p_' + k, { l: l + ': % degradada', u: '%', g: 'Geo', geo: 1, f: (r, a, g) => g?.f ? rat(g.f[i], g.u[i]) : null }]])),
  degp: { l: 'Área degradada / área dos imóveis', u: '%', g: 'Geo', geo: 1, f: (r, a, g) => g ? rat(g.deg, g.area) : null },
  eleg: { l: 'Área degradada em imóveis elegíveis', u: 'ha', g: 'Geo', ext: 1, geo: 1, f: (r, a, g) => g?.elig ?? null },
  aptp: { l: 'Imóveis elegíveis (todas as salvaguardas)', u: '%', g: 'Geo', geo: 1, f: (r, a, g) => g ? rat(g.apt, g.n) : null },
};
// APLs (seção 12.2): variáveis municipais para recorte e hachura (não entram na escolha da variável do mapa)
const APLG = [['bovinocultura', 'Bovinocultura e pecuária', '#8c4a2f'], ['caprinovinocultura', 'Caprinovinocultura', '#d17a3a'], ['agricultura', 'Agricultura e agropecuária', '#4f6b55'],
  ['fruticultura', 'Fruticultura', '#b84a6b'], ['apicultura', 'Apicultura', '#c9a227'], ['avicultura', 'Avicultura', '#e39a6f'], ['pesca', 'Pesca e aquicultura', '#2f6fb0'],
  ['textil', 'Têxtil, confecção e artesanato', '#6f5ba7'], ['mineral', 'Mineral e cerâmica', '#7a7f7c'], ['turismo', 'Turismo', '#3d9e8c'], ['outros', 'Outros (indústria e serviços)', '#b0b6b2']];
let APL = [], APLM = new Map(); // APLM: codmun → linhas de apl_municipio
const aplOf = c => APLM.get(c) || [];
const APLV = {
  tem_apl: { l: 'Tem APL (Observatório 2022)', u: '1 = sim', g: 'APL', f: r => APL.length ? (aplOf(r.codmun).length ? 1 : 0) : null },
  n_apls: { l: 'Nº de APLs no município', u: 'n', g: 'APL', f: r => APL.length ? aplOf(r.codmun).length : null },
  ...Object.fromEntries(APLG.map(([k, l]) => ['tem_apl_setor_' + k, { l: 'Tem APL — ' + l.toLowerCase(), u: '1 = sim', g: 'APL', f: r => APL.length ? (aplOf(r.codmun).some(a => a.setor_grupo === k) ? 1 : 0) : null }])),
};
Object.assign(V, APLV);
// Nº de aptos por critério (seção 5, aba 3)
for (const [c, l] of CRIT) V['n_' + c] = { l: 'Imóveis aptos — ' + l, u: 'n', g: 'Geo', ext: 1, geo: 1, f: (r, a, g) => g ? g[c] ?? null : null };
const varsOf = gs => Object.keys(V).filter(k => gs.includes(V[k].g));
function varOptions(keys, sel) { const gs = [...new Set(keys.map(k => V[k].g))]; return gs.map(g => `<optgroup label="${g}">` + keys.filter(k => V[k].g === g).map(k => opt(k, V[k].l + ' (' + V[k].u + ')', k === sel)).join('') + '</optgroup>').join('') }
function agOptions(sel, kind) { const ks = Object.keys(AG).filter(k => kind === 'cr' ? k !== 'nao_classificado' : kind === 'pr' ? k !== 'base_forrageira' : k !== 'nao_classificado' && k !== 'base_forrageira'); return opt('', 'Todos', !sel) + ks.map(k => opt(k, AG[k], k === sel)).join('') }

// ---------- filtros de imóvel ----------
const TIPG = [['af', 'Agricultura familiar', [0, 1, 2, 3]], ['hib', 'Grupo híbrido', [4, 5]], ['eco', 'Potencial Eco Invest', [6, 7]]];
const ARG = [['up', 'Aumentou a aridez', [[0, 'A', 'já estava em ASD'], [1, 'B', 'entrou na ASD']]], ['eq', 'Estável', [[2, 'C', 'em ASD'], [3, 'D', 'fora da ASD']]], ['dn', 'Diminuiu a aridez', [[4, 'E', 'segue em ASD'], [5, 'F', 'saiu da ASD']]]];
const ARL = ['A · aumentou, já em ASD', 'B · aumentou, entrou na ASD', 'C · estável, em ASD', 'D · estável, fora da ASD', 'E · diminuiu, segue em ASD', 'F · diminuiu, saiu da ASD'];
const RFL = [['Muito baixo', 'par com SIGEF, AST ou PCT'], ['Baixo', '>70% em imóvel privado; pequeno/minifúndio em assentamento ou gleba pública'], ['Moderado-baixo', '>70% em área sem registro georreferenciado'], ['Moderado', 'demais casos'], ['Alto', 'sobreposição com TI, UCPI, TQ ou floresta pública tipo B']];
function ImovelFilters(el, onChange) {
  const grp = (cls, gk, label, items, name) => `<div class="grp g-${cls}"><label><input type="checkbox" data-grp="${gk}" checked> ${label}</label><div class="chk">${items.map(([i, l, sm]) => `<label><input type="checkbox" data-g="${name}" data-gr="${gk}" value="${i}" checked> ${esc(l)}${sm ? ` <small>${esc(sm)}</small>` : ''}</label>`).join('')}</div></div>`;
  el.innerHTML = `<fieldset class="sg"><legend>Salvaguardas e elegibilidade (Eco Invest)</legend><div class="seg" role="group" aria-label="Salvaguardas e elegibilidade">${[['s', 'Elegíveis'], ['n', 'Não elegíveis'], ['t', 'Todos']].map(([k, l]) => `<button type="button" data-apt="${k}" aria-pressed="${k === 't'}">${l}</button>`).join('')}</div><p class="hint">Elegível = apto em todos os critérios de salvaguarda (status do CAR, desmatamento, embargos, florestas públicas, UC, TI/TQ).</p></fieldset>
 <div class="maps2">
 <fieldset><legend>Tipologia<button type="button" class="info" data-fig="tip">ⓘ Como foi classificado</button></legend>${TIPG.map(([k, l, ix]) => grp(k, 't-' + k, l, ix.map(i => [i, TIP[i]]), 'tip')).join('')}</fieldset>
 <fieldset><legend>Dinâmica da aridez (ASD = área suscetível à desertificação)<button type="button" class="info" data-fig="ar">ⓘ Mapa</button></legend>${ARG.map(([k, l, it]) => grp(k, 'a-' + k, l, it.map(([i, c, d]) => [i, c, d]), 'ar')).join('')}
 <div class="quick"><button data-q="asd">Só em ASD hoje (A, B, C, E)</button><button data-q="noasd">Só fora de ASD (D, F)</button><button data-q="all">Todas</button></div></fieldset>
 <fieldset><legend>Risco fundiário<button type="button" class="info" data-fig="rf">ⓘ Como foi classificado</button></legend><div class="chk" style="display:grid;gap:4px">${RFL.map(([l, d], i) => `<label><input type="checkbox" data-g="rf" value="${i}" checked> ${l} <small>(${esc(d)})</small></label>`).join('')}</div></fieldset>
 <fieldset><legend>Uso da terra (% da área do imóvel)</legend><div class="uf">${USOS.map(([l, col], u) => `<div class="urow"><span><span class="dot" style="--bc:${col}"></span>${l}</span><div class="seg" role="group" aria-label="Filtro de ${l}">${[['none', 'Sem filtro'], ['>=', '≥'], ['<=', '≤']].map(([v, t]) => `<button type="button" data-u="${u}" data-uop="${v}" aria-pressed="${v === 'none'}">${t}</button>`).join('')}</div><input type="number" data-upx="${u}" min="0" max="100" placeholder="%" disabled><span class="u">% do imóvel</span></div>`).join('')}</div></fieldset>
 <fieldset><legend>Área potencialmente degradada<button type="button" class="info" data-fig="deg">ⓘ Como foi classificado</button></legend>
 <div class="fr">Área potencialmente degradada ≥ <input type="number" data-k="degmin" min="0" placeholder="ha"><span class="u">ha</span></div>
 <div><button class="clr" data-reset style="--bc:#4f6b55">Limpar filtros de imóvel</button></div></fieldset></div>`;
  const up = [null, null, null, null];
  const setUp = (u, op) => { el.querySelectorAll(`[data-u="${u}"]`).forEach(b => b.setAttribute('aria-pressed', b.dataset.uop === op)); const inp = el.querySelector(`[data-upx="${u}"]`); inp.disabled = op === 'none'; if (op === 'none') { inp.value = ''; up[u] = null } else up[u] = { op, x: inp.value === '' ? null : +inp.value } };
  let apt = 't'; const setApt = v => { apt = v; el.querySelectorAll('[data-apt]').forEach(b => b.setAttribute('aria-pressed', b.dataset.apt === v)) };
  const sync = () => el.querySelectorAll('[data-grp]').forEach(g => { const ch = [...el.querySelectorAll(`[data-gr="${g.dataset.grp}"]`)], n = ch.filter(x => x.checked).length; g.checked = n === ch.length; g.indeterminate = n > 0 && n < ch.length });
  let t = null; const deb = () => { clearTimeout(t); t = setTimeout(onChange, 250) };
  el.addEventListener('change', e => { const g = e.target.dataset.grp; if (g) el.querySelectorAll(`[data-gr="${g}"]`).forEach(x => x.checked = e.target.checked); sync(); onChange() });
  el.addEventListener('input', e => { const u = e.target.dataset.upx; if (u != null && up[+u]) up[+u].x = e.target.value === '' ? null : +e.target.value; if (e.target.type === 'number') deb() });
  el.addEventListener('click', e => {
    const qk = e.target.dataset.q; if (qk) { el.querySelectorAll('[data-g=ar]').forEach(x => x.checked = qk === 'all' || (qk === 'asd') === [0, 1, 2, 4].includes(+x.value)); sync(); onChange() }
    if (e.target.dataset.reset != null) { el.querySelectorAll('input[type=checkbox]').forEach(x => x.checked = true); [0, 1, 2, 3].forEach(u => setUp(u, 'none')); el.querySelector('[data-k=degmin]').value = ''; setApt('t'); sync(); onChange() }
    const a = e.target.dataset.apt; if (a) { setApt(a); onChange() }
    const uo = e.target.dataset.uop; if (uo) { setUp(+e.target.dataset.u, uo); onChange() }
  });
  return {
    get() {
      const g = n => new Set([...el.querySelectorAll(`[data-g=${n}]:checked`)].map(x => +x.value)); const v = el.querySelector('[data-k=degmin]').value;
      return { tip: g('tip'), ar: g('ar'), rf: g('rf'), up: up.map(f => f && f.x != null && isFinite(f.x) ? { ...f } : null), degmin: v === '' ? null : +v, apt }
    },
    json() { const f = this.get(); return { tipologias: [...f.tip].map(i => TIP[i]), aridez: [...f.ar].map(i => AR[i]), risco_fundiario: [...f.rf].map(i => RFL[i][0]), filtros_uso_pct: f.up.map((x, i) => x ? { uso: USOS[i][0], op: x.op, pct: x.x } : null).filter(Boolean), area_degradada_min_ha: f.degmin, salvaguardas: { s: 'elegiveis', n: 'nao_elegiveis', t: 'todos' }[f.apt] } }
  };
}

// ---------- filtros municipais ----------
function FilterList(el, keys, onChange, title, single) {
  let rows = [];
  const rowHTML = (f, i) => { const v = V[f.v]; return `<div class="fr" data-i="${i}"><select data-k="v">${varOptions(keys, f.v)}</select>${v.ag ? `<select data-k="ag" aria-label="Agrupamento">${agOptions(f.ag, v.ag)}</select>` : ''}<select data-k="op">${Object.entries(OPS).map(([k, l]) => opt(k, l, k === f.op)).join('')}</select><input type="number" data-k="x" value="${f.x ?? ''}" step="any"><span class="u">${esc(v.u)}</span>${single ? '' : `<button class="x" data-rm="${i}" aria-label="Remover condição">×</button>`}<span class="imp" data-imp></span></div>` };
  const draw = () => { el.innerHTML = (title ? `<div class="hint">${title}</div>` : '') + rows.map(rowHTML).join('') + (single ? '' : '<div><button class="btn add" data-add>+ Adicionar condição</button></div>') };
  const api = {
    on: !single, get: () => !api.on ? [] : rows.filter(f => f.x !== '' && f.x != null && isFinite(f.x)),
    set(r) { rows = r; draw() }, rows: () => rows, remove(i) { rows.splice(i, 1); draw(); onChange() },
    impact(fn) { el.querySelectorAll('[data-i]').forEach(d => { const f = rows[+d.dataset.i], t = d.querySelector('[data-imp]'); if (t) t.textContent = f && f.x != null && f.x !== '' && isFinite(f.x) ? fn(f) : '' }) }, json: () => api.get().map(f => ({ variavel: f.v, agrupamento: f.ag || null, op: f.op, valor: f.x, unidade: V[f.v].u }))
  };
  el.addEventListener('click', e => { if (e.target.dataset.add != null) { rows.push({ v: keys[0], ag: '', op: '>', x: null }); draw() } else if (e.target.dataset.rm != null) { rows.splice(+e.target.dataset.rm, 1); draw(); onChange() } });
  el.addEventListener('change', e => {
    const d = e.target.closest('[data-i]'); if (!d) return; const f = rows[+d.dataset.i], k = e.target.dataset.k;
    if (k === 'v') { f.v = e.target.value; f.ag = ''; draw() } else if (k === 'ag') f.ag = e.target.value; else if (k === 'op') f.op = e.target.value; onChange()
  });
  el.addEventListener('input', e => { if (e.target.dataset.k !== 'x') return; const d = e.target.closest('[data-i]'); rows[+d.dataset.i].x = e.target.value === '' ? null : +e.target.value; onChange() });
  draw(); return api;
}
// Geo: município com CAR mas sem imóvel que passe nos filtros vale zero (não "sem dado na fonte")
const GZ = Object.freeze({ n: 0, area: 0, deg: 0, elig: 0, apt: 0, u: [0, 0, 0, 0], f: [0, 0, 0, 0], ...Object.fromEntries(CRIT.map(([c]) => [c, 0])) });
const val = (cod, k, ag, g) => { const r = RM.get(cod); if (!r) return null; let o = g ? g.get(cod) : null; if (g && !o && BASEAGG.by.has(cod)) o = GZ; return V[k].f(r, ag || '', o) };
// Variáveis geo no recorte contam todos os imóveis do município (agregação "todos", em cache)
function passes(cod, filters) {
  for (const f of filters) {
    const x = val(cod, f.v, f.ag, BASEAGG.by); if (x == null) return false;
    if (f.op === '>' && !(x > f.x) || f.op === '>=' && !(x >= f.x) || f.op === '<' && !(x < f.x) || f.op === '<=' && !(x <= f.x)) return false
  } return true
}
const universe = () => R.filter(r => !UF || r.uf === UF).map(r => r.codmun);

// ---------- classificação e cores ----------
function jenks(d, k) {
  const n = d.length; if (n <= k) return d.slice(0, -1); const L = [...Array(n + 1)].map(() => Array(k + 1).fill(0)), Vv = [...Array(n + 1)].map(() => Array(k + 1).fill(Infinity));
  for (let j = 1; j <= k; j++) { L[1][j] = 1; Vv[1][j] = 0 }
  for (let l = 2; l <= n; l++) { let s1 = 0, s2 = 0, w = 0, v = 0; for (let m = 1; m <= l; m++) { const i3 = l - m + 1, x = d[i3 - 1]; s2 += x * x; s1 += x; w++; v = s2 - s1 * s1 / w; const i4 = i3 - 1; if (i4) for (let j = 2; j <= k; j++)if (Vv[l][j] >= v + Vv[i4][j - 1]) { L[l][j] = i3; Vv[l][j] = v + Vv[i4][j - 1] } } L[l][1] = 1; Vv[l][1] = v }
  const b = []; let kk = n; for (let j = k; j >= 2; j--) { const id = L[kk][j] - 2; b.unshift(d[id]); kk = L[kk][j] - 1 } return b
}
function breaksFor(vals, m, fixed) {
  const v = vals.filter(x => x != null && isFinite(x) && x !== 0).sort((a, b) => a - b); if (!v.length) return [];
  if (m === 'fx') return String(fixed || '').split(/[;\s]+/).map(s => parseFloat(s.replace(/\./g, '').replace(',', '.'))).filter(isFinite).sort((a, b) => a - b);
  if (m === 'eq') { const a = v[0], z = v[v.length - 1]; return [1, 2, 3, 4].map(i => a + (z - a) * i / 5) }
  if (m === 'jk') { const s = v.length > 800 ? v.filter((_, i) => i % Math.ceil(v.length / 800) === 0) : v; return jenks(s, 5) }
  const n = { q4: 4, q5: 5, q10: 10 }[m]; return [...new Set([...Array(n - 1)].map((_, i) => v[Math.min(v.length - 1, Math.floor((i + 1) * v.length / n))]))]
}
const clsOf = (x, b) => { let i = 0; while (i < b.length && x > b[i]) i++; return i };
function ramp(p, n) { const s = PAL[p][1]; if (n <= 1) return [s[s.length - 1]]; return [...Array(n)].map((_, i) => { const t = i / (n - 1) * (s.length - 1), a = Math.floor(t), f = t - a, c1 = s[a], c2 = s[Math.min(a + 1, s.length - 1)]; const h = (c, o) => parseInt(c.substr(o, 2), 16); return '#' + [1, 3, 5].map(o => Math.round(h(c1, o) + (h(c2, o) - h(c1, o)) * f).toString(16).padStart(2, '0')).join('') }) }

// ---------- desenho do mapa ----------
let HID = 0;
const ptsBtn = () => `<button class="ptsbtn" data-pts aria-pressed="${PTS_ON}">${PTS_ON ? '●' : '○'} Arranjos citados nas entrevistas (${PTS.length})</button>`;
function drawMap(box, o) { // o:{cods, inSet, showOut, vals:Map, breaks, colors, hatch:Set, unit, title}
  const W = box.clientWidth, H = box.clientHeight; if (!W) return;
  const drawn = o.showOut ? o.cods : o.cods.filter(c => o.inSet.has(c));
  if (!drawn.length) { box.innerHTML = '<p class="q" style="padding:16px">Nenhum município na seleção.</p>'; return }
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const c of drawn) for (const r of POLY[c] || []) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  const k = Math.cos((y0 + y1) / 2 * Math.PI / 180), pad = 12, s = Math.min((W - 2 * pad) / ((x1 - x0) * k || 1), (H - 2 * pad) / ((y1 - y0) || 1));
  const ox = (W - (x1 - x0) * k * s) / 2, oy = (H - (y1 - y0) * s) / 2, P = ([x, y]) => ((x - x0) * k * s + ox).toFixed(1) + ',' + ((y1 - y) * s + oy).toFixed(1);
  const ringsPath = rs => rs.map(r => 'M' + r.map(P).join('L') + 'Z').join('');
  const path = c => ringsPath(POLY[c] || []);
  const id = 'h' + (++HID);
  let g = `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" style="stroke:var(--ink);stroke-width:1.3"/></pattern></defs>`;
  for (const c of drawn) {
    const inn = o.inSet.has(c), x = o.vals.get(c);
    const fill = !inn ? 'var(--out)' : o.cat ? (o.cat.get(c) || 'var(--zero)') : o.blank ? 'var(--blank)' : x == null ? 'var(--nd)' : x === 0 ? 'var(--zero)' : o.colors[clsOf(x, o.breaks)];
    g += `<path class="m" data-c="${c}" d="${path(c)}" fill="${fill}" fill-rule="evenodd"/>`;
  }
  if (o.hatch) for (const c of drawn) if (o.hatch.has(c) && o.inSet.has(c)) g += `<path d="${path(c)}" fill="url(#${id})" fill-rule="evenodd" pointer-events="none"/>`;
  if (BIOMA.length) g += `<path class="bioma" d="${ringsPath(BIOMA)}" pointer-events="none"/>`;
  if (PTS_ON) { // pontos nos municípios desenhados (na aba 4, só os do recorte); vários no mesmo município ficam lado a lado
    const dset = new Set(drawn), grp = {};
    PTS.forEach((p, i) => { if (dset.has(p.codmun)) (grp[p.codmun] = grp[p.codmun] || []).push(i) });
    for (const ids of Object.values(grp)) ids.forEach((i, k) => {
      const p = PTS[i], [x, y] = P([p.lon, p.lat]).split(',').map(Number), n = ids.length, dx = n > 1 ? 7 * Math.cos(2 * Math.PI * k / n) : 0, dy = n > 1 ? 7 * Math.sin(2 * Math.PI * k / n) : 0, col = PCL[p.classe] || '#555', oco = p.prec === 'regiao_aprox';
      const cx = (x + dx).toFixed(1), cy = (y + dy).toFixed(1);
      g += `<circle cx="${cx}" cy="${cy}" r="8.5" fill="#fff" pointer-events="none"/><circle data-pt="${i}" cx="${cx}" cy="${cy}" r="6" style="fill:${oco ? '#fff' : col};stroke:${col};stroke-width:${oco ? 2.5 : 1.5};cursor:pointer"/>`;
    });
  }
  box.innerHTML = `<svg role="img" aria-label="${esc(o.title || 'Mapa municipal')}"${o.blank ? ' class="blank"' : ''}>${g}</svg>${PTS.length ? ptsBtn() : ''}<div class="tip" hidden></div>`;
  const tip = box.querySelector('.tip');
  box.querySelector('svg').onmousemove = e => {
    const pi = e.target.dataset?.pt;
    if (pi != null) {
      const p = PTS[+pi], b = box.getBoundingClientRect(); tip.textContent = `${p.org} · classe ${p.classe} · ${p.cadeia} · ${p.local} (${PRL[p.prec] || p.prec}${p.prec !== 'municipio' ? ': ' + p.mun + '/' + p.uf : ''})`; tip.hidden = false;
      let lx = e.clientX - b.left + 12; if (lx > W - tip.offsetWidth - 4) lx = Math.max(4, e.clientX - b.left - tip.offsetWidth - 12); tip.style.left = lx + 'px'; tip.style.top = (e.clientY - b.top + 12) + 'px'; return
    }
    const c = e.target.dataset?.c; if (!c) { tip.hidden = true; return } const r = RM.get(c), x = o.vals.get(c), b = box.getBoundingClientRect();
    if (o.cat) { tip.textContent = `${r.municipio} (${r.uf}): ${o.vals.get(c) || 'sem APL'}`; tip.hidden = false; let lx = e.clientX - b.left + 12; if (lx > W - tip.offsetWidth - 4) lx = Math.max(4, e.clientX - b.left - tip.offsetWidth - 12); tip.style.left = lx + 'px'; tip.style.top = (e.clientY - b.top + 12) + 'px'; return }
    tip.textContent = `${r.municipio} (${r.uf})${o.blank ? (o.inSet.has(c) ? '' : ' · fora do recorte') : ': ' + (o.inSet.has(c) ? (x == null ? 'sem dado' : fmt(x) + ' ' + o.unit) : 'fora do recorte')}${o.hatch && o.hatch.has(c) ? ' · hachura' : ''}`; tip.hidden = false;
    let lx = e.clientX - b.left + 12; if (lx > W - tip.offsetWidth - 4) lx = e.clientX - b.left - tip.offsetWidth - 12; tip.style.left = lx + 'px'; tip.style.top = (e.clientY - b.top + 12) + 'px'
  };
  box.querySelector('svg').onmouseleave = () => tip.hidden = true;
}
const ptsLeg = () => PTS_ON ? `<div style="margin-top:4px"><b>Arranjos citados nas entrevistas</b></div>` + Object.entries(PCL).map(([k, c]) => `<div><i style="background:${c};border-radius:50%;width:13px"></i>classe ${k}</div>`).join('') + `<div><i style="background:var(--bg);border:2.5px solid var(--mut);border-radius:50%;width:13px"></i>ponto em região aproximada</div>` : '';
const biomaLeg = () => (BIOMA.length ? `<div><i style="background:none;border:0;border-top:2px dashed var(--mut);height:0"></i>limite do bioma Caatinga (IBGE 2019)</div>` : '') + ptsLeg();
function legendHTML(o) {
  if (o.blank) { const k = o.cods.filter(c => o.inSet.has(c)).length; return `<b>${esc(o.title)}</b><div><i style="background:var(--blank)"></i>no recorte <span class="u">(${k})</span></div>` + (o.cods.length > k ? `<div><i style="background:var(--out)"></i>fora do recorte <span class="u">(${o.cods.length - k})</span></div>` : '') + biomaLeg() }
  const n = o.breaks.length + 1, cnt = Array(n).fill(0); let nd = 0, z = 0, out = 0;
  for (const c of o.cods) { if (!o.inSet.has(c)) { out++; continue } const x = o.vals.get(c); if (x == null) nd++; else if (x === 0) z++; else cnt[clsOf(x, o.breaks)]++ }
  const lab = i => i === 0 ? `até ${fmt(o.breaks[0])}` : i === n - 1 ? `acima de ${fmt(o.breaks[n - 2])}` : `${fmt(o.breaks[i - 1])} – ${fmt(o.breaks[i])}`;
  const idx = [...Array(n).keys()].reverse(); // do maior para o menor
  let h = `<b>${esc(o.title)} (${esc(o.unit)})</b>` + (n === 1 ? `<div><i style="background:${o.colors[0]}"></i>valores &gt; 0 (${cnt[0]})</div>` : idx.map(i => `<div><i style="background:${o.colors[i]}"></i>${lab(i)} <span class="u">(${cnt[i]})</span></div>`).join(''));
  if (z) h += `<div><i style="background:var(--zero)"></i>zero <span class="u">(${z})</span></div>`; if (nd) h += `<div><i style="background:var(--nd)"></i>sem dado na fonte <span class="u">(${nd})</span></div>`;
  if (out && o.showOut) h += `<div><i style="background:var(--out)"></i>fora do recorte <span class="u">(${out})</span></div>`;
  if (o.hatch) h += `<div><i style="background:repeating-linear-gradient(45deg,var(--ink) 0 1.5px,transparent 1.5px 5px)"></i>hachura: ${esc(o.hatchLabel)} <span class="u">(${[...o.hatch].filter(c => o.inSet.has(c)).length})</span></div>`;
  return h + biomaLeg()
}
const flabel = fs => fs.map(f => `${V[f.v].l}${f.ag ? ' — ' + AG[f.ag] : ''} ${OPS[f.op]} ${fmt(f.x)} ${V[f.v].u}`).join(' e ');

// ---------- construtor de mapas ----------
let MBID = 0;
const legendCtl = () => `<label>Classificação <select data-k="m">${Object.entries(METH).map(([k, l]) => opt(k, l, k === 'q5')).join('')}</select></label>
 <label data-fx hidden>Limites (separados por ;) <input type="text" data-k="fx" placeholder="10; 50; 100"></label>
 <label>Paleta <select data-k="p">${Object.entries(PAL).map(([k, [l]]) => opt(k, l, k === 'lr')).join('')}</select></label>`;
function MapBuilder(el, { keys, filterKeys, agSel, geoAgg }) {
  const id = ++MBID, st = { rc: null, v: '', norm: 'abs', m: 'q5', fx: '', p: 'lr', only: true, h: false };
  el.innerHTML = `<div class="mb"><div class="ctl">
 <div class="box b1"><div class="bh"><span class="n">1</span>Recorte de municípios<button class="clr" data-clr="1">Limpar</button></div>
  <div class="chk"><label><input type="radio" name="rc${id}" value="todos"> Todos</label><label><input type="radio" name="rc${id}" value="sel"> Seleção personalizada</label></div>
  <div data-f hidden></div></div>
 <div class="box b2 off" data-b="2"><div class="bh"><span class="n">2</span>Variável e unidade<button class="clr" data-clr="2">Limpar</button></div>
  <p class="hint" data-hint>Escolha o recorte primeiro.</p>
  <div data-c hidden class="ctl"><label>Variável <select data-k="v"><option value="">Escolha uma variável…</option>${varOptions(keys, '')}</select></label>
  <label>Normalização <select data-k="norm">${opt('abs', 'Valor absoluto')}${opt('estab', 'Por estabelecimento (Censo 2017)')}${opt('km2', 'Por km² (área do município)')}</select></label></div></div>
 <div class="box b3 off" data-b="3"><div class="bh"><span class="n">3</span>Legenda<button class="clr" data-clr="3">Limpar</button></div>
  <p class="hint" data-hint>Escolha a variável primeiro.</p>
  <div data-c hidden class="ctl">${legendCtl()}<label class="chk"><label><input type="checkbox" data-k="only" checked> Classes calculadas só no recorte</label></label></div></div>
 <div class="box b4 off" data-b="4"><div class="bh"><span class="n">4</span>Hachura<button class="clr" data-clr="4" hidden>Remover</button></div>
  <button class="btn add" data-addh disabled>+ Adicionar variável secundária?</button><div data-h hidden></div></div>
 <div class="fr"><button class="clr" data-clr="all" style="--bc:var(--ink)">Limpar tudo</button><button class="btn" data-cp>Copiar visão (JSON)</button><button class="btn" data-csv>Copiar tabela (CSV)</button></div><pre data-j hidden></pre></div>
 <div><div class="map" data-map></div><div class="leg" data-leg></div><h3 data-th></h3><div class="scroll tall"><table data-t></table></div></div></div>`;
  const qs = s => el.querySelector(s), render = () => api.render();
  const fl = FilterList(qs('[data-f]'), filterKeys, render, 'Municípios que atendem a todas as condições:');
  const hl = FilterList(qs('[data-h]'), filterKeys, render, 'Municípios com esta característica recebem hachura:', true); hl.set([{ v: 'pronafb', ag: '', op: '>', x: 30 }]); hl.on = false;
  const box = n => qs(`[data-b="${n}"]`);
  const steps = () => {
    const open2 = !!st.rc, open3 = open2 && !!st.v;
    for (const [n, o] of [[2, open2], [3, open3], [4, open3]]) { const b = box(n); b.classList.toggle('off', !o); const c = b.querySelector('[data-c]'), h = b.querySelector('[data-hint]'); if (c) c.hidden = !o; if (h) h.hidden = o }
    qs('[data-addh]').disabled = !open3; qs('[data-addh]').hidden = st.h; qs('[data-h]').hidden = !st.h; qs('[data-clr="4"]').hidden = !st.h;
    qs('[data-f]').hidden = st.rc !== 'sel'; qs('[data-k=norm]').disabled = !st.v || !V[st.v].ext; qs('[data-fx]').hidden = st.m !== 'fx'
  };
  const resetLeg = () => { st.m = 'q5'; st.fx = ''; st.p = 'lr'; st.only = true; qs('[data-k=m]').value = 'q5'; qs('[data-k=fx]').value = ''; qs('[data-k=p]').value = 'lr'; qs('[data-k=only]').checked = true };
  const clear = n => {
    if (n === '1' || n === 'all') { st.rc = null; el.querySelectorAll(`[name=rc${id}]`).forEach(x => x.checked = false); fl.set([]) }
    if (n === '2' || n === 'all') { st.v = ''; st.norm = 'abs'; qs('[data-k=v]').value = ''; qs('[data-k=norm]').value = 'abs' }
    if (n === '3' || n === 'all') resetLeg();
    if (n === '4' || n === 'all') { st.h = false; hl.on = false } steps(); render()
  };
  el.addEventListener('click', e => { const c = e.target.dataset.clr; if (c) clear(c); if (e.target.dataset.addh != null) { st.h = true; hl.on = true; steps(); render() } });
  el.addEventListener('change', e => {
    if (e.target.name === `rc${id}`) { st.rc = e.target.value; if (st.rc === 'sel' && !fl.get().length && !qs('[data-f] [data-i]')) fl.set([{ v: filterKeys[0], ag: '', op: '>', x: null }]); steps(); render(); return }
    const k = e.target.dataset.k; if (!k || !(k in st) || e.target.closest('[data-f],[data-h]')) return; st[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (k === 'v' && !(st.v && V[st.v].ext)) { st.norm = 'abs'; qs('[data-k=norm]').value = 'abs' } steps(); render()
  });
  qs('[data-k=fx]').addEventListener('input', e => { st.fx = e.target.value; render() });
  let last = [];
  const api = {
    render() {
      const cods = universe(), fs = st.rc === 'sel' ? fl.get() : [], inSet = new Set(st.rc ? cods.filter(c => passes(c, fs)) : cods);
      if (!st.v) {
        const o = { cods, inSet, showOut: true, blank: true, vals: new Map(), title: st.rc ? 'Recorte de municípios' : 'Mapa em branco — comece pelo recorte' }; drawMap(qs('[data-map]'), o); qs('[data-leg]').innerHTML = legendHTML(o);
        qs('[data-th]').textContent = st.rc ? `${inSet.size} municípios no recorte${fs.length ? ': ' + flabel(fs) : ''}` : ''; qs('[data-t]').innerHTML = ''; last = []; api.view = { recorte: st.rc, filtros_municipio: fl.json() }; return
      }
      const v = V[st.v], ag = v.ag ? agSel() : '', g = v.geo ? geoAgg() : null;
      let unit = v.u; const vals = new Map();
      for (const c of cods) {
        let x = val(c, st.v, ag, g ? g.by : null);
        if (x != null && st.norm === 'estab') { const e = RM.get(c).ca_estabelecimentos; x = e ? x / e * (v.u === 'R$ mi' ? 1000 : 1) : null }
        if (x != null && st.norm === 'km2') { const a = AREA.get(c); x = a ? x / a : null } vals.set(c, x)
      }
      if (st.norm === 'estab') unit = (v.u === 'R$ mi' ? 'R$ mil' : v.u) + ' por estab.'; if (st.norm === 'km2') unit = v.u + '/km²';
      const base = (st.only ? cods.filter(c => inSet.has(c)) : cods).map(c => vals.get(c)), breaks = breaksFor(base, st.m, st.fx), colors = ramp(st.p, breaks.length + 1);
      const hs = hl.get(), hatch = hs.length ? new Set(cods.filter(c => passes(c, hs))) : null;
      const title = v.l + (ag ? ' — ' + AG[ag] : '') + (v.ag === 'need' && !ag ? ' (escolha um agrupamento no topo da aba)' : '');
      const o = { cods, inSet, showOut: true, vals, breaks, colors, hatch, hatchLabel: flabel(hs), unit, title };
      drawMap(qs('[data-map]'), o); qs('[data-leg]').innerHTML = legendHTML(o);
      last = cods.filter(c => inSet.has(c)).map(c => [c, vals.get(c)]).sort((a, b) => (b[1] ?? -1e18) - (a[1] ?? -1e18));
      qs('[data-th]').textContent = `${inSet.size} municípios no recorte${fs.length ? ': ' + flabel(fs) : ''} — do maior para o menor`;
      qs('[data-t]').innerHTML = `<thead><tr><th>Município</th><th>UF</th><th>${esc(title)} (${esc(unit)})</th>${hatch ? '<th>Hachura</th>' : ''}</tr></thead><tbody>` + last.slice(0, 200).map(([c, x]) => { const r = RM.get(c); return `<tr><td>${esc(r.municipio)}</td><td>${r.uf}</td><td>${fmt(x)}</td>${hatch ? `<td>${hatch.has(c) ? 'sim' : ''}</td>` : ''}</tr>` }).join('') + '</tbody>';
      api.view = { recorte: st.rc, filtros_municipio: fl.json(), variavel: st.v, agrupamento: ag || null, normalizacao: st.norm, legenda: st.m, limites_fixos: st.m === 'fx' ? st.fx : null, paleta: st.p, classes_so_recorte: st.only, uf: UF || null, hachura: hl.json(), limites_calculados: breaks, ...(v.geo && api.extra ? api.extra() : {}) };
    }, view: null, extra: null
  };
  qs('[data-cp]').onclick = () => { const t = JSON.stringify(api.view, null, 1); qs('[data-j]').hidden = false; qs('[data-j]').textContent = t; navigator.clipboard?.writeText(t).catch(() => { }) };
  qs('[data-csv]').onclick = () => { const t = 'codmun;municipio;uf;valor\n' + last.map(([c, x]) => { const r = RM.get(c); return `${c};${r.municipio};${r.uf};${x == null ? '' : String(x).replace('.', ',')}` }).join('\n'); qs('[data-j]').hidden = false; qs('[data-j]').textContent = t; navigator.clipboard?.writeText(t).catch(() => { }) };
  new ResizeObserver(() => { if (el.offsetParent) render() }).observe(qs('[data-map]'));
  steps(); return api;
}

// ---------- abas 1 e 2 ----------
const sel = () => UF ? R.filter(r => r.uf === UF) : R;
const agKeys = p => Object.keys(R[0]).filter(k => k.startsWith(p)).map(k => k.replace(p, '').replace(/_vol_rs$|_rs$/, ''));
function ibge() {
  const rs = sel(), ag = $('ag-ibge').value, vbpT = S(rs, 'pr_agropecuaria_rs'), key = ag ? prA(ag) : 'pr_agropecuaria_rs', vbp = S(rs, key);
  $('k-ibge').innerHTML = kpi(brl(vbp), ag ? 'VBP — ' + AG[ag] : 'Valor da produção agropecuária') + (ag ? kpi(pc(vbp, vbpT), 'do VBP agropecuário') : kpi(pc(S(rs, 'pr_agricola_rs'), vbpT), 'Agricultura e extrativismo') + kpi(pc(S(rs, 'pr_pecuaria_rs'), vbpT), 'Pecuária')) + kpi(nf0.format(rs.filter(r => (r[key] || 0) > 0).length), 'Municípios com produção');
  $('pecmed').textContent = pc(S(rs, 'pr_pec_medido_rs'), S(rs, 'pr_pecuaria_rs'));
  const comp = agKeys('pr_ag_').map(k => [k, S(rs, prA(k))]).sort((a, b) => b[1] - a[1]), mx = comp[0][1];
  $('h-comp').textContent = `${AG[comp[0][0]]}, ${AG[comp[1][0]].toLowerCase()} e ${AG[comp[2][0]].toLowerCase()} somam ${pc(comp[0][1] + comp[1][1] + comp[2][1], vbpT)} da produção`;
  $('comp').innerHTML = comp.map(([k, v]) => bar(AG[k], 100 * v / mx, pc(v, vbpT), COL[k], ag && k !== ag)).join('');
  const top = [...rs].sort((a, b) => (b[key] || 0) - (a[key] || 0)), t15 = top.slice(0, 15), t10 = S(top.slice(0, 10), key);
  $('h-conc').textContent = `Os 10 maiores municípios concentram ${pc(t10, vbp)} da produção${ag ? ' de ' + AG[ag].toLowerCase() : ''}${UF ? ' na UF' : ''}`;
  $('conc').innerHTML = t15.map(r => bar(r.municipio + ' (' + r.uf + ')', 100 * (r[key] || 0) / (t15[0][key] || 1), brl(r[key] || 0))).join('');
  const ks = agKeys('pr_ag_'); $('leg-uf').innerHTML = ks.map(k => `<span style="--c:${COL[k]}">${AG[k]}</span>`).join('');
  $('ufmix').innerHTML = UFS.map(u => { const ru = R.filter(r => r.uf === u), t = S(ru, 'pr_agropecuaria_rs'); return `<div class="row"${UF && u !== UF ? ' style="opacity:.35"' : ''}><span>${u}</span><div class="track">${ks.map(k => `<i title="${AG[k]}: ${pc(S(ru, prA(k)), t)}" style="width:${100 * S(ru, prA(k)) / t}%;background:${COL[k]};${ag && k !== ag ? 'opacity:.2' : ''}"></i>`).join('')}</div><span class="v">${brl(t)}</span></div>` }).join('');
  const w = (ru, k) => { let a = 0, b = 0; for (const r of ru) if (r[k] != null && r.ca_estabelecimentos) { a += r[k] * r.ca_estabelecimentos; b += r.ca_estabelecimentos } return b ? nf.format(a / b) + '%' : '—' };
  const line = (lab, ru, c) => `<tr${c}><td>${lab}</td><td>${nf0.format(S(ru, 'ca_estabelecimentos'))}</td><td>${pc(S(ru, 'ca_af_estab'), S(ru, 'ca_estabelecimentos'))}</td><td>${pc(S(ru, 'ca_pronafb_estab'), S(ru, 'ca_estabelecimentos'))}</td><td>${w(ru, 'ca_estab_ate20ha_pct')}</td><td>${w(ru, 'ca_ater_pct')}</td><td>${w(ru, 'ca_prod_fem_pct')}</td><td>${w(ru, 'ca_prod_negra_pct')}</td><td>${w(ru, 'ca_prod_ate25_pct')}</td></tr>`;
  $('censo').innerHTML = '<thead><tr><th>UF</th><th>Estabelecimentos</th><th>Agric. familiar</th><th>Pronaf B</th><th>Até 20 ha</th><th>Recebeu ATER</th><th>Dirigente mulher</th><th>Preto ou pardo</th><th>Menos de 25 anos</th></tr></thead><tbody>' + UFS.map(u => line(u, R.filter(r => r.uf === u), u === UF ? ' class="sel"' : '')).join('') + line('Caatinga', R, ' class="sel"') + '</tbody>';
}
function sicor() {
  const rs = sel(), ag = $('ag-sicor').value, volT = S(rs, 'cr_volume_rs'), vol = ag ? S(rs, crA(ag)) : volT, ct = S(rs, 'cr_contratos'), vbp = ag ? S(rs, prA(ag)) : S(rs, 'pr_agropecuaria_rs');
  $('k-sicor').innerHTML = kpi(brl(vol), ag ? 'Crédito — ' + AG[ag] : 'Crédito rural contratado') + (ag ? kpi(pc(vol, volT), 'do crédito total') : kpi(nf0.format(ct), 'Contratos') + kpi(brl(volT / ct), 'Ticket médio') + kpi(pc(S(rs, 'cr_pronaf_volume_rs'), volT), 'Volume no Pronaf') + kpi(pc(S(rs, 'cr_pronafb_volume_rs'), volT), 'Volume no Pronaf B') + kpi(pc(S(rs, 'cr_investimento_rs'), volT), 'Investimento')) + kpi(vbp ? nf.format(100 * vol / vbp) + ' centavos' : '—', 'Crédito por R$ 1 produzido');
  const keys = [...new Set([...agKeys('cr_ag_'), ...agKeys('pr_ag_')])], vbT = S(rs, 'pr_agropecuaria_rs');
  const d = keys.map(k => ({ k, c: 100 * S(rs, crA(k)) / volT, p: 100 * S(rs, prA(k)) / vbT })).sort((a, b) => b.c - a.c), m = Math.max(...d.map(x => Math.max(x.c, x.p)));
  const big = d.reduce((a, x) => x.c - x.p > a.c - a.p ? x : a), low = d.reduce((a, x) => x.p - x.c > a.p - a.c ? x : a);
  $('h-cad').textContent = `${AG[big.k]}: ${nf.format(big.c)}% do crédito e ${nf.format(big.p)}% da produção; ${AG[low.k].toLowerCase()}: ${nf.format(low.c)}% e ${nf.format(low.p)}%`;
  $('cad').innerHTML = d.map(x => `<div class="row pair"${ag && x.k !== ag ? ' style="opacity:.35"' : ''}><span>${AG[x.k]}</span><div><div class="track"><i style="width:${100 * x.c / m}%;background:var(--acc)"></i></div><div class="track"><i style="width:${100 * x.p / m}%;background:var(--main)"></i></div></div><span class="v">${nf.format(x.c)}% · ${nf.format(x.p)}%</span></div>`).join('');
  const L = ['cr_pronaf_b_vol_rs', 'cr_pronaf_outros_vol_rs', 'cr_fora_pronaf_vol_rs'], LC = ['var(--acc)', 'var(--main)', '#9aa79f'];
  $('linhas').innerHTML = UFS.map(u => { const ru = R.filter(r => r.uf === u), t = L.reduce((a, k) => a + S(ru, k), 0); return `<div class="row"${UF && u !== UF ? ' style="opacity:.35"' : ''}><span>${u}</span><div class="track">${L.map((k, i) => `<i style="width:${100 * S(ru, k) / t}%;background:${LC[i]}"></i>`).join('')}</div><span class="v">${pc(S(ru, L[0]), t)} B</span></div>` }).join('');
  $('cob').textContent = pc(L.reduce((a, k) => a + S(rs, k), 0), volT);
  const fv = S(rs, 'cr_fem_volume_rs'), fc = S(rs, 'cr_fem_contratos'), pv = S(rs, 'cr_pf_volume_rs'), pcn = S(rs, 'cr_pf_contratos');
  $('h-incl').textContent = `Mulheres fazem ${pc(fc, pcn)} dos contratos e recebem ${pc(fv, pv)} do volume`;
  $('k-incl').innerHTML = kpi(pc(fc, pcn), 'Contratos de mulheres') + kpi(pc(fv, pv), 'Volume de mulheres') + kpi(brl(fv / fc), 'Ticket médio, mulheres') + kpi(brl((pv - fv) / (pcn - fc)), 'Ticket médio, homens') + kpi(pc(S(rs, 'cr_trad_volume_rs'), pv), 'Volume de povos tradicionais');
}

// ---------- aba 3 ----------
let geoF, geoAgg = { by: new Map() };
const SEM_F = () => ({ tip: new Set(TIP.keys()), ar: new Set(AR.keys()), rf: new Set(RF.keys()), up: [null, null, null, null], degmin: null, apt: 't' });
// Etiquetas dos filtros de imóvel ativos (abas 3 e 4)
function imovelChips(fi) {
  const ch = [], off = (set, n, labs, name) => set.size < n ? `<span class="chip" style="--bc:#c4761a">${name}: ${[...set].sort().map(i => labs[i]).join(', ') || 'nenhum'}</span>` : '';
  ch.push(off(fi.tip, 8, TIP, 'Tipologias'), off(fi.ar, 6, AR, 'Aridez'), off(fi.rf, 5, RFL.map(r => r[0]), 'Risco'));
  fi.up.forEach((x, i) => { if (x) ch.push(`<span class="chip" style="--bc:#c4761a">${USOS[i][0]} ${x.op === '>=' ? '≥' : '≤'} ${fmt(x.x)}% do imóvel</span>`) });
  if (fi.degmin != null) ch.push(`<span class="chip" style="--bc:#c4761a">Degradada ≥ ${fmt(fi.degmin)} ha</span>`);
  if (fi.apt !== 't') ch.push(`<span class="chip" style="--bc:#c4761a">${fi.apt === 's' ? 'Só elegíveis' : 'Só não elegíveis'}</span>`);
  return ch.filter(Boolean);
}
// Tabelas 4 e 7 do Relatório 2 (valores fixos, não mudam com os filtros)
const T4 = [['Alagoas', 1321078, 1.5], ['Bahia', 35135735, 40.7], ['Ceará', 14886858, 17.3], ['Minas Gerais', 3260954, 3.8], ['Paraíba', 5235875, 6.1], ['Pernambuco', 8258865, 9.6], ['Piauí', 11873378, 13.8], ['Rio Grande do Norte', 5074649, 5.9], ['Sergipe', 1213721, 1.4]];
const T7C = [['Vegetação nativa', '#1F8D49'], ['Pastagem', '#EDDE8E'], ['Agricultura', '#E974ED'], ['Mosaico de usos', '#FFEFC3'], ['Não vegetado', '#bdbdbd'], ['Massa d’água', '#2f6fb0']];
const T7 = [['Alagoas', 340311, 930423, 6696, 19256, 11440, 12949], ['Bahia', 21056124, 11139103, 416753, 1768315, 299026, 456393], ['Ceará', 10071953, 3194065, 576690, 538910, 264930, 240317], ['Minas Gerais', 1634534, 1476670, 71916, 31617, 22685, 23538], ['Paraíba', 3010055, 1996858, 19989, 104138, 57685, 47149], ['Pernambuco', 5107962, 2611486, 174316, 165352, 100206, 99536], ['Piauí', 9894872, 1476507, 125757, 258302, 88006, 29938], ['Rio Grande do Norte', 2722478, 1461214, 407525, 257994, 113684, 111757], ['Sergipe', 277809, 817535, 92248, 7667, 9084, 9383]];
const TIPC = ['#1a5e34', '#2f7d4a', '#4f9a63', '#7cb88a', '#c4761a', '#e0a35a', '#2b5f93', '#6f9cc8'];
let pieM = 'n', arrfM = 'area';
function bioma() {
  const sumR = r => r.slice(1).reduce((x, y) => x + y, 0), s4 = [...T4].sort((a, b) => b[1] - a[1]);
  $('t4').innerHTML = s4.map(([u, a, p]) => bar(u, 100 * a / s4[0][1], `${nf.format(p)}% · ${nf.format(a / 1e6)} mi ha`)).join('');
  $('t7bars').innerHTML = [...T7].sort((a, b) => sumR(b) - sumR(a)).map(r => { const t = sumR(r); return `<div class="row"><span>${r[0]}</span><div class="track">${r.slice(1).map((v, i) => `<i title="${T7C[i][0]}: ${nf0.format(v)} ha (${pc(v, t)})" style="width:${100 * v / t}%;background:${T7C[i][1]}"></i>`).join('')}</div><span class="v">${pc(r[2], t)} pasto</span></div>` }).join('');
  const tot = T7C.map((_, i) => T7.reduce((a, r) => a + r[i + 1], 0)), G = tot.reduce((a, b) => a + b, 0);
  $('t7').innerHTML = '<thead><tr><th>UF</th>' + T7C.map(c => `<th>${c[0]}</th>`).join('') + '<th>Total</th></tr></thead><tbody>' + T7.map(r => `<tr><td>${r[0]}</td>${r.slice(1).map(v => `<td>${nf0.format(v)}</td>`).join('')}<td>${nf0.format(sumR(r))}</td></tr>`).join('') + `<tr class="sel"><td>Total</td>${tot.map(v => `<td>${nf0.format(v)}</td>`).join('')}<td>${nf0.format(G)}</td></tr></tbody>`;
}
async function geo() {
  if (!status.imoveis) return;
  const fi = geoF.get(), a0 = await aggAll(SEM_F()); if (a0 === undefined) return;
  const a = await aggAll(fi); if (a === undefined) return; geoAgg = a;
  const uni = new Set(universe());
  const sum = x => { let n = 0, area = 0, deg = 0; for (const [c, o] of x.by) if (uni.has(c)) { n += o.n; area += o.area; deg += o.deg } return { n, area, deg } }, A = sum(a0), B = sum(a);
  const card = (l, k, u) => `<div class="kc"><span class="l">${l}</span><b>${nf0.format(B[k])}${u}</b><div class="f">${UF || 'Caatinga'} ${nf0.format(A[k])} → filtros <em>${pc(B[k], A[k])}</em></div></div>`;
  $('k-geo').innerHTML = card('Imóveis (CAR)', 'n', '') + card('Área dos imóveis', 'area', ' ha') + card('Área pot. degradada', 'deg', ' ha') + `<div class="kc"><span class="l">% da área degradada</span><b>${pc(B.deg, B.area)}</b><div class="f">agricultura + pastagem + mosaico</div></div>`;
  const ch = imovelChips(fi); $('chips-geo').innerHTML = ch.join('') || '<span class="hint">Sem filtros de imóvel: todos os imóveis.</span>';
  const st = sumBy(a.tip, uni, TIP); tipUsoTable($('tip-geo'), st); pie(st); usoBlock(st, a.uso);
  const sa = sumBy(a.ar, uni, AR), sr = sumBy(a.rf, uni, RF), isA = arrfM === 'area', un = isA ? ' ha' : '', m = o => isA ? o.area : o.n;
  $('ar-t').textContent = (isA ? 'Área' : 'Nº de CAR') + ' por classe de aridez'; $('rf-t').textContent = (isA ? 'Área' : 'Nº de CAR') + ' por risco fundiário';
  const arL = [...AR.map((k, i) => [ARL[i], m(sa.get(k))]), ...[...sa.keys()].filter(k => !AR.includes(k)).map(k => [k, m(sa.get(k))])];
  const AC = ['#b5543a', '#b5543a', '#8a8f8c', '#8a8f8c', '#3d6e8f', '#3d6e8f', '#c7ccc8'], am = Math.max(...arL.map(x => x[1]), 1), at = arL.reduce((s, x) => s + x[1], 0);
  $('ar-geo').innerHTML = arL.map(([l, v], i) => bar(l, 100 * v / am, `${nf0.format(v)}${un} · ${pc(v, at)}`, AC[Math.min(i, 6)])).join('');
  const rfL = [...RF.map((k, i) => [`${RFL[i][0]} (${RFL[i][1]})`, m(sr.get(k))]), ...[...sr.keys()].filter(k => !RF.includes(k)).map(k => [k, m(sr.get(k))])], rm = Math.max(...rfL.map(x => x[1]), 1), rt = rfL.reduce((s, x) => s + x[1], 0);
  $('rf-geo').innerHTML = rfL.map(([l, v]) => bar(l, 100 * v / rm, `${nf0.format(v)}${un} · ${pc(v, rt)}`)).join('');
}
// Seleção por tipologia (aba 3): área de cada uso, com subtotais por grupo (a degradada por tipologia fica na aba 4)
function tipUsoTable(el, t) {
  const add = (a, x) => ({ n: a.n + x.n, area: a.area + x.area, u: a.u.map((v, i) => v + x.u[i]) }), Z = { n: 0, area: 0, u: [0, 0, 0, 0] }, T = [...t.values()].reduce(add, Z);
  const tr = (l, x, c = '', st = '') => `<tr${c}${st}><td>${l}</td><td>${nf0.format(x.n)}</td><td>${nf0.format(x.area)}</td>${x.u.map(v => `<td>${nf0.format(v)}</td>`).join('')}</tr>`;
  const CL = { af: '#4f6b55', hib: '#c4761a', eco: '#3d6e8f' }, outros = [...t.keys()].filter(k => !TIP.includes(k) && t.get(k).n);
  el.innerHTML = `<thead><tr><th>Tipologia</th><th>Imóveis</th><th>Área (ha)</th>${USOS.map(([l, col]) => `<th><span class="dot" style="--bc:${col}"></span>${l} (ha)</th>`).join('')}</tr></thead><tbody>` +
    TIPG.map(([k, l, ix]) => tr(`<span class="dot"></span>Subtotal ${l}`, ix.reduce((a, i) => add(a, t.get(TIP[i])), Z), ' class="gt"', ` style="--bc:${CL[k]}"`) + ix.map(i => tr('&nbsp;&nbsp;&nbsp;&nbsp;' + TIP[i], t.get(TIP[i]))).join('')).join('') +
    outros.map(k => tr(esc(k), t.get(k))).join('') + tr('Total', T, ' class="sel"') + '</tbody>';
}
function pie(t) {
  const ks = [...TIP, ...[...t.keys()].filter(k => !TIP.includes(k) && t.get(k).n)], col = i => TIPC[i] || '#c7ccc8';
  const v = ks.map(k => pieM === 'n' ? t.get(k).n : t.get(k).area), T = v.reduce((a, b) => a + b, 0) || 1; let a0 = -Math.PI / 2, g = '';
  const p = a => `${(100 * Math.cos(a)).toFixed(2)},${(100 * Math.sin(a)).toFixed(2)}`;
  v.forEach((x, i) => { const a1 = a0 + 2 * Math.PI * x / T, lg = a1 - a0 > Math.PI ? 1 : 0; if (x > 0) g += x >= T ? `<circle r="100" fill="${col(i)}"/>` : `<path d="M0,0L${p(a0)}A100,100 0 ${lg} 1 ${p(a1)}Z" fill="${col(i)}" stroke="var(--bg)" stroke-width="1"><title>${esc(ks[i])}: ${pc(x, T)}</title></path>`; a0 = a1 });
  $('pie-geo').innerHTML = g; $('pie-leg').innerHTML = ks.map((l, i) => `<div><i style="background:${col(i)}"></i>${esc(l)} <span class="u">${pc(v[i], T)}</span></div>`).join('');
}
// Pop-ups com figuras do Relatório 2 (assets/, ver assets/LEIAME.md)
const FIG = {
  tip: { t: 'Classificação dos imóveis por tipologia', cap: 'Figura 45. Árvore de classificação dos imóveis (Relatório 2, p. 79). Cada cadastro recebe uma só tipologia: a do primeiro critério atendido.', img: 'assets/fig45_arvore_tipologia.png', dl: 'assets/fig46_mapa_tipologia.jpg', dlt: 'Baixar Figura 46 (mapa do CAR por tipologia)' },
  ar: { t: 'Dinâmica da aridez e ASD', cap: 'Figura 51. Distribuição espacial das classes A–F de dinâmica da aridez e enquadramento climático como ASD no bioma Caatinga (Relatório 2, p. 107).', img: 'assets/fig51_mapa_aridez.jpg', dl: 'assets/fig51_mapa_aridez.jpg', dlt: 'Baixar Figura 51' },
  rf: { t: 'Classificação do risco fundiário', cap: 'Figura 50. Árvore de classificação do risco fundiário (Relatório 2, p. 102).', img: 'assets/fig50_arvore_risco.png', dl: 'assets/fig50_arvore_risco.png', dlt: 'Baixar Figura 50' },
  deg: { t: 'Área potencialmente degradada', cap: 'Quadro 3. Resumo dos critérios aplicados na estimativa de áreas potencialmente degradadas (Relatório 2, p. 88).', html: `<table><thead><tr><th>Uso da terra no MapBiomas</th><th>Classificação</th><th>Regra</th></tr></thead><tbody><tr><td>Pastagem</td><td>Degradada</td><td style="white-space:normal;text-align:left">Degradação intermediária ou severa no LAPIG em pelo menos quatro dos cinco anos entre 2019 e 2023.</td></tr><tr><td>Pastagem</td><td>Não degradada</td><td style="white-space:normal;text-align:left">Não atende ao critério de persistência temporal do LAPIG.</td></tr><tr><td>Demais usos</td><td>Degradado</td><td style="white-space:normal;text-align:left">Ocorrência de nível 3, 4 ou 5 do LDI.</td></tr><tr><td>Demais usos</td><td>Não degradado</td><td style="white-space:normal;text-align:left">Categoria conservada ou níveis 1 ou 2 do LDI.</td></tr></tbody></table><p class="hint" style="margin-top:12px">No BI, a área potencialmente degradada soma agricultura + pastagem + mosaico de usos (definição de 24/11/2026).</p>` },
};
function openFig(k) {
  const f = FIG[k]; $('fig-t').textContent = f.t; $('fig-cap').textContent = f.cap;
  $('fig-body').innerHTML = f.html || `<img src="${f.img}" alt="${esc(f.cap)}">`;
  const im = $('fig-body').querySelector('img'); if (im) im.onerror = () => { $('fig-body').innerHTML = `<div class="ph-fig">Não foi possível abrir a imagem.<br><b>${esc(f.cap)}</b></div>` };
  const dl = $('fig-dl'); dl.hidden = !f.dl; if (f.dl) { dl.href = f.dl; dl.textContent = f.dlt; dl.setAttribute('download', f.dl.split('/').pop()) }
  $('fig-ov').hidden = false; $('fig-x').focus();
}
const figClose = () => { $('fig-ov').hidden = true; document.querySelector('.figm').classList.remove('full'); $('fig-ov').classList.remove('fig-ov-full'); $('fig-exp').textContent = 'Expandir' };
const z4 = () => [0, 0, 0, 0];
function tipTable(el, t, uso) {
  const add = (a, x) => ({ n: a.n + x.n, area: a.area + x.area, deg: a.deg + x.deg, elig: a.elig + x.elig, f: a.f.map((v, i) => v + x.f[i]) }), Z = { n: 0, area: 0, deg: 0, elig: 0, f: z4() }, T = [...t.values()].reduce(add, Z);
  const us = [...uso].sort();
  const tr = (l, x, c = '', st = '') => `<tr${c}${st}><td>${l}</td><td>${nf0.format(x.n)}</td><td>${nf0.format(x.area)}</td><td>${nf0.format(x.deg)}</td>${us.map(u => `<td>${nf0.format(x.f[u])}</td>`).join('')}<td>${pc(x.deg, T.deg)}</td><td>${pc(x.deg, x.area)}</td><td>${nf0.format(x.elig)}</td></tr>`;
  const CL = { af: '#4f6b55', hib: '#c4761a', eco: '#3d6e8f' };
  const outros = [...t.keys()].filter(k => !TIP.includes(k) && t.get(k).n);
  el.innerHTML = `<thead><tr><th>Tipologia</th><th>Imóveis</th><th>Área (ha)</th><th>Área pot. degradada (ha)</th>${us.map(u => `<th>…em ${USOS[u][0].toLowerCase()}</th>`).join('')}<th>% do total degradado</th><th>% da área do grupo</th><th>Degradada em elegíveis (ha)</th></tr></thead><tbody>` +
    TIPG.map(([k, l, ix]) => tr(`<span class="dot"></span>Subtotal ${l}`, ix.reduce((a, i) => add(a, t.get(TIP[i])), Z), ' class="gt"', ` style="--bc:${CL[k]}"`) + ix.map(i => tr('&nbsp;&nbsp;&nbsp;&nbsp;' + TIP[i], t.get(TIP[i]))).join('')).join('') +
    outros.map(k => tr(esc(k), t.get(k))).join('') + tr('Total', T, ' class="sel"') + '</tbody>'
}
function usoBlock(t, uso) { // quadro de uso da terra
  const vs = [...t.values()], U = vs.reduce((a, x) => a.map((v, i) => v + x.u[i]), z4()), F = vs.reduce((a, x) => a.map((v, i) => v + x.f[i]), z4()), mx = Math.max(...U, 1);
  $('uso-geo').innerHTML = USOS.map(([l, col], i) => `<div class="row"><span><span class="dot" style="--bc:${col}"></span>${l}</span><div class="track"><i style="width:${100 * F[i] / mx}%;background:#d73027"></i><i style="width:${100 * (U[i] - F[i]) / mx}%;background:${col}"></i></div><span class="v">${nf0.format(U[i])} ha · <b class="red">${pc(F[i], U[i])} degradada</b></span></div>`).join('');
  $('usog-geo').innerHTML = TIPG.map(([g, l, ix]) => {
    const u = ix.reduce((a, i) => a.map((v, j) => v + t.get(TIP[i]).u[j]), z4()), s = u.reduce((a, b) => a + b, 0) || 1;
    return `<div class="row"><span>${l}</span><div class="track">${USOS.map(([lb, col], j) => `<i title="${lb}: ${pc(u[j], s)}" style="width:${100 * u[j] / s}%;background:${col}"></i>`).join('')}</div><span class="v">${pc(u[1], s)} pastagem</span></div>`
  }).join('');
}
// ---------- aba 4 ----------
let intU, intF, intSt = { m: 'q5', p: 'lr', fx: '', mv: 'n' };
async function integ() {
  if (!status.imoveis) return;
  const cods = universe(), fs = intSt.rc === 'sel' ? intU.get() : [], uni = new Set(cods.filter(c => passes(c, fs))), fi = intF.get();
  // funil: sem filtros de imóvel → recorte → filtros
  const a0 = await aggAll(SEM_F()); if (a0 === undefined) return;
  const agg = await aggAll(fi); if (agg === undefined) return;
  const sum = (a, set) => { let n = 0, area = 0, deg = 0, m = 0; for (const [c, o] of a.by) if (set.has(c)) { n += o.n; area += o.area; deg += o.deg; if (o.n > 0) m++ } return { n, area, deg, m } };
  const s0 = sum(a0, new Set(cods)), s1 = sum(a0, uni), s2 = sum(agg, uni); s0.m = cods.length; s1.m = uni.size;
  const sh = (a, b) => b ? ` <em>(${nf.format(100 * a / b)}%)</em>` : '';
  const card = (l, k, u) => `<div class="kc"><span class="l">${l}</span><b>${nf0.format(s2[k])}${u}</b><div class="f">${UF || 'Caatinga'} ${nf0.format(s0[k])} → recorte ${nf0.format(s1[k])}${sh(s1[k], s0[k])} → filtros ${nf0.format(s2[k])}${sh(s2[k], s0[k])}</div></div>`;
  $('k-int').innerHTML = card('Municípios', 'm', '') + card('Imóveis', 'n', '') + card('Área dos imóveis', 'area', ' ha') + card('Área pot. degradada', 'deg', ' ha');
  // impacto de cada condição do recorte (quantos municípios ela elimina sozinha)
  intU.impact(f => { const k = cods.filter(c => !passes(c, [f])).length; return `elimina ${nf0.format(k)}` });
  // etiquetas das condições ativas
  const ch = [];
  if (intSt.rc === 'sel') intU.rows().forEach((f, i) => { if (f.x != null && f.x !== '' && isFinite(f.x)) ch.push(`<span class="chip">${esc(flabel([f]))}<button data-rmf="${i}" aria-label="Remover">×</button></span>`) });
  ch.push(...imovelChips(fi));
  $('chips-int').innerHTML = ch.join('');
  // mapa único com alternância
  const vals = new Map(); for (const c of uni) { const o = agg.by.get(c); vals.set(c, o ? (intSt.mv === 'n' ? o.n : o.deg) : 0) }
  const b = breaksFor([...vals.values()], intSt.m, intSt.fx), unit = intSt.mv === 'n' ? 'n' : 'ha', title = intSt.mv === 'n' ? 'Imóveis' : 'Área pot. degradada';
  const o = { cods, inSet: uni, showOut: false, vals, breaks: b, colors: ramp(intSt.p, b.length + 1), hatch: null, unit, title };
  drawMap($('m1'), o); $('l1').innerHTML = legendHTML(o);
  tipTable($('tip-int'), sumBy(agg.tip, uni, TIP), agg.uso);
  intSt.view = { uf: UF || null, universo_municipios: intU.json(), filtros_imovel: intF.json(), mapa: intSt.mv, legenda: intSt.m, limites_fixos: intSt.m === 'fx' ? intSt.fx : null, paleta: intSt.p };
}

// Arranjos já existentes (APLs): mapa categórico estático por grupo de setor e lista (aba 4; segue só a UF do topo)
const APL_MULT = '#3b2a6e';
function apls() {
  if (!APL.length) { $('apl-int').innerHTML = '<p class="hint">Falta data/apl_municipio.parquet (scripts/preparar_apl.py).</p>'; return }
  const cods = universe(), cs = new Set(cods), cat = new Map(), lab = new Map(), cnt = new Map(), GC = Object.fromEntries(APLG.map(([k, l, c]) => [k, [l, c]]));
  for (const c of cods) {
    const g = [...new Set(aplOf(c).map(a => a.setor_grupo))]; if (!g.length) continue;
    const k = g.length > 1 ? 'mult' : g[0]; cat.set(c, k === 'mult' ? APL_MULT : GC[k][1]); cnt.set(k, (cnt.get(k) || 0) + 1);
    lab.set(c, aplOf(c).map(a => `${a.nome_apl} (${GC[a.setor_grupo][0].toLowerCase()})`).join('; '));
  }
  const o = { cods, inSet: cs, showOut: false, vals: lab, cat, breaks: [], colors: [], title: 'APLs por setor' };
  drawMap($('m-apl'), o);
  const sem = cods.length - cat.size;
  $('l-apl').innerHTML = `<b>Municípios por setor do APL</b>` + APLG.filter(([k]) => cnt.get(k)).sort((a, b) => cnt.get(b[0]) - cnt.get(a[0])).map(([k, l, c]) => `<div><i style="background:${c}"></i>${l} <span class="u">(${cnt.get(k)})</span></div>`).join('') +
    (cnt.get('mult') ? `<div><i style="background:${APL_MULT}"></i>dois ou mais setores <span class="u">(${cnt.get('mult')})</span></div>` : '') + `<div><i style="background:var(--zero)"></i>sem APL <span class="u">(${sem})</span></div>` + biomaLeg();
  const by = new Map(); for (const a of APL) if (cs.has(a.codmun)) { let x = by.get(a.apl_id); if (!x) by.set(a.apl_id, x = { ...a, muns: [] }); x.muns.push(RM.get(a.codmun)?.municipio || a.codmun) }
  const L = [...by.values()].sort((a, b) => b.muns.length - a.muns.length || a.nome_apl.localeCompare(b.nome_apl, 'pt'));
  $('h-apl').textContent = `${L.length} APLs em ${cat.size} dos ${cods.length} municípios${UF ? ' da UF' : ''}`;
  $('t-apl').innerHTML = '<thead><tr><th>APL</th><th>Setor (planilha)</th><th>Grupo</th><th>UF</th><th>Cidade polo</th><th>Municípios na base</th></tr></thead><tbody>' +
    L.map(a => `<tr><td style="white-space:normal">${esc(a.nome_apl)}</td><td style="white-space:normal;text-align:left">${esc(a.setor)}</td><td style="text-align:left"><span class="dot" style="--bc:${GC[a.setor_grupo][1]}"></span>${esc(GC[a.setor_grupo][0])}</td><td>${a.uf}</td><td style="text-align:left">${esc(a.cidade_polo)}</td><td style="white-space:normal;text-align:left" title="${esc(a.muns.join(', '))}">${a.muns.length}: ${esc(a.muns.slice(0, 6).join(', '))}${a.muns.length > 6 ? '…' : ''}</td></tr>`).join('') + '</tbody>';
}

// ---------- inicialização ----------
let mbI, mbS, mbG;
async function renderAll() {
  ibge(); sicor(); const vis = document.querySelector('.pane:not([hidden])').id;
  if (vis === 'p-ibge') mbI.render(); if (vis === 'p-sicor') mbS.render();
  if (vis === 'p-geo') { await geo(); mbG.render() } if (vis === 'p-int') { apls(); await integ() }
}
// Visão da aba aberta, anexada ao feedback (seção 10.1) para a equipe reproduzir o que o usuário via
function visaoAtual() {
  const vis = document.querySelector('.pane:not([hidden])')?.id;
  if (vis === 'p-ibge') return { agrupamento: $('ag-ibge').value || null, mapa: mbI?.view ?? null };
  if (vis === 'p-sicor') return { agrupamento: $('ag-sicor').value || null, mapa: mbS?.view ?? null };
  if (vis === 'p-geo') return { filtros_imovel: geoF?.json() ?? null, mapa: mbG?.view ?? null };
  if (vis === 'p-int') return intSt.view ?? null;
  if (vis === 'p-sql') return { sql: (document.querySelector('#p-sql [data-sql]')?.value || '').slice(0, 4000) };
  return null;
}
function semImoveis() {
  const msg = `<div class="warn"><b>Dados por imóvel indisponíveis.</b> ${esc(status.imoveisMsg)} Esse arquivo não fica no git: é gerado por Pedro com <code>scripts/extrair_imoveis.py</code> ou distribuído à parte. Copie-o para <code>data/local/imoveis.parquet</code> e recarregue a página.${status.resumo ? ' Nas abas 1 e 2, as variáveis Geo usam o resumo municipal versionado (<code>data/geo_mun_resumo.parquet</code>).' : ''}</div>`;
  for (const id of ['p-geo', 'p-int']) { const p = $(id); [...p.children].forEach(c => { if (!c.hasAttribute('data-fixo')) c.hidden = true }); p.insertAdjacentHTML('afterbegin', msg) } // o bloco do bioma (valores fixos) continua visível
}
async function main() {
  const t0 = performance.now();
  $('load').textContent = 'Iniciando o DuckDB…';
  await init();
  $('load').textContent = 'Lendo os dados…';
  R = await q('SELECT * FROM socio_municipal ORDER BY codmun');
  const g = await (await fetch(dataUrl('data/malha_municipios.json'))).json();
  for (const [c, o] of Object.entries(g.mun)) { POLY[c] = o.r; AREA.set(c, o.a) }
  BIOMA = g.bioma || [];
  for (const r of R) RM.set(r.codmun, r);
  // Agregação "todos os imóveis" em cache (recortes com variáveis geo e variáveis geo nas abas 1 e 2)
  if (status.pontos) PTS = await q(`SELECT id, organizacao AS org, classe, cadeia, local_citado AS local, precisao AS prec, codmun, municipio AS mun, uf, lat::DOUBLE AS lat, lon::DOUBLE AS lon
    FROM arranjos_pontos WHERE precisao <> 'sem_local' AND coalesce(lat, '') <> '' AND coalesce(lon, '') <> '' ORDER BY id::INT, codmun`);
  if (status.apl) { APL = await q('SELECT * FROM apl_municipio ORDER BY apl_id, codmun'); for (const a of APL) (APLM.get(a.codmun) || APLM.set(a.codmun, []).get(a.codmun)).push(a) }
  if (status.imoveis) BASEAGG = await aggAll(null);
  else if (status.resumo) { const rs = await q('SELECT * FROM geo_mun_resumo'); BASEAGG = { by: new Map(rs.map(r => [r.codmun, r])) } }
  UFS = [...new Set(R.map(r => r.uf))].sort();
  $('uf').innerHTML = opt('', 'Caatinga (todas)') + UFS.map(u => opt(u, u)).join('');
  $('ag-ibge').innerHTML = agOptions('', 'pr'); $('ag-sicor').innerHTML = agOptions('', 'cr');
  const all = Object.keys(V);
  mbI = MapBuilder($('mb-ibge'), { keys: varsOf(['IBGE']), filterKeys: all, agSel: () => $('ag-ibge').value, geoAgg: () => BASEAGG });
  mbS = MapBuilder($('mb-sicor'), { keys: varsOf(['SICOR']), filterKeys: all, agSel: () => $('ag-sicor').value, geoAgg: () => BASEAGG });
  geoF = ImovelFilters($('if-geo'), async () => { await geo(); mbG.render() });
  mbG = MapBuilder($('mb-geo'), { keys: varsOf(['Geo']), filterKeys: all, agSel: () => '', geoAgg: () => geoAgg });
  mbG.extra = () => ({ filtros_imovel: geoF.json() });
  $('fl-int').innerHTML = `<div class="box b1" style="max-width:900px"><div class="bh"><span class="n">1</span>Recorte de municípios<button class="clr" data-clr>Limpar</button></div><div class="chk"><label><input type="radio" name="rc-int" value="todos" checked> Todos</label><label><input type="radio" name="rc-int" value="sel"> Seleção personalizada</label></div><div data-f hidden></div></div>`;
  intU = FilterList($('fl-int').querySelector('[data-f]'), all, integ, 'Municípios que atendem a todas as condições:'); intU.set([{ v: 'vbp', ag: '', op: '>', x: null }]); intSt.rc = 'todos';
  $('fl-int').addEventListener('change', e => { if (e.target.name === 'rc-int') { intSt.rc = e.target.value; $('fl-int').querySelector('[data-f]').hidden = intSt.rc !== 'sel'; integ() } });
  $('fl-int').addEventListener('click', e => { if (e.target.dataset.clr == null) return; intU.set([]); intSt.rc = 'todos'; $('fl-int').querySelector('[value=todos]').checked = true; $('fl-int').querySelector('[data-f]').hidden = true; integ() });
  intF = ImovelFilters($('if-int'), integ);
  $('ctl-int').innerHTML = `<div class="box b3" style="max-width:640px"><div class="bh"><span class="n">3</span>Legenda do mapa<button class="clr" data-clr>Limpar</button></div><div class="fr">${legendCtl()}</div></div>`;
  $('ctl-int').addEventListener('change', e => { const k = e.target.dataset.k; if (k) { intSt[k] = e.target.value; $('ctl-int').querySelector('[data-fx]').hidden = intSt.m !== 'fx'; integ() } });
  $('ctl-int').addEventListener('input', e => { if (e.target.dataset.k === 'fx') { intSt.fx = e.target.value; integ() } });
  $('ctl-int').addEventListener('click', e => { if (e.target.dataset.clr == null) return; Object.assign(intSt, { m: 'q5', p: 'lr', fx: '' }); const c = $('ctl-int'); c.querySelector('[data-k=m]').value = 'q5'; c.querySelector('[data-k=p]').value = 'lr'; c.querySelector('[data-k=fx]').value = ''; c.querySelector('[data-fx]').hidden = true; integ() });
  $('cp-int').onclick = () => { const t = JSON.stringify(intSt.view, null, 1); $('vj-int').hidden = false; $('vj-int').textContent = t; navigator.clipboard?.writeText(t).catch(() => { }) };
  new ResizeObserver(() => { if ($('m1').offsetParent) integ() }).observe($('m1'));
  new ResizeObserver(() => { if ($('m-apl').offsetParent) apls() }).observe($('m-apl'));
  document.querySelector('#p-int .seg').addEventListener('click', e => { const v = e.target.dataset.mv; if (!v) return; intSt.mv = v; document.querySelectorAll('#p-int .seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mv === v)); integ() });
  $('chips-int').addEventListener('click', e => { const i = e.target.dataset.rmf; if (i != null) intU.remove(+i) });
  const setBar = () => document.documentElement.style.setProperty('--barh', document.querySelector('.bar').offsetHeight + 'px'); setBar(); new ResizeObserver(setBar).observe(document.querySelector('.bar'));
  $('ag-ibge').onchange = () => { ibge(); mbI.render() }; $('ag-sicor').onchange = () => { sicor(); mbS.render() };
  $('uf').onchange = () => { UF = $('uf').value; renderAll() };
  document.querySelectorAll('[role=tab]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[role=tab]').forEach(x => x.setAttribute('aria-selected', x === b));
    document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== 'p-' + b.dataset.p); if (b.dataset.p !== 'sql') renderAll()
  }));
  document.addEventListener('click', e => {
    if (e.target.closest('[data-pts]')) { PTS_ON = !PTS_ON; renderAll() }
    const fb = e.target.closest('[data-fig]'); if (fb) { e.preventDefault(); openFig(fb.dataset.fig) }
    const pb = e.target.closest('[data-pie]'); if (pb) { pieM = pb.dataset.pie; document.querySelectorAll('[data-pie]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pie === pieM)); geo() }
    const ab = e.target.closest('[data-arrf]'); if (ab) { arrfM = ab.dataset.arrf; document.querySelectorAll('[data-arrf]').forEach(b => b.setAttribute('aria-pressed', b.dataset.arrf === arrfM)); geo() }
  });
  $('fig-x').onclick = figClose; $('fig-ov').addEventListener('click', e => { if (e.target.id === 'fig-ov') figClose() });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('fig-ov').hidden) figClose() });
  $('fig-exp').onclick = () => { const m = document.querySelector('.figm'), f = m.classList.toggle('full'); $('fig-ov').classList.toggle('fig-ov-full', f); $('fig-exp').textContent = f ? 'Reduzir' : 'Expandir' };
  bioma();
  if (!status.imoveis) semImoveis();
  initConsole($('p-sql'));
  $('load').hidden = true;
  initFeedback(visaoAtual); // não bloqueia: o botão aparece só se o receptor responder
  await renderAll();
  console.info(`[BI] pronto em ${Math.round(performance.now() - t0)} ms; imóveis: ${status.imoveis}`);
}
main().catch(e => { console.error(e); $('load').hidden = false; $('load').textContent = 'Não foi possível carregar os dados: ' + e.message });
