import { pool } from './db';

/**
 * Gera link de auto-login com redirecionamento configurável.
 * @param userId - ID do usuário Supabase
 * @param destination - Caminho de destino: '/conexao' (default) ou '/plans'
 * @returns URL completa com token de auto-login (ex: https://agentezap.online/plans?token=XXX)
 */
export async function generateAutologinLink(userId: string, destination: string = '/conexao'): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

  await pool.query(
    `INSERT INTO admin_autologin_tokens (token, user_id, expires_at, redirect_to) VALUES ($1, $2, $3, $4)`,
    [token, userId, expiresAt, destination]
  );

  const baseUrl = (process.env.APP_URL || 'https://agentezap.online').replace(/\/+$/, '');
  return `${baseUrl}${destination}?token=${token}`;
}

/**
 * Gera link de auto-login com retry em caso de falha.
 */
export async function generateAutologinLinkWithRetry(
  userId: string,
  destination: string = '/conexao',
  maxRetries = 2,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await generateAutologinLink(userId, destination);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Retorna URL pública (sem token de auto-login).
 */
export function buildPublicDestinationUrl(destination: string = '/conexao'): string {
  const baseUrl = (process.env.APP_URL || 'https://agentezap.online').replace(/\/+$/, '');
  return `${baseUrl}${destination}`;
}
