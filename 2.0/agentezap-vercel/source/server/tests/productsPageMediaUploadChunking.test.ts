import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const productsPageSource = fs.readFileSync(
  path.resolve(process.cwd(), "client", "src", "pages", "products.tsx"),
  "utf8",
);

assert.equal(
  productsPageSource.includes("const PRODUCT_MEDIA_UPLOAD_MAX_BATCH_FILES = 6;"),
  true,
  "A pagina de produtos deve limitar uploads de galeria por quantidade de arquivos",
);

assert.equal(
  productsPageSource.includes("const PRODUCT_MEDIA_UPLOAD_MAX_BATCH_BYTES = 2 * 1024 * 1024;"),
  true,
  "A pagina de produtos deve limitar uploads de galeria por tamanho total do lote",
);

assert.equal(
  productsPageSource.includes("const middleIndex = Math.ceil(batchFiles.length / 2);"),
  true,
  "O upload da galeria deve dividir o lote quando receber 413",
);

assert.equal(
  productsPageSource.includes("error.message.startsWith(\"413:\")"),
  true,
  "O upload da galeria deve detectar erro 413 para reprocessar em lotes menores",
);

console.log("productsPageMediaUploadChunking.test.ts: ok");
