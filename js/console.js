// Aba 5 — Console SQL sobre as tabelas locais do DuckDB (só arquivos; nenhum banco remoto).
import { q, qTable, toRows, status } from './db.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAG = 50;

// Descrições das colunas que não vêm do dicionário do Felipe
const DESC = {
  imoveis: {
    codmun: 'Código IBGE do município (7 dígitos)', uf: 'UF', tipologia: 'Tipologia (tipologia_car2)', porte: 'Porte do imóvel (porte_imovel)',
    area_ha: 'Área do imóvel no CAR (ha, 0,1)', aridez: 'Classe da dinâmica da aridez A–F', risco_fund: 'Risco fundiário (carac_fund)',
    area_pot_degradada_ha: 'Área potencialmente degradada (ha) = agricultura + pastagem + mosaico degradados, nulos como zero',
    agri_deg_ha: 'Agricultura degradada (ha)', agri_ndeg_ha: 'Agricultura não degradada (ha)', past_deg_ha: 'Pastagem degradada (ha)', past_ndeg_ha: 'Pastagem não degradada (ha)',
    mos_deg_ha: 'Mosaico degradado (ha)', mos_ndeg_ha: 'Mosaico não degradado (ha)', vn_deg_ha: 'Vegetação nativa degradada (ha)', vn_ndeg_ha: 'Vegetação nativa não degradada (ha)',
    apto_status: 'Critério: status e condição do CAR', apto_desm_2023: 'Critério: sem desmatamento após o marco de 2023 (PRODES 2024–2025)', apto_desm_2008: 'Critério: sem desmatamento não autorizado 2008–2025',
    apto_embargo: 'Critério: sem embargo', apto_fpnd: 'Critério: fora de floresta pública não destinada', apto_uc: 'Critério: fora de UC (UCPI e UCUS)', apto_uc_semucus: 'Critério: fora de UCPI',
    apto_ti_tq: 'Critério: fora de TI e território quilombola', apto_areas_degradadas: 'Critério: possui área degradada', apto_todos: 'Elegível (Eco Invest): apto em todas as salvaguardas', apto_todos_semucus: 'Apto em todas sem contar UCUS (não usado no BI)',
  },
  geo_mun_resumo: { codmun: 'Código IBGE do município', n: 'Imóveis', area: 'Área dos imóveis (ha)', deg: 'Área potencialmente degradada (ha)', elig: 'Degradada em imóveis elegíveis (ha)', apt: 'Imóveis elegíveis' },
};

const EX = [
  ['Crédito e produção por UF', `SELECT uf, count(*) AS municipios,
  round(sum(cr_volume_rs)/1e6, 1) AS credito_rs_mi,
  round(sum(pr_agropecuaria_rs)/1e6, 1) AS vbp_rs_mi,
  round(100*sum(cr_volume_rs)/sum(pr_agropecuaria_rs), 1) AS centavos_por_real
FROM socio_municipal GROUP BY uf ORDER BY credito_rs_mi DESC;`],
  ['Municípios com mais Pronaf B no crédito', `SELECT codmun, municipio, uf, round(100*cr_pronafb_volume_rs/cr_volume_rs, 1) AS pct_pronafb, cr_contratos
FROM socio_municipal WHERE cr_volume_rs > 0 ORDER BY pct_pronafb DESC LIMIT 20;`],
  ['Células sem dado na fonte (NULL) por coluna', `SELECT column_name AS coluna, null_percentage::DOUBLE AS pct_sem_dado, min, max
FROM (SUMMARIZE socio_municipal) ORDER BY pct_sem_dado DESC;`],
  ['Dicionário: colunas de crédito', `SELECT * FROM socio_dicionario WHERE coluna LIKE 'cr_%' ORDER BY coluna;`],
  ['Imóveis e área degradada por tipologia', `SELECT tipologia, count(*) AS imoveis, round(sum(area_ha)) AS area_ha,
  round(sum(area_pot_degradada_ha)) AS deg_ha, count(*) FILTER (WHERE apto_todos) AS elegiveis
FROM imoveis GROUP BY tipologia ORDER BY imoveis DESC;`],
  ['Aptos por critério e elegíveis', `SELECT count(*) AS imoveis,
  count(*) FILTER (WHERE apto_status) AS status, count(*) FILTER (WHERE apto_desm_2023) AS desm_2023,
  count(*) FILTER (WHERE apto_desm_2008) AS desm_2008, count(*) FILTER (WHERE apto_embargo) AS embargo,
  count(*) FILTER (WHERE apto_fpnd) AS fpnd, count(*) FILTER (WHERE apto_uc) AS uc, count(*) FILTER (WHERE apto_ti_tq) AS ti_tq,
  count(*) FILTER (WHERE apto_areas_degradadas) AS areas_deg,
  count(*) FILTER (WHERE apto_todos) AS elegiveis
FROM imoveis;`],
  ['Cruzamento: área degradada × caprinocultura', `SELECT s.codmun, s.municipio, s.uf,
  round(s.pr_ag_caprinos_e_ovinos_rs/1e6, 1) AS vbp_caprinos_rs_mi,
  count(*) AS imoveis, round(sum(i.area_pot_degradada_ha)) AS deg_ha
FROM socio_municipal s JOIN imoveis i USING (codmun)
WHERE i.tipologia IN ('AST','PCT','Pronaf','Pronaf B')  -- grafia do banco
GROUP BY ALL ORDER BY deg_ha DESC LIMIT 25;`],
  ['Municípios da base sem imóveis no CAR', `SELECT s.codmun, s.municipio, s.uf FROM socio_municipal s
WHERE s.codmun NOT IN (SELECT DISTINCT codmun FROM imoveis) ORDER BY 1;`],
];

