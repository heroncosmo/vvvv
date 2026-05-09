import crypto from "crypto";

const GATEWAY_ACCOUNT_TOKEN_PREFIX = "agz";

export function generateGatewayAccountToken(userId: string): string {
  return `${GATEWAY_ACCOUNT_TOKEN_PREFIX}_${userId}_${crypto.randomBytes(24).toString("hex")}`;
}

export function hashGatewayAccountToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function buildGatewayAccountTokenPreview(token: string): string {
  if (token.length <= 12) {
    return token;
  }
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

export function parseGatewayAccountToken(token: string): { userId: string; secret: string } | null {
  const trimmed = String(token || "").trim();
  if (!trimmed.startsWith(`${GATEWAY_ACCOUNT_TOKEN_PREFIX}_`)) {
    return null;
  }

  const parts = trimmed.split("_");
  if (parts.length !== 3) {
    return null;
  }

  const [, userId, secret] = parts;
  if (!userId || !secret) {
    return null;
  }

  return { userId, secret };
}

export function verifyGatewayAccountToken(token: string, expectedHash?: string | null): boolean {
  if (!expectedHash) {
    return false;
  }

  const candidate = Buffer.from(hashGatewayAccountToken(token), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");

  if (candidate.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidate, expected);
}
