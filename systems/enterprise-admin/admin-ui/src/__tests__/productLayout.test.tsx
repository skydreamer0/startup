import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductListPage from '../pages/Inventory/ProductListPage';

const { getProducts, getSuppliers, createProduct, updateProduct } = vi.hoisted(() => ({
    getProducts: vi.fn(), getSuppliers: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(),
}));
vi.mock('../api/inventory', () => ({ inventoryApi: { getProducts, getSuppliers, createProduct, updateProduct } }));
// Expose all existing plan-gated controls to exercise the widest toolbar contract.
vi.mock('../components/PlanGate', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));

const globalCss = readFileSync('src/index.css', 'utf8');
const localCssPath = 'src/pages/Inventory/ProductListPage.css';
const localCss = existsSync(localCssPath) ? readFileSync(localCssPath, 'utf8') : '';
const tableRules = [...globalCss.matchAll(/\.table-container\s*\{[^}]*\}/g)].map(([rule]) => rule).join('\n');
// Replay the existing narrow-screen header direction as a conservative cascade probe.
// JSDOM does not evaluate viewport media queries.
const headerRules = [...globalCss.matchAll(/\.page-header\s*\{[^}]*\}/g)].map(([rule]) => rule).join('\n');
const clients: QueryClient[] = [];
let stylesheet: HTMLStyleElement;

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    return render(<QueryClientProvider client={client}><ProductListPage /></QueryClientProvider>);
}

beforeEach(() => {
    vi.clearAllMocks();
    getProducts.mockResolvedValue({ total: 1, page: 1, limit: 50, data: [{
        id: 'synthetic-layout-product', sku: 'SYNTHETIC-LONG-SKU-'.repeat(8),
        name: '合成商品名稱'.repeat(20), supplier: { id: 'synthetic-supplier', name: 'Synthetic supplier '.repeat(15) },
        costPrice: '10', retailPrice: '20', stockQuantity: 8, safetyStock: 2,
    }] });
    getSuppliers.mockResolvedValue([]);
    stylesheet = document.createElement('style');
    // JSDOM has no layout engine. These are CSS/DOM contracts, not viewport,
    // real scrolling, native keyboard, screenshot or complete browser acceptance.
    // Keep both actual global table rules in order, including the late clipping rule.
    stylesheet.textContent = `${tableRules}\n${headerRules}\n${localCss}`;
    document.head.append(stylesheet);
});

afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
    stylesheet.remove();
});

describe('product page scoped layout contracts (not browser geometry)', () => {
    it('allows the full toolbar and pagination to wrap without changing their controls', async () => {
        setup();
        await screen.findByRole('table');
        const header = screen.getByRole('heading', { name: 'Inventory (Products)' }).closest('header')!;
        const toolbar = screen.getByRole('combobox', { name: 'Inventory filter' }).parentElement!;
        expect(headerRules).toContain('flex-direction: column');
        expect(getComputedStyle(header).flexDirection).toBe('row');
        expect(getComputedStyle(header).flexWrap).toBe('wrap');
        expect(getComputedStyle(toolbar).flexWrap).toBe('wrap');
        expect(getComputedStyle(toolbar).minWidth).toBe('0');
        for (const name of ['Export Products', 'Export Inventory', 'Import Products', 'Add Product']) {
            expect(within(toolbar).getByRole('button', { name })).toBeEnabled();
        }
        expect(getComputedStyle(screen.getByRole('navigation', { name: 'Product pagination' })).flexWrap).toBe('wrap');
    });

    it('overrides the real late clipping rule only for the product table', async () => {
        const { container } = setup();
        const table = await screen.findByRole('table');
        const scroll = table.parentElement!;
        expect(tableRules).toContain('overflow: hidden');
        expect(getComputedStyle(scroll).overflow).toBe('auto');
        expect(getComputedStyle(scroll).maxWidth).toBe('100%');
        expect(getComputedStyle(table).minWidth).toBe('760px');
        expect(getComputedStyle(table.querySelector('td')!).overflowWrap).toBe('anywhere');
        const unrelated = document.createElement('div');
        unrelated.className = 'table-container';
        container.append(unrelated);
        expect(getComputedStyle(unrelated).overflow).toBe('hidden');
    });

    it('names the horizontal scroll region and includes it in keyboard navigation', async () => {
        setup();
        await screen.findByRole('table');
        const region = screen.getByRole('region', { name: 'Products table' });
        expect(region).toHaveAttribute('tabindex', '0');
        expect(within(region).getByRole('table')).toBeInTheDocument();
        expect(localCss).toContain('.product-table-scroll:focus-visible');
    });

    it.each(['Add Product', 'Edit'] as const)('leaves the existing %s form and its overlay behavior unchanged', async (action) => {
        setup();
        await screen.findByRole('table');
        fireEvent.click(screen.getByRole('button', { name: action }));
        const title = action === 'Edit' ? 'Edit Product' : 'Add Product';
        const panel = screen.getByRole('heading', { name: title }).parentElement!;
        const overlay = panel.parentElement!;
        // Do not add a fixed blocking overlay without a complete dialog lifecycle.
        // This layout slice must leave the original editor DOM and styles alone.
        expect(overlay).toHaveAttribute('class', 'modal-overlay');
        expect(panel).toHaveAttribute('class', 'modal-content card');
        expect(getComputedStyle(overlay).position).not.toBe('fixed');
        expect(getComputedStyle(panel).maxHeight).toBe('');
        expect(localCss).not.toContain('product-editor');
        expect(localCss).not.toContain('modal-');
        expect(within(panel).getByRole('button', { name: action === 'Edit' ? 'Save Changes' : 'Create Product' })).toBeEnabled();
        // Cancellation still does not write or expose an editable stock field.
        const stock = within(panel).getByText('Stock Quantity').nextElementSibling!;
        expect(stock.tagName).toBe('OUTPUT');
        expect(stock).toHaveTextContent(action === 'Edit' ? '8' : '0');
        fireEvent.click(within(panel).getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument();
        expect(createProduct).not.toHaveBeenCalled();
        expect(updateProduct).not.toHaveBeenCalled();
    });

    it('keeps import modal styles and every local rule inside the product page scope', async () => {
        setup();
        await screen.findByRole('table');
        fireEvent.click(screen.getByRole('button', { name: 'Import Products' }));
        const panel = screen.getByRole('heading', { name: 'Import Products from Excel' }).parentElement!;
        // Import is a separate existing component and does not get product-editor hooks.
        expect(panel).not.toHaveClass('product-editor');
        expect(getComputedStyle(panel.parentElement!).position).not.toBe('fixed');
        const selectors = [...localCss.matchAll(/([^{}]+)\{/g)].flatMap(([, group]) =>
            group.replace(/\/\*[\s\S]*?\*\//g, '').trim().split(',').map((selector) => selector.trim()));
        expect(selectors.length).toBeGreaterThan(0);
        expect(selectors.every((selector) => selector.startsWith('.inventory-product-page'))).toBe(true);
    });
});
