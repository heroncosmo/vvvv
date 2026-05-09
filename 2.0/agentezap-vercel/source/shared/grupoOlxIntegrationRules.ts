export type GrupoOlxToggleState = {
  active: boolean;
  catalogSyncEnabled: boolean;
  leadEmailSyncEnabled: boolean;
  syncToAi: boolean;
  createDealEnabled: boolean;
};

export function normalizeGrupoOlxToggleState(state: GrupoOlxToggleState): GrupoOlxToggleState {
  if (!state.active) {
    return {
      active: false,
      catalogSyncEnabled: false,
      leadEmailSyncEnabled: false,
      syncToAi: false,
      createDealEnabled: false,
    };
  }

  if (!state.leadEmailSyncEnabled) {
    return {
      ...state,
      createDealEnabled: false,
    };
  }

  return state;
}

export function canRunGrupoOlxCatalogSync(state: GrupoOlxToggleState): boolean {
  return state.active && state.catalogSyncEnabled;
}

export function canRunGrupoOlxLeadSync(state: GrupoOlxToggleState): boolean {
  return state.active && state.leadEmailSyncEnabled;
}

export function canExposeGrupoOlxCatalogToAi(state: GrupoOlxToggleState): boolean {
  return state.active && state.syncToAi;
}
