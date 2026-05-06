import fs from "fs/promises";
import path from "path";
import os from "os";

type LeaderOptions = {
  lockFilePath?: string;
  staleMs?: number;
  heartbeatMs?: number;
  retryMs?: number;
  onLeader: () => void | Promise<void>;
};

function resolveDefaultLockPath(): string {
  const sessionsDir = process.env.SESSIONS_DIR;
  if (sessionsDir) {
    // Prefer the Railway volume root so the lock is shared across deployments.
    const volumeRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH;
    if (volumeRoot) return path.join(volumeRoot, "whatsapp-worker.lock");
    return path.join(path.dirname(sessionsDir), "whatsapp-worker.lock");
  }

  const volumeRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (volumeRoot) return path.join(volumeRoot, "whatsapp-worker.lock");

  return path.join(process.cwd(), "whatsapp-worker.lock");
}

export function startWhatsAppLeaderElection(opts: LeaderOptions): {
  isLeader: () => boolean;
} {
  const lockFilePath = opts.lockFilePath || resolveDefaultLockPath();
  const staleMs = opts.staleMs ?? 90 * 1000; // 90 seconds (SIGTERM cleans up immediately, this is safety net)
  const heartbeatMs = opts.heartbeatMs ?? 30 * 1000;
  const retryMs = opts.retryMs ?? 15 * 1000;

  let leader = false;
  let lockHandle: fs.FileHandle | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let retryTimer: NodeJS.Timeout | null = null;

  async function cleanupLock() {
    try {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;

      if (lockHandle) {
        await lockHandle.close();
      }
      lockHandle = null;

      // Best-effort: remove the lock file on graceful shutdown.
      await fs.unlink(lockFilePath);
    } catch {
      // ignore
    }
  }

  async function touchLock() {
    try {
      const now = new Date();
      await fs.utimes(lockFilePath, now, now);
    } catch {
      // ignore
    }
  }

  async function tryAcquireLeaderLock(): Promise<boolean> {
    try {
      await fs.mkdir(path.dirname(lockFilePath), { recursive: true });
    } catch {
      // ignore
    }

    try {
      lockHandle = await fs.open(lockFilePath, "wx");
      const meta = {
        bootId: process.env.BOOT_ID || null,
        pid: process.pid,
        hostname: os.hostname(),
        startedAt: new Date().toISOString(),
        commit:
          process.env.RAILWAY_GIT_COMMIT_SHA ||
          process.env.RAILWAY_GIT_COMMIT ||
          null,
        env: process.env.NODE_ENV || null,
      };
      await lockHandle.writeFile(JSON.stringify(meta) + "\n", {
        encoding: "utf8",
      });
      await touchLock();

      heartbeatTimer = setInterval(touchLock, heartbeatMs);
      heartbeatTimer.unref?.();

      process.once("SIGTERM", () => {
        void cleanupLock();
      });
      process.once("SIGINT", () => {
        void cleanupLock();
      });
      process.once("beforeExit", () => {
        void cleanupLock();
      });

      return true;
    } catch (err: any) {
      if (err?.code !== "EEXIST") return false;

      // Lock exists: if stale, attempt to remove and retry once.
      try {
        const st = await fs.stat(lockFilePath);
        const age = Date.now() - st.mtimeMs;
        if (age > staleMs) {
          await fs.unlink(lockFilePath);
          return await tryAcquireLeaderLock();
        }
      } catch {
        // ignore
      }

      return false;
    }
  }

  async function loop() {
    if (leader) return;
    const ok = await tryAcquireLeaderLock();
    if (!ok) return;

    leader = true;
    console.log(
      `[LEADER] WhatsApp worker lock acquired (${lockFilePath}). This instance will restore sessions/run jobs.`,
    );

    try {
      await opts.onLeader();
    } catch (e) {
      console.error("[LEADER] Error while running leader startup:", e);
    }
  }

  // Start immediately; if we can't acquire, retry until we can (rolling deploy overlap).
  void loop();
  retryTimer = setInterval(() => void loop(), retryMs);
  retryTimer.unref?.();

  return { isLeader: () => leader };
}
