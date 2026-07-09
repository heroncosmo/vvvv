type ConnectionState = {
  isConnected?: boolean;
  qrCode?: string | null;
};

type GetConnectionByUserId = (userId: string) => Promise<ConnectionState | undefined>;
type ConnectWhatsApp = (userId: string) => Promise<void>;
type RequestPairingCode = (userId: string, phoneNumber: string) => Promise<string | null>;

type SendText = (text: string) => Promise<void>;
type SendImage = (image: Buffer, caption: string) => Promise<void>;
type Sleep = (ms: number) => Promise<void>;

type EnsureQrCodeParams = {
  userId: string;
  contactNumber: string;
  getConnectionByUserId: GetConnectionByUserId;
  connectWhatsApp: ConnectWhatsApp;
  sendText: SendText;
  sendImage: SendImage;
  sleep?: Sleep;
  now?: () => number;
  maxWaitMs?: number;
};

type EnsurePairingCodeParams = {
  userId: string;
  contactNumber: string;
  getConnectionByUserId: GetConnectionByUserId;
  requestPairingCode: RequestPairingCode;
  sendText: SendText;
  sleep?: Sleep;
  now?: () => number;
  maxAttempts?: number;
};

const backgroundQrJobs = new Set<string>();
const backgroundPairingJobs = new Set<string>();

