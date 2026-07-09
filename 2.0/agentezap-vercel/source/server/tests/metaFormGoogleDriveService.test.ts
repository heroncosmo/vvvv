import assert from "node:assert/strict";

import { __metaFormGoogleDriveTestUtils } from "../metaFormGoogleDriveService.ts";

const envPreferred = __metaFormGoogleDriveTestUtils.buildGoogleOAuthAppConfig({
  envApiKey: "env-api",
  envClientId: "env-client-id",
  envClientSecret: "env-client-secret",
  legacyApiKey: "legacy-api",
  legacyClientId: "legacy-client-id",
  legacyClientSecret: "legacy-client-secret",
});

assert.deepEqual(envPreferred, {
  apiKey: "env-api",
  clientId: "env-client-id",
  clientSecret: "env-client-secret",
  source: "env",
});

const legacyFallback = __metaFormGoogleDriveTestUtils.buildGoogleOAuthAppConfig({
  legacyApiKey: "legacy-api",
  legacyClientId: "legacy-client-id",
  legacyClientSecret: "legacy-client-secret",
});

assert.deepEqual(legacyFallback, {
  apiKey: "legacy-api",
  clientId: "legacy-client-id",
  clientSecret: "legacy-client-secret",
  source: "legacy",
});

assert.equal(
  __metaFormGoogleDriveTestUtils.shouldReconnectGoogleSession({
    response: {
      status: 400,
      data: {
        error: "invalid_grant",
        error_description: "Token has been expired or revoked.",
      },
    },
  }),
  true,
);

assert.equal(
  __metaFormGoogleDriveTestUtils.shouldReconnectGoogleSession({
    message: "invalid_grant",
  }),
  true,
);

assert.equal(
  __metaFormGoogleDriveTestUtils.shouldReconnectGoogleSession({
    cause: {
      message: "Token has been expired or revoked.",
    },
  }),
  true,
);

assert.equal(
  __metaFormGoogleDriveTestUtils.shouldReconnectGoogleSession({
    response: {
      status: 500,
      data: {
        error: "backend_error",
        message: "falha interna",
      },
    },
  }),
  false,
);

assert.equal(
  __metaFormGoogleDriveTestUtils.shouldReconnectGoogleSession({
    response: {
      status: 403,
      data: {
        error: {
          message: "Google Drive API has not been used in project yet",
          errors: [{ reason: "accessNotConfigured" }],
        },
      },
    },
  }),
  false,
);

assert.equal(
  __metaFormGoogleDriveTestUtils.describeGoogleAccessFailure({
    response: {
      status: 403,
      data: {
        error: {
          message: "Request had insufficient authentication scopes.",
          errors: [{ reason: "insufficientPermissions" }],
        },
      },
    },
  }),
  "Sua conexao Google ainda nao liberou Google Drive e Google Planilhas. Desconecte e conecte novamente, marcando todas as permissoes pedidas.",
);

assert.equal(
  __metaFormGoogleDriveTestUtils.describeGoogleAccessFailure({
    response: {
      status: 400,
      data: "invalid_grant",
    },
    message: "invalid_grant",
  }),
  "invalid_grant",
);

assert.equal(__metaFormGoogleDriveTestUtils.normalizeAuthMode("popup"), "popup");
assert.equal(__metaFormGoogleDriveTestUtils.normalizeAuthMode("qualquer"), "redirect");
