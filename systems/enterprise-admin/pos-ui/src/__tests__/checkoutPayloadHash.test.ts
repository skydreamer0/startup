import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CheckoutPayload } from '@pharmasaas/types';
import vectors from '../../../infrastructure/api/checkout-command-hash-v1.json';
import { checkoutPayloadHash } from '../services/checkoutPayloadHash';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());
describe('Checkout normalization v1 contract', () => {
  it.each(vectors)('$name matches the backend/browser contract fingerprint', async ({ payload, sha256 }) => {
    expect(await checkoutPayloadHash(payload as CheckoutPayload)).toBe(sha256);
    expect(await checkoutPayloadHash({ ...payload, commandId: crypto.randomUUID(), adminPin: 'synthetic-secret' } as CheckoutPayload)).toBe(sha256);
  });
});
