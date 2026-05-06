import crypto from "crypto";

export function generatePublicInstanceToken(): string {
  return `azi_${crypto.randomBytes(24).toString("hex")}`;
}

export function hashPublicInstanceToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function buildPublicInstanceTokenPreview(token: string): string {
  if (token.length <= 12) {
    return token;
  }
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

export function verifyPublicInstanceToken(token: string, expectedHash?: string | null): boolean {
  if (!expectedHash) {
    return false;
  }

  const candidate = Buffer.from(hashPublicInstanceToken(token), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");

  if (candidate.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidate, expected);
}
