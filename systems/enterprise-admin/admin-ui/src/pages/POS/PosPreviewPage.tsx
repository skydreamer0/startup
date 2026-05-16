import { Link } from 'react-router-dom';

const DEMO_PRODUCTS = [
    { id: '1', name: 'Vitamin C 1000mg', price: 280, category: 'Health' },
    { id: '2', name: 'Panadol Extra', price: 120, category: 'OTC Drugs' },
    { id: '3', name: 'Omega-3 Fish Oil', price: 450, category: 'Health' },
    { id: '4', name: 'Antacid Tablets', price: 85, category: 'OTC Drugs' },
    { id: '5', name: 'Multivitamin Daily', price: 320, category: 'Health' },
    { id: '6', name: 'Ibuprofen 400mg', price: 95, category: 'OTC Drugs' },
];

export default function PosPreviewPage() {
    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--color-canvas-soft, #f6f9fc)',
            fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        }}>
            {/* Prototype banner */}
            <div style={{
                background: '#fef3c7',
                borderBottom: '1px solid #f59e0b',
                color: '#92400e',
                textAlign: 'center',
                padding: '6px 16px',
                fontSize: '0.8125rem',
                fontWeight: 600,
            }}>
                ⚠️ PROTOTYPE — Phase 9 POS UI placeholder. Not production-ready.
            </div>

            {/* POS Topbar */}
            <header style={{
                height: '56px',
                background: 'var(--color-canvas, #fff)',
                borderBottom: '1px solid var(--color-hairline, #e3e8ee)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
            }}>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-primary, #533afd)' }}>
                    PharmaSaaS POS
                </span>
                <Link
                    to="/dashboard"
                    style={{
                        fontSize: '0.875rem',
                        color: 'var(--text-secondary, #475569)',
                        textDecoration: 'none',
                    }}
                >
                    ← Back to Admin
                </Link>
            </header>

            {/* Main layout: product grid + cart */}
            <div style={{ display: 'flex', height: 'calc(100vh - 88px)' }}>
                {/* Product grid */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                    <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary, #475569)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Products
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                        {DEMO_PRODUCTS.map(p => (
                            <button
                                key={p.id}
                                style={{
                                    background: 'var(--color-canvas, #fff)',
                                    border: '1px solid var(--color-hairline, #e3e8ee)',
                                    borderRadius: '10px',
                                    padding: '16px 12px',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    minHeight: '100px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    transition: 'box-shadow 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)')}
                                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                            >
                                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)', lineHeight: 1.3 }}>
                                    {p.name}
                                </span>
                                <span className="price" style={{ fontSize: '1rem', color: 'var(--color-primary, #533afd)', marginTop: '8px', display: 'block' }}>
                                    NT${p.price}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Cart panel */}
                <aside style={{
                    width: '300px',
                    background: 'var(--color-canvas, #fff)',
                    borderLeft: '1px solid var(--color-hairline, #e3e8ee)',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '20px',
                }}>
                    <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary, #475569)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Cart
                    </h2>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #94a3b8)', fontSize: '0.875rem' }}>
                        Cart is empty — click a product to add
                    </div>
                    <div style={{ borderTop: '1px solid var(--color-hairline, #e3e8ee)', paddingTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>Total</span>
                            <span className="price-md" style={{ color: 'var(--text-primary, #0f172a)' }}>NT$0</span>
                        </div>
                        <button
                            disabled
                            style={{
                                width: '100%',
                                height: '52px',
                                background: 'var(--color-primary, #533afd)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '10px',
                                fontSize: '1rem',
                                fontWeight: 700,
                                cursor: 'not-allowed',
                                opacity: 0.5,
                            }}
                        >
                            Checkout
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
}
