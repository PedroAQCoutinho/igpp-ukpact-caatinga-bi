# Bibliotecas copiadas (funcionam sem internet)

| Biblioteca | Versão | Origem | Arquivos | Licença |
|---|---|---|---|---|
| @duckdb/duckdb-wasm | 1.32.0 (núcleo DuckDB v1.4.3, plataforma wasm_eh) | registry.npmjs.org/@duckdb/duckdb-wasm/-/duckdb-wasm-1.32.0.tgz | `duckdb/duckdb-browser.mjs`, `duckdb/duckdb-browser-eh.worker.js`, `duckdb/duckdb-eh.wasm` | MIT |
| Extensão parquet do DuckDB | v1.4.3 / wasm_eh | extensions.duckdb.org/v1.4.3/wasm_eh/parquet.duckdb_extension.wasm | `duckdb/extensions/v1.4.3/wasm_eh/` (carregada via `custom_extension_repository`) | MIT |
| apache-arrow | 17.0.0 (dependência do duckdb-wasm) | registry.npmjs.org/apache-arrow/-/apache-arrow-17.0.0.tgz | `arrow/Arrow.es2015.min.js` (UMD) + `arrow/arrow-shim.mjs` (expõe como módulo ES, via import map) | Apache-2.0 |

Só o bundle **EH** (WebAssembly exceptions) foi copiado: Chrome, Edge, Firefox e Safari atuais suportam. Ao atualizar o duckdb-wasm, baixe a extensão parquet da mesma versão do núcleo (`SELECT version()`).

SHA-256 (24/11/2026):
    f8ab72b6b90b3ad83077d47426d4a99d5d9a4c7e07cba1a2be37d655adc7c1ab  vendor/duckdb/duckdb-browser-eh.worker.js
    4f8c0bb3c23d1ec457a451cc27418597b9a40dd772cceacc436a2cb7b9a49c18  vendor/duckdb/duckdb-browser.mjs
    4c221bfa59c11f24dbd750e70c90b9252eca6eec5633936e6a2ec766e55fd879  vendor/duckdb/duckdb-eh.wasm
    22765c8f7dc741cda2b571a66ac7bb355295d7d69a6c37e5315b265672984f55  vendor/duckdb/extensions/v1.4.3/wasm_eh/parquet.duckdb_extension.wasm
    375fb7c891e25677c021e585d4ec51a5752112b182f41d51071b8401e590379e  vendor/arrow/Arrow.es2015.min.js
    04ca6bd443d9bb101fbb03be83ef6409a4e14a74f18844edc24e6effa895fbdf  vendor/arrow/arrow-shim.mjs

| Fonte Source Sans 3 (subconjunto latin, variável 400–700) | Google Fonts v20 | fonts.gstatic.com/s/sourcesans3/v20/nwpStKy2OAdR1K-IwhWudF-R3w8aZQ.woff2 | `fonts/source-sans-3-latin.woff2` | SIL OFL 1.1 |

    19143dca075972bc84e3fd9eab7416dd40cc565dccb2435a044bdfabe060c7d5  vendor/fonts/source-sans-3-latin.woff2
