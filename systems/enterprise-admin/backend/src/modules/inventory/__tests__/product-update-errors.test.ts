import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { InventoryService } from '../inventory.service';

const database = vi.hoisted(() => ({ update: vi.fn(), findUnique: vi.fn() }));
vi.mock('../../../lib/prisma', () => ({ prisma: { product: database } }));

beforeEach(() => { vi.resetAllMocks(); });
const knownError = (code: string) => new Prisma.PrismaClientKnownRequestError(
    'Synthetic private database diagnostic', { code, clientVersion: '6.19.3' },
);

describe('InventoryService product update error contract (mocked delegate)', () => {
    it('maps missing or tenant-hidden P2025 to the same generic 404 as a read miss', async () => {
        database.update.mockRejectedValueOnce(knownError('P2025'));
        database.findUnique.mockResolvedValueOnce(null);
        await expect(InventoryService.updateProduct('hidden', { name: 'updated' })).rejects.toMatchObject({
            statusCode: 404, errorCode: 'NOT_FOUND', message: 'Product not found',
        });
        expect(database.findUnique).not.toHaveBeenCalled();
        expect(database.update).toHaveBeenCalledExactlyOnceWith({ where: { id: 'hidden' }, data: { name: 'updated' } });
        await expect(InventoryService.getProductById('hidden')).rejects.toMatchObject({
            statusCode: 404, errorCode: 'NOT_FOUND', message: 'Product not found',
        });
    });

    it('preserves a successful update, its original payload and returned object', async () => {
        const data = { name: 'updated', supplierId: 'supplier' };
        const result = { id: 'owned-product', ...data };
        database.update.mockResolvedValueOnce(result);
        await expect(InventoryService.updateProduct('owned-product', data)).resolves.toBe(result);
        expect(database.update).toHaveBeenCalledExactlyOnceWith({ where: { id: 'owned-product' }, data });
        expect(database.findUnique).not.toHaveBeenCalled();
    });

    it.each(['P2002', 'P2003', 'P1001'])('propagates %s unchanged without retry', async (code) => {
        const error = knownError(code);
        database.update.mockRejectedValueOnce(error);
        await expect(InventoryService.updateProduct('x', {})).rejects.toBe(error);
        expect(database.update).toHaveBeenCalledTimes(1);
        expect(database.findUnique).not.toHaveBeenCalled();
    });

    it.each([new Error('offline'), { code: 'P2025' }])('does not mask non-Prisma errors %#', async (error) => {
        database.update.mockRejectedValueOnce(error);
        await expect(InventoryService.updateProduct('x', {})).rejects.toBe(error);
        expect(database.update).toHaveBeenCalledTimes(1);
    });

    it.each([0, 1, -1])('rejects direct stock write %s before the delegate', async (stockQuantity) => {
        await expect(InventoryService.updateProduct('x', { stockQuantity })).rejects.toMatchObject({ statusCode: 400 });
        expect(database.update).not.toHaveBeenCalled();
    });
});
