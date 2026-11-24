// Expõe o build UMD do Apache Arrow (carregado antes por <script>) como módulo ES,
// para o import "apache-arrow" do duckdb-browser.mjs (via import map no index.html).
const A = globalThis.Arrow;
if (!A) throw new Error('Arrow UMD não carregado: inclua vendor/arrow/Arrow.es2015.min.js antes dos módulos');
export const { Table, RecordBatchReader, tableToIPC, tableFromIPC, Type, DataType } = A;
export default A;
