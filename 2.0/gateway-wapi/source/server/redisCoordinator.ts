import { randomUUID } from "crypto";
import { createClient, type RedisClientType } from "redis";

type RedisClient = RedisClientType;

const REDIS_CONNECT_TIMEOUT_MS = Math.max(
  Number(process.env.WA_REDIS_CONNECT_TIMEOUT_MS || 5_000),
  1_000,
);

const REDIS_RETRY_BASE_MS = Math.max(
  Number(process.env.WA_REDIS_RETRY_BASE_MS || 500),
  100,
);

const REDIS_RETRY_MAX_MS = Math.max(
  Number(process.env.WA_REDIS_RETRY_MAX_MS || 5_000),
  REDIS_RETRY_BASE_MS,
);

const REDIS_DISABLED = process.env.WA_REDIS_DISABLED === "true";

function resolveRedisUrl(): string | undefined {
  const candidate =
    process.env.REDIS_URL ||
    process.env.REDIS_PRIVATE_URL ||
    process.env.REDIS_PUBLIC_URL ||
    process.env.RAILWAY_REDIS_URL ||
    process.env.UPSTASH_REDIS_URL ||
    undefined;

  if (!candidate) {
    return undefined;
  }

  if (!/^redis(s)?:\/\//i.test(candidate)) {
    console.warn("[WA REDIS] Ignoring invalid redis URL. Expected redis:// or rediss://");
    return undefined;
  }

  return candidate;
}

const REDIS_URL = resolveRedisUrl();

let redisClient: RedisClient | null = null;
let redisInitPromise: Promise<RedisClient | null> | null = null;
let missingRedisLogged = false;
let redisErrorLoggedAt = 0;

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

const REFRESH_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
else
  return 0
end
`;

function logRedisError(message: string, error?: unknown): void {
  const now = Date.now();
  if (now - redisErrorLoggedAt < 15_000) {
    return;
  }
  redisErrorLoggedAt = now;
  if (error) {
    console.warn(`[WA REDIS] ${message}:`, error);
  } else {
    console.warn(`[WA REDIS] ${message}`);
  }
}

function getValidTtl(ttlMs: number): number {
  return Math.max(Math.floor(ttlMs), 1_000);
}

export function isRedisAvailable(): boolean {
  return !REDIS_DISABLED && !!REDIS_URL;
}

async function getRedisClient(): Promise<RedisClient | null> {
  if (!isRedisAvailable()) {
    if (!missingRedisLogged) {
      missingRedisLogged = true;
      if (REDIS_DISABLED) {
        console.log("[WA REDIS] Distributed coordination disabled by WA_REDIS_DISABLED=true");
      } else {
        console.log("[WA REDIS] REDIS_URL not configured. Using local-only coordination.");
      }
    }
    return null;
  }

  if (redisClient?.isOpen) {
    return redisClient;
  }

  if (redisInitPromise) {
    return redisInitPromise;
  }

  redisInitPromise = (async () => {
    const client = createClient({
      url: REDIS_URL,
      socket: {
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        reconnectStrategy: (retries: number) => {
          const delay = REDIS_RETRY_BASE_MS * Math.max(retries, 1);
          return Math.min(delay, REDIS_RETRY_MAX_MS);
        },
      },
    });

    client.on("error", (err) => {
      logRedisError("Redis client error", err);
    });

    try {
      await client.connect();
      redisClient = client;
      console.log("[WA REDIS] Connected.");
      return client;
    } catch (error) {
      logRedisError("Failed to connect to Redis", error);
      try {
        if (client.isOpen) {
          await client.quit();
        }
      } catch {
        // ignore close errors
      }
      return null;
    } finally {
      redisInitPromise = null;
    }
  })();

  return redisInitPromise;
}

export type DistributedLockHandle = {
  key: string;
  token: string;
  acquiredAt: number;
  ttlMs: number;
};

export type TryAcquireDistributedLockResult =
  | { status: "acquired"; lock: DistributedLockHandle }
  | { status: "busy"; remainingMs: number }
  | { status: "unavailable" };

export async function getDistributedKeyRemainingMs(key: string): Promise<number> {
  const client = await getRedisClient();
  if (!client) return 0;

  try {
    const ttl = await client.pTTL(key);
    return ttl > 0 ? ttl : 0;
  } catch (error) {
    logRedisError(`Failed to read TTL for key ${key}`, error);
    return 0;
  }
}

export async function tryAcquireDistributedLock(
  key: string,
  ttlMs: number,
): Promise<TryAcquireDistributedLockResult> {
  const client = await getRedisClient();
  if (!client) {
    return { status: "unavailable" };
  }

  const ttl = getValidTtl(ttlMs);
  const token = randomUUID();

  try {
    const result = await client.set(key, token, {
      NX: true,
      PX: ttl,
    });

    if (result !== "OK") {
      const remainingMs = await getDistributedKeyRemainingMs(key);
      return { status: "busy", remainingMs };
    }

    return {
      status: "acquired",
      lock: {
        key,
        token,
        acquiredAt: Date.now(),
        ttlMs: ttl,
      },
    };
  } catch (error) {
    logRedisError(`Failed to acquire lock ${key}`, error);
    return { status: "unavailable" };
  }
}

export async function refreshDistributedLock(
  lock: DistributedLockHandle,
  ttlMs: number,
): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;

  const ttl = getValidTtl(ttlMs);

  try {
    const result = await client.eval(REFRESH_LOCK_SCRIPT, {
      keys: [lock.key],
      arguments: [lock.token, String(ttl)],
    });
    return Number(result) === 1;
  } catch (error) {
    logRedisError(`Failed to refresh lock ${lock.key}`, error);
    return false;
  }
}

export async function releaseDistributedLock(lock: DistributedLockHandle): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;

  try {
    const result = await client.eval(RELEASE_LOCK_SCRIPT, {
      keys: [lock.key],
      arguments: [lock.token],
    });
    return Number(result) === 1;
  } catch (error) {
    logRedisError(`Failed to release lock ${lock.key}`, error);
    return false;
  }
}

export async function setDistributedExpiringKey(
  key: string,
  value: string,
  ttlMs: number,
): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;

  try {
    await client.set(key, value, { PX: getValidTtl(ttlMs) });
  } catch (error) {
    logRedisError(`Failed to set expiring key ${key}`, error);
  }
}

export async function clearDistributedKey(key: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;

  try {
    await client.del(key);
  } catch (error) {
    logRedisError(`Failed to clear key ${key}`, error);
  }
}
