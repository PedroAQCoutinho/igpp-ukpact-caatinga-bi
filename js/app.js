// BI Caatinga — porte do prototipo/app.js para dados reais (DuckDB-WASM + Parquet).
// Comportamento e visual seguem o protótipo aprovado; mudanças de dados estão comentadas.
import { init, q, status, dataUrl } from './db.js';
import { TIP, AR, RF, CRIT, CEN, USOS, DEF_USO, aggAll, sumBy } from './geo.js';
import { initConsole } from './console.js';

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
const kpi = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
const bar = (lab, w, val, c, dim) => `<div class="row"${dim ? ' style="opacity:.35"' : ''}><span>${esc(lab)}</span><div class="track"><i style="width:${Math.max(0, w)}%;background:${c || 'var(--main)'}"></i></div><span class="v">${val}</span></div>`;
const opt = (v, l, s) => `<option value="${esc(v)}"${s ? ' selected' : ''}>${esc(l)}</option>`;

const AG = { agroextrativismo: 'Agroextrativismo', aves_e_suinos: 'Aves e suínos', bovinos_e_bubalinos: 'Bovinos e bubalinos', caprinos_e_ovinos: 'Caprinos e ovinos', fruticultura_rustica: 'Fruticultura rústica', lavouras_de_sequeiro: 'Lavouras de sequeiro', lavouras_de_aeh: 'Lavouras de AEH', fibras_xerofitas: 'Fibras xerófitas', outra_producao: 'Outra produção', base_forrageira: 'Base forrageira', nao_classificado: 'Não classificado' };
const COL = { agroextrativismo: '#7b8f3a', aves_e_suinos: '#c9a227', bovinos_e_bubalinos: '#8c4a2f', caprinos_e_ovinos: '#d17a3a', fruticultura_rustica: '#b84a6b', lavouras_de_sequeiro: '#4f6b55', lavouras_de_aeh: '#3d7ea6', fibras_xerofitas: '#6f5ba7', outra_producao: '#9aa79f', base_forrageira: '#5a9e8c', nao_classificado: '#c7ccc8' };
const PAL = { lr: ['Laranja → roxo', ['#fde0b6', '#f6a75f', '#d9744a', '#a3568a', '#6b4c9a', '#3b2a6e']], az: ['Cinza → azul', ['#e8edf1', '#b7cde0', '#7fa9cc', '#4c84b5', '#2b5f93', '#173f6b']], gr: ['Verde → vermelho', ['#1a9850', '#91cf60', '#d9ef8b', '#fee08b', '#fc8d59', '#d73027']], rg: ['Vermelho → verde', ['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#91cf60', '#1a9850']] };
const METH = { q4: 'Quartis', q5: 'Quintis', q10: 'Decis', eq: 'Intervalos iguais (5)', jk: 'Quebras naturais (5)', fx: 'Limites fixos' };
const OPS = { '>': '>', '>=': '≥', '<': '<', '<=': '≤' };

