import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryService } from '../inventory.service';

const database = vi.hoisted(() => ({
    count: vi.fn(),
    findMany: vi.fn(),
    safetyStock: Object.freeze({ name: 'safetyStock' }),
}));

vi.mock('../../../lib/prisma', () => ({
    prisma: {
        product: {
            count: database.count,
            findMany: database.findMany,
            fields: { safetyStock: database.safetyStock },
        },
    },
}));

type Product = {
    id: string;
    name: string;
    stockQuantity: number;
    safetyStock: number;
    supplier: { id: string; name: string } | null;
    category: { id: string; name: string } | null;
};
type Query = {
    where?: { stockQuantity?: { lte: number | typeof database.safetyStock } };
    skip?: number;
    take?: number;
    orderBy?: Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];
};

const product = (id: string, name: string, stockQuantity: number, safetyStock: number): Product => ({
    id, name, stockQuantity, safetyStock,
    supplier: { id: 'supplier', name: 'Synthetic supplier' },
    category: { id: 'category', name: 'Synthetic category' },
});

let rows: Product[];

const matching = (query: Query) => rows.filter((row) => {
    const lte = query.where?.stockQuantity?.lte;
    return lte === undefined || row.stockQuantity <= (typeof lte === 'number' ? lte : row.safetyStock);
});

beforeEach(() => {
    vi.clearAllMocks();
    rows = [
        product('e', 'E', 0, 0),
        product('d', 'D', 2, 2),
        product('c', 'C', 1, 3),
        product('b', 'B', 10, 3),
        product('a', 'A', 10, 3),
    ];
    database.count.mockImplementation(async (query: Query = {}) => matching(query).length);
    database.findMany.mockImplementation(async (query: Query) => {
        const order = Array.isArray(query.orderBy) ? query.orderBy : [query.orderBy ?? {}];
        const sorted = matching(query).sort((left, right) => {
            for (const clause of order) {
                const key = Object.keys(clause)[0] as 'name' | 'id';
                if (!key) continue;
                const compared = left[key].localeCompare(right[key]);
                if (compared) return clause[key] === 'asc' ? compared : -compared;
            }
            return 0;
        });
        const skip = query.skip ?? 0;
        return sorted.slice(skip, query.take === undefined ? undefined : skip + query.take);
    });
});

describe('InventoryService product pagination', () => {
    it('fills the first low-stock page after filtering and reports the full filtered total', async () => {
        const result = await InventoryService.getProducts({ lowStock: 'true', limit: '2' });

        expect(result).toMatchObject({ total: 3, page: 1, limit: 2 });
        expect(result.data.map((row) => row.id)).toEqual(['c', 'd']);
    });

    it('orders equal names by ID across pages regardless of seed order', async () => {
        rows = ['d', 'c', 'b', 'a'].map((id) => product(id, 'Same name', 0, 1));

        const first = await InventoryService.getProducts({ lowStock: 'true', limit: '2' });
        const second = await InventoryService.getProducts({ lowStock: 'true', page: '2', limit: '2' });

        expect([...first.data, ...second.data].map((row) => row.id)).toEqual(['a', 'b', 'c', 'd']);
        expect([first.total, second.total]).toEqual([4, 4]);
    });

    it('keeps the full filtered total on the last and beyond-end pages', async () => {
        const last = await InventoryService.getProducts({ lowStock: 'true', page: '2', limit: '2' });
        const beyond = await InventoryService.getProducts({ lowStock: 'true', page: '3', limit: '2' });

        expect(last).toMatchObject({ total: 3, page: 2, limit: 2 });
        expect(last.data.map((row) => row.id)).toEqual(['e']);
        expect(beyond).toEqual({ total: 3, page: 3, limit: 2, data: [] });
    });

    it('uses the same field comparison for count and rows and retains relations and low-stock flags', async () => {
        const result = await InventoryService.getProducts({ lowStock: 'true' });

        expect(result.data.map((row) => [row.id, row.isLowStock])).toEqual([
            ['c', true], ['d', true], ['e', true],
        ]);
        expect(result.data[0]).toMatchObject({
            supplier: { id: 'supplier', name: 'Synthetic supplier' },
            category: { id: 'category', name: 'Synthetic category' },
        });
        const predicate = { stockQuantity: { lte: database.safetyStock } };
        expect(database.count).toHaveBeenCalledWith({ where: predicate });
        expect(database.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: predicate, include: { supplier: true, category: true },
        }));
    });

    it.each([undefined, 'false'])('returns all products with lowStock=%s and keeps defaults', async (lowStock) => {
        const result = await InventoryService.getProducts({ lowStock });

        expect(result).toMatchObject({ total: 5, page: 1, limit: 50 });
        expect(result.data.map((row) => [row.id, row.isLowStock])).toEqual([
            ['a', false], ['b', false], ['c', true], ['d', true], ['e', true],
        ]);
    });
});
