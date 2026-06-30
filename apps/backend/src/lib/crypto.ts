import crypto from 'node:crypto';
import { env } from '../env.js';

/**
 * Symmetric encryption for secrets that must be stored server-side at rest
 * (currently: per-organization external upload-API passwords).
 *
 * AES-256-GCM with a 32-byte key derived from EXTERNAL_API_ENC_KEY via scrypt
 * (so any sufficiently long passphrase works; for production use a random
 * 32-byte base64 value). The key NEVER leaves the backend, so even a Postgres
 * read leak does not reveal the plaintext password.
 *
 * Ciphertext format: `v1:<iv b64>:<authTag b64>:<data b64>`.
 */
const KEY = crypto.scryptSync(env.EXTERNAL_API_ENC_KEY, 'return-genie:extapi:v1', 32);
const IV_BYTES = 12;

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Malformed encrypted secret');
  }
  const iv = Buffer.from(parts[1]!, 'base64');
  const tag = Buffer.from(parts[2]!, 'base64');
  const data = Buffer.from(parts[3]!, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