let R = [], RM = new Map(), UF = '', UFS = [], POLY = {}, AREA = new Map(), BIOMA = [], BASEAGG = { by: new Map() };

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
  deg: { l: 'Área potencialmente degradada (usos escolhidos)', u: 'ha', g: 'Geo', ext: 1, geo: 1, f: (r, a, g) => g?.deg ?? null },
  ...Object.fromEntries([['ag', 'Agricultura', 0], ['pa', 'Pastagem', 1], ['mo', 'Mosaico de usos', 2], ['vn', 'Vegetação nativa', 3]].flatMap(([k, l, i]) => [
    ['u_' + k, { l: 'Área de ' + l.toLowerCase(), u: 'ha', g: 'Geo', ext: 1, geo: 1, f: (r, a, g) => g?.u?.[i] ?? null }],
    ['f_' + k, { l: l + ' potencialmente degradada', u: 'ha', g: 'Geo', ext: 1, geo: 1, f: (r, a, g) => g?.f?.[i] ?? null }],
    ['p_' + k, { l: l + ': % degradada', u: '%', g: 'Geo', geo: 1, f: (r, a, g) => g?.f ? rat(g.f[i], g.u[i]) : null }]])),
  degp: { l: 'Área degradada / área dos imóveis', u: '%', g: 'Geo', geo: 1, f: (r, a, g) => g ? rat(g.deg, g.area) : null },
  eleg: { l: 'Área degradada em imóveis aptos', u: 'ha', g: 'Geo', ext: 1, geo: 1, f: (r, a, g) => g?.elig ?? null },
  aptp: { l: 'Imóveis aptos (todas as salvaguardas)', u: '%', g: 'Geo', geo: 1, f: (r, a, g) => g ? rat(g.apt, g.n) : null },
};
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
function ImovelFilters(el, onChange, { cenario = false } = {}) {
  const grp = (cls, gk, label, items, name) => `<div class="grp g-${cls}"><label><input type="checkbox" data-grp="${gk}" checked> ${label}</label><div class="chk">${items.map(([i, l, sm]) => `<label><input type="checkbox" data-g="${name}" data-gr="${gk}" value="${i}" checked> ${esc(l)}${sm ? ` <small>${esc(sm)}</small>` : ''}</label>`).join('')}</div></div>`;
  el.innerHTML = `<div class="maps2">
 <fieldset><legend>Tipologia</legend>${TIPG.map(([k, l, ix]) => grp(k, 't-' + k, l, ix.map(i => [i, TIP[i]]), 'tip')).join('')}</fieldset>
 <fieldset><legend>Dinâmica da aridez (ASD = área suscetível à desertificação)</legend>${ARG.map(([k, l, it]) => grp(k, 'a-' + k, l, it.map(([i, c, d]) => [i, c, d]), 'ar')).join('')}
 <div class="quick"><button data-q="asd">Só em ASD hoje (A, B, C, E)</button><button data-q="noasd">Só fora de ASD (D, F)</button><button data-q="all">Todas</button></div></fieldset>
 <fieldset><legend>Risco fundiário</legend><div class="chk" style="display:grid;gap:4px">${RFL.map(([l, d], i) => `<label><input type="checkbox" data-g="rf" value="${i}" checked> ${l} <small>(${esc(d)})</small></label>`).join('')}</div></fieldset>
 <fieldset><legend>Uso da terra: o que entra na área potencialmente degradada</legend><div class="chk">${USOS.map(([l, col], i) => `<label><input type="checkbox" data-g="uso" value="${i}"${DEF_USO.has(i) ? ' checked' : ''}> <span class="dot" style="--bc:${col}"></span>${l}</label>`).join('')}</div><p class="hint">Padrão: agricultura + pastagem (definição de Pedro, 24/11/2026). Os quadros de uso mostram os quatro usos de qualquer forma.</p></fieldset>
 <fieldset><legend>Degradação e salvaguardas</legend>
 <div class="fr">Área potencialmente degradada ≥ <input type="number" data-k="degmin" min="0" placeholder="ha"><span class="u">ha</span></div>
 <label class="fr">Salvaguardas <select data-k="apt">${opt('t', 'Todos os imóveis')}${opt('s', 'Só aptos em todas')}${opt('n', 'Só não aptos')}</select></label>
 ${cenario ? `<label class="fr">Cenário de salvaguardas <select data-k="cen">${Object.entries(CEN).map(([k, [, l]]) => opt(k, l, k === 'com')).join('')}</select></label>` : ''}
 <div><button class="clr" data-reset style="--bc:#4f6b55">Limpar filtros de imóvel</button></div></fieldset></div>`;
  const sync = () => el.querySelectorAll('[data-grp]').forEach(g => { const ch = [...el.querySelectorAll(`[data-gr="${g.dataset.grp}"]`)], n = ch.filter(x => x.checked).length; g.checked = n === ch.length; g.indeterminate = n > 0 && n < ch.length });
  let t = null; const deb = () => { clearTimeout(t); t = setTimeout(onChange, 250) };
  el.addEventListener('change', e => { const g = e.target.dataset.grp; if (g) el.querySelectorAll(`[data-gr="${g}"]`).forEach(x => x.checked = e.target.checked); sync(); onChange() });
  el.addEventListener('input', e => { if (e.target.type === 'number') deb() });
  el.addEventListener('click', e => {
    const qk = e.target.dataset.q; if (qk) { el.querySelectorAll('[data-g=ar]').forEach(x => x.checked = qk === 'all' || (qk === 'asd') === [0, 1, 2, 4].includes(+x.value)); sync(); onChange() }
    if (e.target.dataset.reset != null) { el.querySelectorAll('input[type=checkbox]').forEach(x => x.checked = x.dataset.g === 'uso' ? DEF_USO.has(+x.value) : true); el.querySelector('[data-k=degmin]').value = ''; el.querySelector('[data-k=apt]').value = 't'; const c = el.querySelector('[data-k=cen]'); if (c) c.value = 'com'; sync(); onChange() }
  });
  return {
    get() {
      const g = n => new Set([...el.querySelectorAll(`[data-g=${n}]:checked`)].map(x => +x.value)); const v = el.querySelector('[data-k=degmin]').value;
      return { tip: g('tip'), ar: g('ar'), rf: g('rf'), uso: g('uso'), degmin: v === '' ? null : +v, apt: el.querySelector('[data-k=apt]').value, cen: el.querySelector('[data-k=cen]')?.value || 'com' }
    },
    json() { const f = this.get(); return { tipologias: [...f.tip].map(i => TIP[i]), aridez: [...f.ar].map(i => AR[i]), risco_fundiario: [...f.rf].map(i => RFL[i][0]), usos_area_degradada: [...f.uso].map(i => USOS[i][0]), area_degradada_min_ha: f.degmin, salvaguardas: f.apt, cenario_salvaguardas: CEN[f.cen][0] } }
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
    const fill = !inn ? 'var(--out)' : o.blank ? 'var(--blank)' : x == null ? 'var(--nd)' : x === 0 ? 'var(--zero)' : o.colors[clsOf(x, o.breaks)];
    g += `<path class="m" data-c="${c}" d="${path(c)}" fill="${fill}" fill-rule="evenodd"/>`;
  }
  if (o.hatch) for (const c of drawn) if (o.hatch.has(c) && o.inSet.has(c)) g += `<path d="${path(c)}" fill="url(#${id})" fill-rule="evenodd" pointer-events="none"/>`;
  if (BIOMA.length) g += `<path class="bioma" d="${ringsPath(BIOMA)}" pointer-events="none"/>`;
  box.innerHTML = `<svg role="img" aria-label="${esc(o.title || 'Mapa municipal')}"${o.blank ? ' class="blank"' : ''}>${g}</svg><div class="tip" hidden></div>`;
  const tip = box.querySelector('.tip');
  box.querySelector('svg').onmousemove = e => {
    const c = e.target.dataset?.c; if (!c) { tip.hidden = true; return } const r = RM.get(c), x = o.vals.get(c), b = box.getBoundingClientRect();
    tip.textContent = `${r.municipio} (${r.uf})${o.blank ? (o.inSet.has(c) ? '' : ' · fora do recorte') : ': ' + (o.inSet.has(c) ? (x == null ? 'sem dado' : fmt(x) + ' ' + o.unit) : 'fora do recorte')}${o.hatch && o.hatch.has(c) ? ' · hachura' : ''}`; tip.hidden = false;
    let lx = e.clientX - b.left + 12; if (lx > W - tip.offsetWidth - 4) lx = e.clientX - b.left - tip.offsetWidth - 12; tip.style.left = lx + 'px'; tip.style.top = (e.clientY - b.top + 12) + 'px'
  };
  box.querySelector('svg').onmouseleave = () => tip.hidden = true;
}
const biomaLeg = () => BIOMA.length ? `<div><i style="background:none;border:0;border-top:2px dashed var(--mut);height:0"></i>limite do bioma Caatinga (IBGE 2019)</div>` : '';
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
async function geo() {
  if (!status.imoveis) return;
  const fi = geoF.get(), a = await aggAll(fi); if (a === undefined) return; geoAgg = a;
  const uni = new Set(universe()); let n = 0, ar = 0, d = 0, e = 0;
  for (const [c, o] of a.by) if (uni.has(c)) { n += o.n; ar += o.area; d += o.deg; e += o.elig }
  $('k-geo').innerHTML = kpi(nf0.format(n), 'Imóveis na seleção') + kpi(nf0.format(ar) + ' ha', 'Área dos imóveis') + kpi(nf0.format(d) + ' ha', 'Área potencialmente degradada') + kpi(nf0.format(e) + ' ha', 'Degradada em imóveis aptos');
  const st = sumBy(a.tip, uni, TIP); tipTable($('tip-geo'), st, a.uso); usoBlock(st, a.uso);
  const sa = sumBy(a.ar, uni, AR), sr = sumBy(a.rf, uni, RF);
  const arL = [...AR.map((k, i) => [ARL[i], sa.get(k).area]), ...[...sa.keys()].filter(k => !AR.includes(k)).map(k => [k, sa.get(k).area])];
  const AC = ['#b5543a', '#b5543a', '#8a8f8c', '#8a8f8c', '#3d6e8f', '#3d6e8f', '#c7ccc8'], am = Math.max(...arL.map(x => x[1]), 1);
  $('ar-geo').innerHTML = arL.map(([l, v], i) => bar(l, 100 * v / am, nf0.format(v) + ' ha', AC[Math.min(i, 6)])).join('');
  const rfL = [...RF.map((k, i) => [`${RFL[i][0]} (${RFL[i][1]})`, sr.get(k).area]), ...[...sr.keys()].filter(k => !RF.includes(k)).map(k => [k, sr.get(k).area])], rm = Math.max(...rfL.map(x => x[1]), 1);
  $('rf-geo').innerHTML = rfL.map(([l, v]) => bar(l, 100 * v / rm, nf0.format(v) + ' ha')).join('');
}
const z4 = () => [0, 0, 0, 0];
function tipTable(el, t, uso) {
  const add = (a, x) => ({ n: a.n + x.n, area: a.area + x.area, deg: a.deg + x.deg, elig: a.elig + x.elig, f: a.f.map((v, i) => v + x.f[i]) }), Z = { n: 0, area: 0, deg: 0, elig: 0, f: z4() }, T = [...t.values()].reduce(add, Z);
  const us = [...uso].sort();
  const tr = (l, x, c = '', st = '') => `<tr${c}${st}><td>${l}</td><td>${nf0.format(x.n)}</td><td>${nf0.format(x.area)}</td><td>${nf0.format(x.deg)}</td>${us.map(u => `<td>${nf0.format(x.f[u])}</td>`).join('')}<td>${pc(x.deg, T.deg)}</td><td>${pc(x.deg, x.area)}</td><td>${nf0.format(x.elig)}</td></tr>`;
  const CL = { af: '#4f6b55', hib: '#c4761a', eco: '#3d6e8f' };
  const outros = [...t.keys()].filter(k => !TIP.includes(k) && t.get(k).n);
  el.innerHTML = `<thead><tr><th>Tipologia</th><th>Imóveis</th><th>Área (ha)</th><th>Área pot. degradada (ha)</th>${us.map(u => `<th>…em ${USOS[u][0].toLowerCase()}</th>`).join('')}<th>% do total degradado</th><th>% da área do grupo</th><th>Degradada em aptos (ha)</th></tr></thead><tbody>` +
    TIPG.map(([k, l, ix]) => tr(`<span class="dot"></span>${l}`, ix.reduce((a, i) => add(a, t.get(TIP[i])), Z), ' class="gt"', ` style="--bc:${CL[k]}"`) + ix.map(i => tr('&nbsp;&nbsp;&nbsp;&nbsp;' + TIP[i], t.get(TIP[i]))).join('')).join('') +
    outros.map(k => tr(esc(k), t.get(k))).join('') + tr('Total', T, ' class="sel"') + '</tbody>'
}
function usoBlock(t, uso) { // quadro de uso da terra
  const vs = [...t.values()], U = vs.reduce((a, x) => a.map((v, i) => v + x.u[i]), z4()), F = vs.reduce((a, x) => a.map((v, i) => v + x.f[i]), z4()), mx = Math.max(...U, 1);
  $('uso-geo').innerHTML = USOS.map(([l, col], i) => `<div class="row"><span><span class="dot" style="--bc:${col}"></span>${l}${uso.has(i) ? ' ●' : ''}</span><div class="track"><i style="width:${100 * F[i] / mx}%;background:#b5543a"></i><i style="width:${100 * (U[i] - F[i]) / mx}%;background:${col};opacity:.55"></i></div><span class="v">${nf0.format(U[i])} ha · ${pc(F[i], U[i])}</span></div>`).join('');
  $('usog-geo').innerHTML = TIPG.map(([g, l, ix]) => {
    const u = ix.reduce((a, i) => a.map((v, j) => v + t.get(TIP[i]).u[j]), z4()), s = u.reduce((a, b) => a + b, 0) || 1;
    return `<div class="row"><span>${l}</span><div class="track">${USOS.map(([lb, col], j) => `<i title="${lb}: ${pc(u[j], s)}" style="width:${100 * u[j] / s}%;background:${col}"></i>`).join('')}</div><span class="v">${pc(u[1], s)} pasto</span></div>`
  }).join('');
}
// ---------- aba 4 ----------
let intU, intF, intSt = { m: 'q5', p: 'lr', fx: '', mv: 'n' };
async function integ() {
  if (!status.imoveis) return;
  const cods = universe(), fs = intSt.rc === 'sel' ? intU.get() : [], uni = new Set(cods.filter(c => passes(c, fs))), fi = intF.get();
  // funil: sem filtros de imóvel (mesmos usos) → recorte → filtros
  const semF = { tip: new Set(TIP.keys()), ar: new Set(AR.keys()), rf: new Set(RF.keys()), uso: fi.uso, degmin: null, apt: 't', cen: fi.cen };
  const a0 = await aggAll(semF); if (a0 === undefined) return;
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
  const off = (set, n, labs, name) => set.size < n ? `<span class="chip" style="--bc:#c4761a">${name}: ${[...set].sort().map(i => labs[i]).join(', ') || 'nenhum'}</span>` : '';
  ch.push(off(fi.tip, 8, TIP, 'Tipologias'), off(fi.ar, 6, AR, 'Aridez'), off(fi.rf, 5, RFL.map(r => r[0]), 'Risco'));
  ch.push(`<span class="chip" style="--bc:#c4761a">Degradada = ${[...fi.uso].sort().map(i => USOS[i][0].toLowerCase()).join(' + ') || 'nenhum uso'}</span>`);
  if (fi.degmin != null) ch.push(`<span class="chip" style="--bc:#c4761a">Degradada ≥ ${fmt(fi.degmin)} ha</span>`);
  if (fi.apt !== 't') ch.push(`<span class="chip" style="--bc:#c4761a">${fi.apt === 's' ? 'Só aptos' : 'Só não aptos'}</span>`);
  $('chips-int').innerHTML = ch.join('');
  // mapa único com alternância
  const vals = new Map(); for (const c of uni) { const o = agg.by.get(c); vals.set(c, o ? (intSt.mv === 'n' ? o.n : o.deg) : 0) }
  const b = breaksFor([...vals.values()], intSt.m, intSt.fx), unit = intSt.mv === 'n' ? 'n' : 'ha', title = intSt.mv === 'n' ? 'Imóveis' : 'Área pot. degradada';
  const o = { cods, inSet: uni, showOut: false, vals, breaks: b, colors: ramp(intSt.p, b.length + 1), hatch: null, unit, title };
  drawMap($('m1'), o); $('l1').innerHTML = legendHTML(o);
  tipTable($('tip-int'), sumBy(agg.tip, uni, TIP), agg.uso);
  intSt.view = { uf: UF || null, universo_municipios: intU.json(), filtros_imovel: intF.json(), mapa: intSt.mv, legenda: intSt.m, limites_fixos: intSt.m === 'fx' ? intSt.fx : null, paleta: intSt.p };
}

