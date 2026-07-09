import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const pwaSource = fs.readFileSync(path.resolve(process.cwd(), "client", "src", "lib", "pwa.ts"), "utf8");
const bannerSource = fs.readFileSync(
  path.resolve(process.cwd(), "client", "src", "components", "pwa-update-banner.tsx"),
  "utf8",
);
const prepareSource = fs.readFileSync(path.resolve(process.cwd(), "scripts", "prepare-pwa-assets.js"), "utf8");
const serviceWorkerSource = fs.readFileSync(path.resolve(process.cwd(), "client", "public", "sw.js"), "utf8");

for (const [label, source] of [
  ["client pwa", pwaSource],
  ["pwa generator", prepareSource],
  ["generated service worker", serviceWorkerSource],
] as const) {
  assert.match(source, /PWA_AUTO_UPDATE_V826/, `${label} deve carregar o marcador novo de auto-update`);
  assert.doesNotMatch(source, /PWA_AUTO_UPDATE_V824/, `${label} nao pode manter marcador antigo do PWA`);
}

assert.match(
  prepareSource,
  /claimAndRefreshClients[\s\S]*client\.navigate\(url\.toString\(\)\)/,
  "service worker gerado deve navegar abas antigas para o bundle novo no activate",
);

assert.match(
  serviceWorkerSource,
  /claimAndRefreshClients[\s\S]*client\.navigate\(url\.toString\(\)\)/,
  "service worker publico deve navegar abas antigas para o bundle novo no activate",
);

assert.match(
  serviceWorkerSource,
  /az_pwa_refresh[\s\S]*PWA_VERSION/,
  "refresh forcado precisa usar a versao do PWA para evitar loop infinito",
);

assert.match(bannerSource, /Atualizando sistema/, "banner deve informar que esta atualizando automaticamente");
assert.doesNotMatch(bannerSource, /Atualizar agora|Nova versao pronta/, "banner nao deve depender de clique manual");

console.log("pwaAutoUpdate.source.test.ts: ok");
