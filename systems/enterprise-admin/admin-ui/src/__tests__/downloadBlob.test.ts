import { describe, expect, it, vi } from 'vitest';
import { downloadAuthenticatedBlob, type BlobDownloadClient } from '../api/requestLifecycle';

describe('downloadAuthenticatedBlob', () => {
    it('uses the shared API client blob response path', async () => {
        const blob = new Blob(['report']);
        const get = vi.fn(async () => ({ data: blob }));
        const client: BlobDownloadClient = {
            get: get as BlobDownloadClient['get'],
        };

        const result = await downloadAuthenticatedBlob(client, '/excel/export/products');

        expect(result).toBe(blob);
        expect(get).toHaveBeenCalledWith('/excel/export/products', { responseType: 'blob' });
    });
});
