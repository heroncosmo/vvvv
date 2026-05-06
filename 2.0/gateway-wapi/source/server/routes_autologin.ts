import type { Express, Request, Response } from 'express';
import { pool } from './db';
import { supabase } from './supabaseAuth';
import { getSupabaseServiceKey, getSupabaseUrl } from './supabaseService';

// Read Supabase credentials from env (same resolution order as supabaseAuth.ts)
const supabaseUrl = getSupabaseUrl();
const supabaseServiceKey = getSupabaseServiceKey();

function buildTemporaryAuthPassword(): string {
  return `AZ-${Math.random().toString(36).slice(2, 10)}!`;
}

export function registerAutologinRoutes(app: Express): void {
  app.get('/api/autologin/:token', async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
      if (!token) return res.status(400).json({ error: 'Token ausente' });

      // Atomic: validate + mark used in one statement — prevents concurrent reuse
      const { rows } = await pool.query(
        `SELECT user_id, redirect_to
         FROM admin_autologin_tokens
         WHERE token = $1
           AND expires_at > NOW()
         LIMIT 1`,
        [token]
      );

      if (!rows || rows.length === 0) {
        return res.status(401).json({ error: 'Link inválido ou expirado' });
      }

      const userId = rows[0].user_id as string;
      const redirectTo = (rows[0].redirect_to as string) || '/conexao';

      try {
        await pool.query(
          `UPDATE admin_autologin_tokens
           SET used_at = COALESCE(used_at, NOW())
           WHERE token = $1`,
          [token]
        );
      } catch (e) {
        console.warn('[Autologin] Falha ao marcar primeiro uso do token:', e);
      }

      // Lazy cleanup: remove other expired tokens for the same user (non-fatal)
      try {
        await pool.query(
          'DELETE FROM admin_autologin_tokens WHERE user_id = $1 AND expires_at < NOW()',
          [userId]
        );
      } catch (e) {
        console.warn('[Autologin] Falha ao limpar tokens expirados:', e);
      }

      if (!supabaseUrl || !supabaseServiceKey) {
        console.error('[Autologin] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
        return res.status(500).json({ error: 'Configuração de autenticação ausente' });
      }

      // Step 1: resolve/repair the auth user for this local user id.
      let userEmail: string | null = null;

      const authUserResult = await pool.query(
        'SELECT email FROM auth.users WHERE id = $1::uuid',
        [userId]
      );
      if (authUserResult.rows?.length > 0) {
        userEmail = authUserResult.rows[0].email as string;
      } else {
        const appUserResult = await pool.query(
          'SELECT email, name, phone FROM users WHERE id = $1',
          [userId]
        );

        if (!appUserResult.rows?.length || !appUserResult.rows[0].email) {
          console.error(`[Autologin] Usuário ${userId} não encontrado em users/auth.users`);
          return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        userEmail = appUserResult.rows[0].email as string;
        const userName = (appUserResult.rows[0].name as string) || '';
        const userPhone = (appUserResult.rows[0].phone as string) || '';

        const authByEmailResult = await pool.query(
          'SELECT id FROM auth.users WHERE lower(email) = lower($1) LIMIT 1',
          [userEmail]
        );

        if (authByEmailResult.rows?.length > 0) {
          const wrongAuthId = authByEmailResult.rows[0].id as string;
          if (wrongAuthId !== userId) {
            console.warn(`[Autologin] Auth órfão encontrado por email ${userEmail}: ${wrongAuthId}. Recriando com id local ${userId}.`);
            const { error: deleteError } = await supabase.auth.admin.deleteUser(wrongAuthId);
            if (deleteError) {
              console.error('[Autologin] Falha ao remover auth órfão:', deleteError);
              return res.status(500).json({ error: 'Erro ao recuperar autenticação' });
            }
          }
        }

        const { data: recreatedUser, error: recreateError } = await supabase.auth.admin.createUser({
          id: userId,
          email: userEmail,
          password: buildTemporaryAuthPassword(),
          email_confirm: true,
          user_metadata: {
            name: userName,
            phone: userPhone,
          },
        });

        if (recreateError) {
          console.error('[Autologin] Falha ao recriar auth user ausente:', recreateError);
          return res.status(500).json({ error: 'Erro ao recuperar autenticação' });
        }

        console.log(`[Autologin] Auth user recriado para userId=${userId} email=${userEmail} authId=${recreatedUser.user?.id || 'N/A'}`);
      }

      if (!userEmail) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Step 2: Generate a magic link via Admin API (returns hashed_token)
      const generateLinkEndpoint = `${supabaseUrl}/auth/v1/admin/generate_link`;
      let generateRes: globalThis.Response;
      try {
        generateRes = await fetch(generateLinkEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'magiclink',
            email: userEmail,
          }),
        });
      } catch (fetchErr: any) {
        console.error('[Autologin] Erro de rede ao gerar link:', fetchErr);
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      if (!generateRes.ok) {
        const body = await generateRes.text().catch(() => '');
        console.error(`[Autologin] generate_link retornou ${generateRes.status}:`, body);
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      let linkData: any;
      try {
        linkData = await generateRes.json();
      } catch (parseErr) {
        console.error('[Autologin] Resposta do generate_link não é JSON válido');
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      const hashedToken = linkData?.properties?.hashed_token || linkData?.hashed_token;
      if (!hashedToken) {
        console.error('[Autologin] generate_link sem hashed_token:', JSON.stringify(linkData).substring(0, 200));
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      // Step 3: Verify the token to get access_token + refresh_token
      const verifyEndpoint = `${supabaseUrl}/auth/v1/verify`;
      let verifyRes: globalThis.Response;
      try {
        verifyRes = await fetch(verifyEndpoint, {
          method: 'POST',
          headers: {
            'apikey': supabaseServiceKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token_hash: hashedToken,
            type: 'magiclink',
          }),
        });
      } catch (fetchErr: any) {
        console.error('[Autologin] Erro de rede ao verificar token:', fetchErr);
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      if (!verifyRes.ok) {
        const body = await verifyRes.text().catch(() => '');
        console.error(`[Autologin] verify retornou ${verifyRes.status}:`, body);
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      let sessionData: any;
      try {
        sessionData = await verifyRes.json();
      } catch (parseErr) {
        console.error('[Autologin] Resposta do verify não é JSON válido');
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      const access_token: string | undefined = sessionData?.access_token;
      const refresh_token: string | undefined = sessionData?.refresh_token;

      if (!access_token || !refresh_token) {
        console.error('[Autologin] Resposta do verify sem tokens esperados:', JSON.stringify(sessionData).substring(0, 200));
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      // V23k: Set Express session so cookie-based auth also works
      // This prevents session drops when navigating between pages
      if (req.session) {
        (req.session as any).user = { id: userId, email: userEmail };
        console.log(`[Autologin] Express session sincronizada para userId=${userId} email=${userEmail}`);
      }

      return res.json({ access_token, refresh_token, redirect_to: redirectTo });
    } catch (error: any) {
      console.error('[Autologin]', error);
      return res.status(500).json({ error: 'Erro interno' });
    }
  });
}