export function initConsole(el) {
  el.innerHTML = `<section><h2>Console SQL</h2><p class="q">SQL do DuckDB sobre os arquivos locais. Ctrl+Enter executa. Nada sai do navegador.</p>
  <div class="sqlgrid"><div class="ctl">
   <label>Exemplos <select data-ex><option value="">Escolha um exemplo…</option>${EX.map(([l], i) => `<option value="${i}">${esc(l)}</option>`).join('')}</select></label>
   <textarea data-sql spellcheck="false" rows="10" aria-label="SQL">${esc(EX[0][1])}</textarea>
   <div class="fr"><button class="btn" data-run>Executar (Ctrl+Enter)</button><button class="btn" data-csv disabled>Copiar CSV</button><span class="u" data-info></span></div>
   <div data-out></div><pre data-j hidden></pre></div>
   <div><h3>Tabelas</h3><div data-sch class="tall sch"></div></div></div></section>`;
  const qs = s => el.querySelector(s), ta = qs('[data-sql]');
  let res = null, page = 0;
  const run = async () => {
    const sql = ta.value.trim(); if (!sql) return;
    qs('[data-info]').textContent = 'Executando…'; const t0 = performance.now();
    try {
      const t = await qTable(sql);
      res = { cols: t.schema.fields.map(f => f.name), rows: toRows(t) }; page = 0;
      qs('[data-info]').textContent = `${res.rows.length.toLocaleString('pt-BR')} linhas em ${Math.round(performance.now() - t0)} ms`;
      qs('[data-csv]').disabled = !res.rows.length; draw();
    } catch (e) { res = null; qs('[data-csv]').disabled = true; qs('[data-info]').textContent = ''; qs('[data-out]').innerHTML = `<div class="warn">${esc(e.message)}</div>` }
  };
  const cell = v => v == null ? '<span class="u">NULL</span>' : esc(typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : String(v));
  const draw = () => {
    const n = res.rows.length, pages = Math.max(1, Math.ceil(n / PAG)), rs = res.rows.slice(page * PAG, page * PAG + PAG);
    qs('[data-out]').innerHTML = `<div class="scroll tall"><table class="sqlt"><thead><tr>${res.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rs.map(r => `<tr>${res.cols.map(c => `<td>${cell(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` +
      (pages > 1 ? `<div class="fr"><button class="x" data-pg="-1" aria-label="Página anterior"${page ? '' : ' disabled'}>‹</button><span class="u">página ${page + 1} de ${pages}</span><button class="x" data-pg="1" aria-label="Próxima página"${page < pages - 1 ? '' : ' disabled'}>›</button></div>` : '');
  };
  el.addEventListener('click', e => {
    if (e.target.dataset.run != null) run();
    if (e.target.dataset.pg) { page += +e.target.dataset.pg; draw() }
    if (e.target.dataset.csv != null && res) {
      const f = v => v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : /[;"\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
      const t = res.cols.join(';') + '\n' + res.rows.map(r => res.cols.map(c => f(r[c])).join(';')).join('\n');
      qs('[data-j]').hidden = false; qs('[data-j]').textContent = t.length > 2e5 ? t.slice(0, 2e5) + '\n…' : t; navigator.clipboard?.writeText(t).catch(() => { })
    }
    const ins = e.target.dataset.ins; if (ins) { const p = ta.selectionStart; ta.setRangeText(ins, p, ta.selectionEnd, 'end'); ta.focus() }
  });
  qs('[data-ex]').onchange = e => { if (e.target.value !== '') { ta.value = EX[+e.target.value][1]; run() } };
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run() } });
  schema(qs('[data-sch]'));
}

async function schema(el) {
  const dic = new Map((await q('SELECT coluna, descricao, unidade FROM socio_dicionario')).map(r => [r.coluna, r.descricao + (r.unidade ? ' (' + r.unidade + ')' : '')]));
  const tabs = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='main' ORDER BY 1`)).map(r => r.table_name);
  let h = '';
  for (const t of ['socio_municipal', 'socio_dicionario', 'imoveis', 'geo_mun_resumo', 'arranjos_pontos']) {
    if (!tabs.includes(t)) { h += `<details><summary><b>${t}</b> <span class="u">(${t === 'imoveis' ? 'falta data/local/imoveis.parquet' : 'não disponível'})</span></summary></details>`; continue }
    const cols = await q(`SELECT column_name AS c, data_type AS t FROM information_schema.columns WHERE table_name='${t}' ORDER BY ordinal_position`);
    const n = (await q(`SELECT count(*) AS n FROM ${t}`))[0].n;
    h += `<details${t === 'socio_municipal' ? ' open' : ''}><summary><b>${t}</b> <span class="u">${n.toLocaleString('pt-BR')} linhas</span></summary><ul>` +
      cols.map(({ c, t: ty }) => `<li><button class="lnk" data-ins="${esc(c)}">${esc(c)}</button> <span class="u">${esc(ty.toLowerCase())}</span><br><small>${esc((t.startsWith('socio') ? dic.get(c) : DESC[t]?.[c]) || '')}</small></li>`).join('') + '</ul></details>';
  }
  el.innerHTML = h;
}