// ---------- inicialização ----------
let mbI, mbS, mbG;
async function renderAll() {
  ibge(); sicor(); const vis = document.querySelector('.pane:not([hidden])').id;
  if (vis === 'p-ibge') mbI.render(); if (vis === 'p-sicor') mbS.render();
  if (vis === 'p-geo') { await geo(); mbG.render() } if (vis === 'p-int') await integ()
}
function semImoveis() {
  const msg = `<div class="warn"><b>Dados por imóvel indisponíveis.</b> ${esc(status.imoveisMsg)} Esse arquivo não fica no git: é gerado por Pedro com <code>scripts/extrair_imoveis.py</code> ou distribuído à parte. Copie-o para <code>data/local/imoveis.parquet</code> e recarregue a página.${status.resumo ? ' Nas abas 1 e 2, as variáveis Geo usam o resumo municipal versionado (<code>data/geo_mun_resumo.parquet</code>).' : ''}</div>`;
  for (const id of ['p-geo', 'p-int']) { const p = $(id); [...p.children].forEach(c => c.hidden = true); p.insertAdjacentHTML('afterbegin', msg) }
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
  if (status.imoveis) BASEAGG = await aggAll(null);
  else if (status.resumo) { const rs = await q('SELECT * FROM geo_mun_resumo'); BASEAGG = { by: new Map(rs.map(r => [r.codmun, r])) } }
  UFS = [...new Set(R.map(r => r.uf))].sort();
  $('uf').innerHTML = opt('', 'Caatinga (todas)') + UFS.map(u => opt(u, u)).join('');
  $('ag-ibge').innerHTML = agOptions('', 'pr'); $('ag-sicor').innerHTML = agOptions('', 'cr');
  const all = Object.keys(V);
  mbI = MapBuilder($('mb-ibge'), { keys: varsOf(['IBGE']), filterKeys: all, agSel: () => $('ag-ibge').value, geoAgg: () => BASEAGG });
  mbS = MapBuilder($('mb-sicor'), { keys: varsOf(['SICOR']), filterKeys: all, agSel: () => $('ag-sicor').value, geoAgg: () => BASEAGG });
  geoF = ImovelFilters($('if-geo'), async () => { await geo(); mbG.render() }, { cenario: true });
  mbG = MapBuilder($('mb-geo'), { keys: varsOf(['Geo']), filterKeys: all, agSel: () => '', geoAgg: () => geoAgg });
  mbG.extra = () => ({ filtros_imovel: geoF.json() });
  $('fl-int').innerHTML = `<div class="box b1" style="max-width:900px"><div class="bh"><span class="n">1</span>Recorte de municípios<button class="clr" data-clr>Limpar</button></div><div class="chk"><label><input type="radio" name="rc-int" value="todos"> Todos</label><label><input type="radio" name="rc-int" value="sel" checked> Seleção personalizada</label></div><div data-f></div></div>`;
  intU = FilterList($('fl-int').querySelector('[data-f]'), all, integ, 'Municípios que atendem a todas as condições:'); intU.set([{ v: 'vbp', ag: 'caprinos_e_ovinos', op: '>', x: 50 }]); intSt.rc = 'sel';
  $('fl-int').addEventListener('change', e => { if (e.target.name === 'rc-int') { intSt.rc = e.target.value; $('fl-int').querySelector('[data-f]').hidden = intSt.rc !== 'sel'; integ() } });
  $('fl-int').addEventListener('click', e => { if (e.target.dataset.clr == null) return; intU.set([]); intSt.rc = 'todos'; $('fl-int').querySelector('[value=todos]').checked = true; $('fl-int').querySelector('[data-f]').hidden = true; integ() });
  intF = ImovelFilters($('if-int'), integ);
  $('ctl-int').innerHTML = `<div class="box b3" style="max-width:640px"><div class="bh"><span class="n">3</span>Legenda do mapa<button class="clr" data-clr>Limpar</button></div><div class="fr">${legendCtl()}</div></div>`;
  $('ctl-int').addEventListener('change', e => { const k = e.target.dataset.k; if (k) { intSt[k] = e.target.value; $('ctl-int').querySelector('[data-fx]').hidden = intSt.m !== 'fx'; integ() } });
  $('ctl-int').addEventListener('input', e => { if (e.target.dataset.k === 'fx') { intSt.fx = e.target.value; integ() } });
  $('ctl-int').addEventListener('click', e => { if (e.target.dataset.clr == null) return; Object.assign(intSt, { m: 'q5', p: 'lr', fx: '' }); const c = $('ctl-int'); c.querySelector('[data-k=m]').value = 'q5'; c.querySelector('[data-k=p]').value = 'lr'; c.querySelector('[data-k=fx]').value = ''; c.querySelector('[data-fx]').hidden = true; integ() });
  $('cp-int').onclick = () => { const t = JSON.stringify(intSt.view, null, 1); $('vj-int').hidden = false; $('vj-int').textContent = t; navigator.clipboard?.writeText(t).catch(() => { }) };
  new ResizeObserver(() => { if ($('m1').offsetParent) integ() }).observe($('m1'));
  document.querySelector('#p-int .seg').addEventListener('click', e => { const v = e.target.dataset.mv; if (!v) return; intSt.mv = v; document.querySelectorAll('#p-int .seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mv === v)); integ() });
  $('chips-int').addEventListener('click', e => { const i = e.target.dataset.rmf; if (i != null) intU.remove(+i) });
  const setBar = () => document.documentElement.style.setProperty('--barh', document.querySelector('.bar').offsetHeight + 'px'); setBar(); new ResizeObserver(setBar).observe(document.querySelector('.bar'));
  $('ag-ibge').onchange = () => { ibge(); mbI.render() }; $('ag-sicor').onchange = () => { sicor(); mbS.render() };
  $('uf').onchange = () => { UF = $('uf').value; renderAll() };
  document.querySelectorAll('[role=tab]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[role=tab]').forEach(x => x.setAttribute('aria-selected', x === b));
    document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== 'p-' + b.dataset.p); if (b.dataset.p !== 'sql') renderAll()
  }));
  if (!status.imoveis) semImoveis();
  initConsole($('p-sql'));
  $('load').hidden = true;
  await renderAll();
  console.info(`[BI] pronto em ${Math.round(performance.now() - t0)} ms; imóveis: ${status.imoveis}`);
}
main().catch(e => { console.error(e); $('load').hidden = false; $('load').textContent = 'Não foi possível carregar os dados: ' + e.message });
