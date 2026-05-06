import type { Request } from "express";
import { allowInsecureLocalSession } from "./supabaseAuth";

const SESSION_CALLBACK_TIMEOUT_MS = 3000;

function runSessionCallback(
  label: string,
  action: (done: (err?: unknown) => void) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) {
        return;
      }
      finished = true;
      reject(new Error(`${label} timed out after ${SESSION_CALLBACK_TIMEOUT_MS}ms`));
    }, SESSION_CALLBACK_TIMEOUT_MS);

    action((err?: unknown) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export async function persistAdminSession(
  req: Request,
  admin: { id: string; role?: string | null },
): Promise<void> {
  if (!req.session) {
    throw new Error("Session middleware unavailable");
  }

  if (!allowInsecureLocalSession) {
    await runSessionCallback("req.session.regenerate", (done) => req.session.regenerate(done));
  }

  (req.session as any).adminId = admin.id;
  (req.session as any).adminRole = admin.role ?? "admin";

  if (allowInsecureLocalSession) {
    return;
  }

  await runSessionCallback("req.session.save", (done) => req.session.save(done));
}
