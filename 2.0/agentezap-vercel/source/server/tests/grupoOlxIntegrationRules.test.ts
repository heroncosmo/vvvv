import assert from "node:assert/strict";

import {
  canExposeGrupoOlxCatalogToAi,
  canRunGrupoOlxCatalogSync,
  canRunGrupoOlxLeadSync,
  normalizeGrupoOlxToggleState,
} from "@shared/grupoOlxIntegrationRules";

const fullyEnabled = {
  active: true,
  catalogSyncEnabled: true,
  leadEmailSyncEnabled: true,
  syncToAi: true,
  createDealEnabled: true,
};

assert.deepEqual(
  normalizeGrupoOlxToggleState({
    ...fullyEnabled,
    active: false,
  }),
  {
    active: false,
    catalogSyncEnabled: false,
    leadEmailSyncEnabled: false,
    syncToAi: false,
    createDealEnabled: false,
  },
);

assert.deepEqual(
  normalizeGrupoOlxToggleState({
    ...fullyEnabled,
    leadEmailSyncEnabled: false,
  }),
  {
    active: true,
    catalogSyncEnabled: true,
    leadEmailSyncEnabled: false,
    syncToAi: true,
    createDealEnabled: false,
  },
);

assert.equal(canRunGrupoOlxCatalogSync(fullyEnabled), true);
assert.equal(canRunGrupoOlxCatalogSync({ ...fullyEnabled, catalogSyncEnabled: false }), false);
assert.equal(canRunGrupoOlxLeadSync(fullyEnabled), true);
assert.equal(canRunGrupoOlxLeadSync({ ...fullyEnabled, leadEmailSyncEnabled: false }), false);
assert.equal(canExposeGrupoOlxCatalogToAi(fullyEnabled), true);
assert.equal(canExposeGrupoOlxCatalogToAi({ ...fullyEnabled, syncToAi: false }), false);
assert.equal(canExposeGrupoOlxCatalogToAi({ ...fullyEnabled, active: false }), false);

console.log("grupoOlxIntegrationRules.test.ts ok");
