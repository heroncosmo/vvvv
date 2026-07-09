import http from 'http';
import https from 'https';

const SERVICE_NAME = 'WA-PROXY';

const WORKER_URL = process.env.WA_WORKER_URL || 'http://wa-worker.railway.internal:5000';
const WORKER = new URL(WORKER_URL);
const WORKER_HOSTNAME = WORKER.hostname;
const WORKER_PORT = parseInt(WORKER.port || '5000', 10);
const WORKER_PROTOCOL = WORKER.protocol === 'https:' ? https : http;

const KeepAliveAgent = WORKER.protocol === 'https:' ? https.Agent : http.Agent;
const keepAliveAgent = new KeepAliveAgent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
});

const PORT = parseInt(process.env.PORT || '5000', 10);

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

let totalRequests = 0;
let totalErrors = 0;
let totalWsUpgrades = 0;
const startTime = Date.now();

function logInfo(msg: string) {
  console.log(`[${SERVICE_NAME}] ${msg}`);
}

function logError(msg: string) {
  console.error(`[${SERVICE_NAME}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeUrlForLog(rawUrl?: string): string {
  if (!rawUrl) return '/';
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    for (const key of ['token', 'adminId', 'access_token', 'authorization']) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return rawUrl.replace(/(token|adminId|access_token|authorization)=([^&]+)/gi, '$1=[REDACTED]');
  }
}

function canWriteResponse(res: http.ServerResponse): boolean {
  return !res.headersSent && !res.writableEnded && !res.destroyed;
}

function proxyRequest(
  clientReq: http.IncomingMessage,
  clientRes: http.ServerResponse,
  retryCount = 0,
) {
  totalRequests++;

  const options: http.RequestOptions = {
    hostname: WORKER_HOSTNAME,
    port: WORKER_PORT,
    path: clientReq.url,
    method: clientReq.method,
    agent: keepAliveAgent,
    headers: {
      ...clientReq.headers,
      'x-forwarded-host': clientReq.headers.host || '',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': clientReq.socket.remoteAddress || '',
      host: `${WORKER_HOSTNAME}:${WORKER_PORT}`,
    },
    timeout: 120000,
  };

  const proxyReq = (WORKER_PROTOCOL as typeof http).request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    delete headers['transfer-encoding'];

    if (clientRes.writableEnded || clientRes.destroyed) {
      proxyRes.resume();
      return;
    }

    try {
      clientRes.writeHead(proxyRes.statusCode || 502, headers);
      proxyRes.pipe(clientRes, { end: true });
    } catch (err: any) {
      logError(`Response write error: ${err.message}`);
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (canWriteResponse(clientRes)) {
      clientRes.writeHead(504, { 'Content-Type': 'application/json' });
      clientRes.end(JSON.stringify({ error: 'Worker timeout', service: SERVICE_NAME }));
    }
  });

  proxyReq.on('error', async (err: any) => {
    totalErrors++;

    if (
      retryCount < MAX_RETRIES &&
      (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') &&
      canWriteResponse(clientRes) &&
      (clientReq.method === 'GET' || clientReq.method === 'HEAD')
    ) {
      logError(`Connection to Worker failed (attempt ${retryCount + 1}/${MAX_RETRIES}): ${err.code}`);
      await sleep(RETRY_DELAY_MS);
      proxyRequest(clientReq, clientRes, retryCount + 1);
      return;
    }

    if (canWriteResponse(clientRes)) {
      const status = err.code === 'ECONNREFUSED' ? 503 : 502;
      clientRes.writeHead(status, { 'Content-Type': 'application/json' });
      clientRes.end(JSON.stringify({
        error: 'Worker unavailable',
        detail: err.code || err.message,
        service: SERVICE_NAME,
        hint: 'O Worker Service pode estar reiniciando. Tente novamente em alguns segundos.',
      }));
    }
  });

  clientReq.pipe(proxyReq, { end: true });
}

function proxyWebSocket(
  clientReq: http.IncomingMessage,
  clientSocket: import('stream').Duplex,
  head: Buffer,
) {
  totalWsUpgrades++;
  logInfo(`WebSocket upgrade: ${sanitizeUrlForLog(clientReq.url)} from ${clientReq.socket.remoteAddress}`);

  const options: http.RequestOptions = {
    hostname: WORKER_HOSTNAME,
    port: WORKER_PORT,
    path: clientReq.url,
    method: 'GET',
    headers: {
      ...clientReq.headers,
      host: `${WORKER_HOSTNAME}:${WORKER_PORT}`,
      'x-forwarded-host': clientReq.headers.host || '',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': clientReq.socket.remoteAddress || '',
    },
  };

  const proxyReq = (WORKER_PROTOCOL as typeof http).request(options);
  proxyReq.setTimeout(45000, () => {
    proxyReq.destroy(new Error('WebSocket upgrade timeout'));
  });

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    if ((clientSocket as any).destroyed) {
      proxySocket.destroy();
      return;
    }

    let response = 'HTTP/1.1 101 Switching Protocols\r\n';
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value !== undefined) {
        const val = Array.isArray(value) ? value.join(', ') : value;
        response += `${key}: ${val}\r\n`;
      }
    }
    response += '\r\n';

    try {
      clientSocket.write(response);
      if (proxyHead && proxyHead.length > 0) {
        clientSocket.write(proxyHead);
      }

      if (typeof (clientSocket as any).setKeepAlive === 'function') {
        (clientSocket as any).setKeepAlive(true, 30000);
      }
      if (typeof (proxySocket as any).setKeepAlive === 'function') {
        (proxySocket as any).setKeepAlive(true, 30000);
      }

      proxySocket.pipe(clientSocket);
      clientSocket.pipe(proxySocket);

      proxySocket.on('error', (err: any) => {
        if (err.code !== 'ECONNRESET') logError(`Worker WS error: ${err.message}`);
        clientSocket.destroy();
      });
      clientSocket.on('error', (err: any) => {
        if (err.code !== 'ECONNRESET') logError(`Client WS error: ${err.message}`);
        proxySocket.destroy();
      });
      proxySocket.on('end', () => clientSocket.end());
      clientSocket.on('end', () => proxySocket.end());
    } catch (err: any) {
      logError(`WS connection setup error: ${err.message}`);
      clientSocket.destroy();
      proxySocket.destroy();
    }
  });

  proxyReq.on('error', (err: any) => {
    totalErrors++;
    logError(`WebSocket proxy error: ${err.message} (${err.code})`);
    try {
      if (!(clientSocket as any).destroyed) {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      }
    } catch {
      // ignore write failures
    }
    clientSocket.destroy();
  });

  proxyReq.on('response', (proxyRes) => {
    logError(`WebSocket upgrade rejected by Worker: ${proxyRes.statusCode}`);

    if ((clientSocket as any).destroyed) {
      proxyRes.resume();
      return;
    }

    let response = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`;
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value !== undefined) {
        const val = Array.isArray(value) ? value.join(', ') : value;
        response += `${key}: ${val}\r\n`;
      }
    }
    response += '\r\n';

    clientSocket.write(response);
    proxyRes.pipe(clientSocket);
  });

  if (head && head.length > 0) {
    proxyReq.write(head);
  }
  proxyReq.end();
}