const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractQrBuffer(qrCodeData: string): Buffer | null {
  // Accepts both data URLs (data:image/png;base64,...) and raw base64.
  const trimmed = qrCodeData.trim();
  const base64 = trimmed.includes(",") ? trimmed.split(",")[1] : trimmed;
  if (!base64) return null;

  try {
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
}

function pickProgressMessage(kind: "qr" | "pairing", tick: number): string {
  if (kind === "pairing") {
    const msgs = [
      "🔄 Gerando seu código de pareamento… só um instante.",
      "⏳ Ainda gerando o código… já já te envio aqui.",
      "📲 Quase lá… estou finalizando o código de 8 dígitos.",
      "✅ Só mais um pouquinho… mantendo a tentativa ativa.",
    ];
    return msgs[tick % msgs.length];
  }

  const msgs = [
    "📱 Gerando seu QR Code agora… só um instante.",
    "⏳ Ainda gerando o QR Code… pode aguardar mais um pouquinho.",
    "🔄 Estou mantendo a tentativa ativa… já já te envio o QR Code.",
    "✅ Quase lá… assim que aparecer eu envio automaticamente.",
  ];
  return msgs[tick % msgs.length];
}

export async function ensureQrCodeSentToClient(params: EnsureQrCodeParams): Promise<{
  alreadyConnected: boolean;
  sent: boolean;
}> {
  const {
    userId,
    contactNumber,
    getConnectionByUserId,
    connectWhatsApp,
    sendText,
    sendImage,
    sleep = defaultSleep,
    now = Date.now,
    maxWaitMs = 180_000,
  } = params;

  const existing = await getConnectionByUserId(userId);
  if (existing?.isConnected) {
    await sendText(
      "✅ Seu WhatsApp já está conectado e funcionando!\n\nSe quiser desconectar para gerar um novo QR Code, é só digitar 'desconectar'.",
    );
    return { alreadyConnected: true, sent: true };
  }

  await sendText(pickProgressMessage("qr", 0));

  try {
    await connectWhatsApp(userId);
  } catch {
    // We'll keep waiting/polling anyway; connectWhatsApp can be temporarily failing.
  }

  const startedAt = now();
  let lastProgressAt = 0;
  let tick = 0;

  while (now() - startedAt < maxWaitMs) {
    await sleep(1000);

    const conn = await getConnectionByUserId(userId);

    if (conn?.isConnected) {
      await sendText("✅ Conectado! Seu WhatsApp já está funcionando aqui.");
      return { alreadyConnected: false, sent: true };
    }

    if (conn?.qrCode) {
      const qrBuffer = extractQrBuffer(conn.qrCode);
      if (qrBuffer) {
        await sendImage(
          qrBuffer,
          "📱 Aqui está o QR Code!\n\n1️⃣ Abra o WhatsApp no celular\n2️⃣ Vá em Configurações > Aparelhos Conectados\n3️⃣ Toque em 'Conectar Aparelho'\n4️⃣ Escaneie este QR Code!\n\n⏰ O QR Code expira em alguns minutos!",
        );
        return { alreadyConnected: false, sent: true };
      }
    }

    // Send a progress update every 10 seconds.
    const elapsed = now() - startedAt;
    if (elapsed - lastProgressAt >= 10_000) {
      tick += 1;
      lastProgressAt = elapsed;
      await sendText(pickProgressMessage("qr", tick));
    }
  }

  // Do not ask the client to retry; keep it clear and automatic.
  await sendText(
    "⏳ Ainda não consegui gerar o QR Code por aqui, mas eu continuo tentando e te envio automaticamente assim que aparecer.\n\nSe preferir, eu também posso conectar pelo código de 8 dígitos.",
  );

  // Continua tentando em background sem exigir nova interação do cliente.
  const jobKey = `qr:${userId}`;
  if (!backgroundQrJobs.has(jobKey)) {
    backgroundQrJobs.add(jobKey);
    (async () => {
      try {
        // Reforçar tentativa de conexão caso a anterior tenha sido derrubada.
        try {
          await connectWhatsApp(userId);
        } catch {
          // ignore
        }

        const bgStart = now();
        const bgMax = 10 * 60_000; // 10 minutos

        while (now() - bgStart < bgMax) {
          await sleep(5000);
          const conn = await getConnectionByUserId(userId);

          if (conn?.isConnected) {
            await sendText("✅ Conectado! Seu WhatsApp já está funcionando aqui.");
            return;
          }

          if (conn?.qrCode) {
            const qrBuffer = extractQrBuffer(conn.qrCode);
            if (qrBuffer) {
              await sendImage(
                qrBuffer,
                "📱 Aqui está o QR Code!\n\n1️⃣ Abra o WhatsApp no celular\n2️⃣ Vá em Configurações > Aparelhos Conectados\n3️⃣ Toque em 'Conectar Aparelho'\n4️⃣ Escaneie este QR Code!\n\n⏰ O QR Code expira em alguns minutos!",
              );
              return;
            }
          }
        }
      } finally {
        backgroundQrJobs.delete(jobKey);
      }
    })();
  }

  return { alreadyConnected: false, sent: false };
}

export async function ensurePairingCodeSentToClient(
  params: EnsurePairingCodeParams,
): Promise<{ alreadyConnected: boolean; sent: boolean; code?: string }> {
  const {
    userId,
    contactNumber,
    getConnectionByUserId,
    requestPairingCode,
    sendText,
    sleep = defaultSleep,
    now = Date.now,
    maxAttempts = 6,
  } = params;

  const existing = await getConnectionByUserId(userId);
  if (existing?.isConnected) {
    await sendText(
      "✅ Seu WhatsApp já está conectado e funcionando!\n\nSe quiser desconectar para gerar um novo código, é só digitar 'desconectar'.",
    );
    return { alreadyConnected: true, sent: true };
  }

  await sendText(pickProgressMessage("pairing", 0));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = await requestPairingCode(userId, contactNumber);
    if (code) {
      const codeFormatted = code.match(/.{1,4}/g)?.join("-") || code;
      await sendText(
        `🔑 Seu código de pareamento:\n\n*${codeFormatted}*\n\nAgora é só:\n1️⃣ Abrir o WhatsApp no celular\n2️⃣ Ir em Configurações > Aparelhos Conectados\n3️⃣ Tocar em "Conectar Aparelho"\n4️⃣ Tocar em "Conectar com número de telefone"\n5️⃣ Digitar esse código!\n\n⏰ O código expira em alguns minutos, então use logo!`,
      );
      return { alreadyConnected: false, sent: true, code };
    }

    await sendText(pickProgressMessage("pairing", attempt));
    await sleep(10_000);
  }

  await sendText(
    "⏳ Não consegui gerar o código de pareamento agora, mas vou continuar tentando.\n\nSe você preferir, eu também consigo conectar por QR Code.",
  );

  // Continua tentando em background (sem spam). Se gerar, envia o código formatado.
  const jobKey = `pairing:${userId}`;
  if (!backgroundPairingJobs.has(jobKey)) {
    backgroundPairingJobs.add(jobKey);
    (async () => {
      try {
        const bgStart = now();
        const bgMax = 10 * 60_000; // 10 minutos
        let attempt = 0;

        while (now() - bgStart < bgMax) {
          attempt += 1;
          await sleep(15_000);

          const conn = await getConnectionByUserId(userId);
          if (conn?.isConnected) {
            await sendText("✅ Conectado! Seu WhatsApp já está funcionando aqui.");
            return;
          }

          const code = await requestPairingCode(userId, contactNumber);
          if (code) {
            const codeFormatted = code.match(/.{1,4}/g)?.join("-") || code;
            await sendText(
              `🔑 Seu código de pareamento:\n\n*${codeFormatted}*\n\nAgora é só:\n1️⃣ Abrir o WhatsApp no celular\n2️⃣ Ir em Configurações > Aparelhos Conectados\n3️⃣ Tocar em "Conectar Aparelho"\n4️⃣ Tocar em "Conectar com número de telefone"\n5️⃣ Digitar esse código!\n\n⏰ O código expira em alguns minutos, então use logo!`,
            );
            return;
          }

          // Evitar logica infinita em silêncio se o cliente desconectou/alterou.
          if (attempt >= 20) return;
        }
      } finally {
        backgroundPairingJobs.delete(jobKey);
      }
    })();
  }

  return { alreadyConnected: false, sent: false };
}
