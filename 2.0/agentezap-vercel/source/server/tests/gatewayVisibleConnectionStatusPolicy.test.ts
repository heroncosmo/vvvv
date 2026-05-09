import assert from "node:assert/strict";

import {
  gatewayStatusLooksHardDisconnected,
  shouldHoldGatewayConnectionAsRecovering,
} from "../gatewayVisibleConnectionStatusPolicy";

const connectedGatewayConnection = {
  provider: "baileys",
  connectionMethod: "qr",
  isConnected: true,
  providerStatus: "connected",
  qrCode: null,
};

assert.equal(
  shouldHoldGatewayConnectionAsRecovering(connectedGatewayConnection, {
    isConnected: false,
    providerStatus: "disconnected",
    qrCode: null,
  }),
  true,
  "conexao gateway persistida conectada nao deve virar Desconectado por leitura transitoria false",
);

assert.equal(
  shouldHoldGatewayConnectionAsRecovering(connectedGatewayConnection, {
    isConnected: true,
    providerStatus: "connected",
    qrCode: null,
  }),
  false,
  "status conectado real nao precisa de estado recovering",
);

assert.equal(
  shouldHoldGatewayConnectionAsRecovering(
    { ...connectedGatewayConnection, isConnected: false, providerStatus: "inactive" },
    {
      isConnected: false,
      providerStatus: "disconnected",
      qrCode: null,
    },
  ),
  false,
  "conexao sem sinal persistido de conectado pode aparecer offline",
);

assert.equal(
  shouldHoldGatewayConnectionAsRecovering(connectedGatewayConnection, {
    isConnected: false,
    providerStatus: "disconnected",
    qrCode: "qr-code",
  }),
  false,
  "QR code novo e sinal forte de desconexao real",
);

assert.equal(
  gatewayStatusLooksHardDisconnected({
    isConnected: false,
    providerStatus: "logged_out",
    qrCode: null,
  }),
  true,
  "logout explicito e desconexao forte",
);

console.log("gatewayVisibleConnectionStatusPolicy.test.ts ok");
