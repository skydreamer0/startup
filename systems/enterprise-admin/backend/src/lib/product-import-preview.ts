import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { AppError } from './errors';
import { requireTenantId } from './tenant.context';

const claimsSchema = z.object({
  version: z.literal(1), tenantId: z.string().min(1),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  normalizedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int().positive(),
});

function signature(payload: string) {
  // Separate signing domain; these two-part attestations are not access JWTs.
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(`product-import-preview:v1:${payload}`).digest();
}

export function issueProductImportPreview(fileHash: string, normalizedRevision: string) {
  const claims = claimsSchema.parse({ version: 1, tenantId: requireTenantId(), fileHash, normalizedRevision, expiresAt: Date.now() + 15 * 60_000 });
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return { previewToken: `${payload}.${signature(payload).toString('base64url')}`, fileHash, normalizedRevision, expiresAt: claims.expiresAt };
}

export function verifyProductImportPreview(token: string) {
  const tenantId = requireTenantId();
  if (!/^[A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new AppError(400, '請先預覽商品匯入檔案，再確認匯入');
  }
  const [payload, suppliedSignature] = token.split('.');
  const expected = signature(payload);
  const supplied = Buffer.from(suppliedSignature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new AppError(400, '匯入預覽憑證無效，請重新預覽');
  }
  let claims;
  try { claims = claimsSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))); }
  catch { throw new AppError(400, '匯入預覽憑證無效，請重新預覽'); }
  if (claims.tenantId !== tenantId) throw new AppError(403, '匯入預覽不屬於此門店');
  if (claims.expiresAt <= Date.now()) throw new AppError(409, '匯入預覽已過期，請重新預覽');
  return claims;
}