export function startProxy() {
  logInfo('Starting proxy server...');
  logInfo(`Worker URL: ${WORKER_URL}`);

  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/healthz') {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        service: SERVICE_NAME,
        mode: 'proxy',
        worker: WORKER_URL,
        uptime: `${uptime}s`,
        stats: { totalRequests, totalErrors, totalWsUpgrades },
      }));
      return;
    }

    if (req.url === '/proxy-status') {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        service: SERVICE_NAME,
        mode: 'proxy',
        worker: WORKER_URL,
        uptime: `${uptime}s`,
        stats: {
          totalRequests,
          totalErrors,
          totalWsUpgrades,
          errorRate: totalRequests > 0 ? `${((totalErrors / totalRequests) * 100).toFixed(2)}%` : '0%',
        },
      }));
      return;
    }

    proxyRequest(req, res);
  });

  server.on('upgrade', (req, socket, head) => {
    proxyWebSocket(req, socket, head);
  });

  const shutdown = (signal: string) => {
    logInfo(`Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      logInfo('Proxy server closed.');
      process.exit(0);
    });

    setTimeout(() => {
      logError('Forced exit after 10s timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(PORT, '0.0.0.0', () => {
    logInfo(`Proxy server listening on port ${PORT}`);
    logInfo(`Forwarding all traffic to ${WORKER_URL}`);
    logInfo(`Health check: http://0.0.0.0:${PORT}/health`);
    logInfo(`Proxy stats: http://0.0.0.0:${PORT}/proxy-status`);
  });
}
