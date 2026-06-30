import { AppError, ErrorCode, type LoginResult, type SessionUser } from '@rg/shared';
import { supabaseAnon, supabaseAdmin } from '../../lib/supabase.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Proxy the Supabase password grant and assemble a LoginResult. org/role come
 * from the user's `app_metadata` (set by the admin module at provisioning) and
 * are cross-checked against our `users`/`organizations` tables.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS);
  }

  const meta = (data.user.app_metadata ?? {}) as { org_id?: string; role?: string };
  if (!meta.org_id || !meta.role) {
    throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, 'User is not provisioned to an organization');
  }

  const org = await prisma.organization.findUnique({ where: { id: meta.org_id } });
  if (!org) throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, 'Organization not found');

  const user: SessionUser = {
    id: data.user.id,
    email: data.user.email ?? email,
    orgId: meta.org_id,
    orgName: org.name,
    role: meta.role as SessionUser['role'],
  };

  return {
    user,
    tokens: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: (data.session.expires_at ?? 0) * 1000,
    },
  };
}

/** Exchange a refresh token for a fresh session. */
export async function refresh(refreshToken: string): Promise<LoginResult['tokens']> {
  const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) throw new AppError(ErrorCode.AUTH_REFRESH_FAILED);
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: (data.session.expires_at ?? 0) * 1000,
  };
}

/** Revoke the current session server-side (idempotent — errors are ignored). */
export async function logout(accessToken: string): Promise<void> {
  try {
    await supabaseAdmin.auth.admin.signOut(accessToken);
  } catch {
    // best-effort: the client clears its own tokens regardless
  }
}
