import { z } from 'zod';
import { Role } from './common.js';

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const AuthTokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number().int(), // epoch ms
});
export type AuthTokens = z.infer<typeof AuthTokens>;

export const SessionUser = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  orgId: z.string().uuid(),
  orgName: z.string(),
  role: Role,
});
export type SessionUser = z.infer<typeof SessionUser>;

export const LoginResult = z.object({
  user: SessionUser,
  tokens: AuthTokens,
});
export type LoginResult = z.infer<typeof LoginResult>;

export const RefreshInput = z.object({ refreshToken: z.string() });
export type RefreshInput = z.infer<typeof RefreshInput>;
