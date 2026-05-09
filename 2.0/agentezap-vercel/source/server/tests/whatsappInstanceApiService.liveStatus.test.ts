import assert from "node:assert/strict";

import { computeLiveInstanceSnapshot } from "../whatsappInstanceApiService.ts";

const baseConnection = {
  id: "conn-test",
  userId: "user-test",
  phoneNumber: "5511999999999",
  isConnected: false,
  provider: "baileys",
  connectionMethod: "qr",
} as any;

async function main() {
  const disconnected = computeLiveInstanceSnapshot(baseConnection, undefined);
  assert.equal(disconnected.isConnected, false);
  assert.equal(disconnected.status, "disconnected");
  assert.equal(disconnected.connectedPhone, "5511999999999");

  const liveSession = {
    socket: {
      user: {
        id: "5511888888888:12@s.whatsapp.net",
        name: "Canal Teste",
        lid: "lid-test",
      },
      ws: {
        readyState: 1,
      },
    },
  } as any;

  const connected = computeLiveInstanceSnapshot(baseConnection, liveSession);
  assert.equal(connected.isConnected, true);
  assert.equal(connected.status, "connected");
  assert.equal(connected.connectedPhone, "5511888888888");
  assert.equal(connected.socketName, "Canal Teste");
  assert.equal(connected.socketLid, "lid-test");

  const dbConnected = computeLiveInstanceSnapshot(
    {
      ...baseConnection,
      isConnected: true,
    },
    {
      socket: {
        user: {
          id: "5511777777777:99@s.whatsapp.net",
        },
        ws: {
          readyState: 3,
        },
      },
    } as any,
  );
  assert.equal(dbConnected.isConnected, true);
  assert.equal(dbConnected.status, "connected");

  console.log("whatsappInstanceApiService.liveStatus.test.ts ok");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
