import crypto from 'node:crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim();
const ADMIN_TOKEN_SECRET =
  process.env.ADMIN_TOKEN_SECRET?.trim() || ADMIN_PASSWORD || 'sheba-admin-dev-secret';

export function adminEnabled(): boolean {
  return Boolean(ADMIN_PASSWORD);
}

export function createAdminToken(): string {
  return crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update('sheba-admin').digest('hex');
}

export function verifyAdminPassword(password: string): boolean {
  return Boolean(ADMIN_PASSWORD && password === ADMIN_PASSWORD);
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!adminEnabled() || !token) return false;
  const expected = createAdminToken();
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
}
