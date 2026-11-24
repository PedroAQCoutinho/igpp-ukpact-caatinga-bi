// Camada de dados: DuckDB-WASM local (vendor/), lendo só arquivos de data/. Nenhuma conexão a banco.
import * as duckdb from '../vendor/duckdb/duckdb-browser.mjs';

const base = new URL('..', import.meta.url);
const abs = p => new URL(p, base).href;
let db = null, conn = null;
export const status = { imoveis: false, resumo: false, imoveisMsg: '' };

// Converte BigInt/Decimal do Arrow em Number para o resto do app
const num = v => typeof v === 'bigint' ? Number(v) : v;
function toRows(t) {
  const cols = t.schema.fields.map(f => f.name), out = new Array(t.numRows);
  const vecs = cols.map(c => t.getChild(c));
  for (let i = 0; i < t.numRows; i++) {
    const o = {};
    for (let j = 0; j < cols.length; j++) o[cols[j]] = num(vecs[j].get(i));
    out[i] = o;
  }
  return out;
}

export async function q(sql) { return toRows(await conn.query(sql)); }
export async function qTable(sql) { return conn.query(sql); }
export { toRows };

async function exists(p) {
  try { const r = await fetch(abs(p), { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch { return false; }
}

export async function init() {
  const bundle = { mainModule: abs('vendor/duckdb/duckdb-eh.wasm'), mainWorker: abs('vendor/duckdb/duckdb-browser-eh.worker.js') };
  const worker = new Worker(bundle.mainWorker);
  db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
  await db.instantiate(bundle.mainModule);
  // Sem internet: nada de baixar extensões
  await db.open({ query: { castBigIntToDouble: true } });
  conn = await db.connect();
  // Sem internet: a extensão parquet vem de vendor/duckdb/extensions/<versão>/wasm_eh/
  await conn.query(`SET autoinstall_known_extensions=false; SET autoload_known_extensions=false;
    SET custom_extension_repository='${abs('vendor/duckdb/extensions')}';`);
  await conn.query(`LOAD parquet`);

  const reg = async (name, path) => {
    const buf = new Uint8Array(await (await fetch(abs(path), { cache: 'no-store' })).arrayBuffer());
    await db.registerFileBuffer(name, buf);
  };
  await reg('socio_municipal.parquet', 'data/socio_municipal.parquet');
  await reg('socio_dicionario.parquet', 'data/socio_dicionario.parquet');
  await conn.query(`CREATE TABLE socio_municipal AS SELECT * FROM read_parquet('socio_municipal.parquet');
    CREATE TABLE socio_dicionario AS SELECT * FROM read_parquet('socio_dicionario.parquet');`);

  if (await exists('data/geo_mun_resumo.parquet')) {
    await reg('geo_mun_resumo.parquet', 'data/geo_mun_resumo.parquet');
    await conn.query(`CREATE TABLE geo_mun_resumo AS SELECT * FROM read_parquet('geo_mun_resumo.parquet')`);
    status.resumo = true;
  }
  if (await exists('data/local/imoveis.parquet')) {
    try {
      await reg('imoveis.parquet', 'data/local/imoveis.parquet');
      // Tabela em memória: filtros e GROUP BY ficam bem mais rápidos que reler o Parquet
      await conn.query(`CREATE TABLE imoveis AS SELECT * FROM read_parquet('imoveis.parquet')`);
      await db.dropFile('imoveis.parquet').catch(() => {});
      status.imoveis = true;
    } catch (e) { status.imoveisMsg = 'Erro ao ler data/local/imoveis.parquet: ' + e.message; }
  } else status.imoveisMsg = 'Falta o arquivo data/local/imoveis.parquet.';
  return status;
}
