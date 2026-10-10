/**
 * PROTOTYPE — POS Checkout UI design exploration. Throwaway. Delete after direction is chosen.
 * Run: navigate to /pos/prototype?v=A (or B, C)
 */
import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

// ─── Shared demo data ────────────────────────────────────────────────────────

const CATEGORIES = ['全部', 'OTC 藥品', '保健食品', '醫療器材', '個人護理'];

const PRODUCTS = [
    { id: '1', name: 'Vitamin C 1000mg', price: 280, category: '保健食品', stock: 42 },
    { id: '2', name: 'Panadol Extra 錠劑', price: 120, category: 'OTC 藥品', stock: 15 },
    { id: '3', name: 'Omega-3 魚油軟膠囊', price: 450, category: '保健食品', stock: 8 },
    { id: '4', name: '制酸劑咀嚼錠', price: 85, category: 'OTC 藥品', stock: 30 },
    { id: '5', name: '每日綜合維他命', price: 320, category: '保健食品', stock: 22 },
    { id: '6', name: 'Ibuprofen 400mg', price: 95, category: 'OTC 藥品', stock: 18 },
    { id: '7', name: 'N95 口罩 (10入)', price: 199, category: '醫療器材', stock: 55 },
    { id: '8', name: '洗手凝膠 500ml', price: 69, category: '個人護理', stock: 33 },
    { id: '9', name: '血壓計 (臂式)', price: 1490, category: '醫療器材', stock: 4 },
    { id: '10', name: '益生菌膠囊 30顆', price: 380, category: '保健食品', stock: 11 },
    { id: '11', name: 'A+D 軟膏', price: 145, category: 'OTC 藥品', stock: 20 },
    { id: '12', name: '保濕乳霜 200ml', price: 260, category: '個人護理', stock: 14 },
];

type CartItem = { id: string; name: string; price: number; qty: number };

function useCart() {
    const [cart, setCart] = useState<CartItem[]>([]);
    const add = (p: typeof PRODUCTS[0]) => setCart(prev => {
        const found = prev.find(i => i.id === p.id);
        if (found) return prev.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
        return [...prev, { id: p.id, name: p.name, price: p.price, qty: 1 }];
    });
    const remove = (id: string) => setCart(prev => prev.filter(i => i.id !== id));
    const adjust = (id: string, delta: number) => setCart(prev =>
        prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
    );
    const clear = () => setCart([]);
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    return { cart, add, remove, adjust, clear, total };
}

// ─── Variant A — "Retail Grid" (clean, category-tab, card grid) ──────────────

function VariantA() {
    const [cat, setCat] = useState('全部');
    const [search, setSearch] = useState('');
    const { cart, add, remove, adjust, clear, total } = useCart();
    const filtered = PRODUCTS.filter(p =>
        (cat === '全部' || p.category === cat) &&
        p.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
            {/* Top bar */}
            <header style={{ background: '#1e293b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 56, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px' }}><img src={`${import.meta.env.BASE_URL}brand/flow-capsule-v1/mark-dark.svg`} alt="" width={32} height={32} style={{ verticalAlign: 'middle', marginRight: 8 }} />PharmaPOS</span>
                    <span style={{ background: '#334155', borderRadius: 6, padding: '2px 10px', fontSize: 12, color: '#94a3b8' }}>班次 #S-241</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>收銀員：陳小明</span>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>14:32</span>
                    <Link to="/dashboard" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none', background: '#334155', padding: '4px 12px', borderRadius: 6 }}>離開</Link>
                </div>
            </header>

            {/* Category tabs */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 24px', display: 'flex', gap: 4, overflowX: 'auto', flexShrink: 0 }}>
                {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setCat(c)} style={{
                        padding: '10px 16px', border: 'none', borderBottom: cat === c ? '2px solid #6366f1' : '2px solid transparent',
                        background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: cat === c ? 700 : 400,
                        color: cat === c ? '#6366f1' : '#475569', whiteSpace: 'nowrap', transition: 'all 0.15s',
                    }}>
                        {c}
                    </button>
                ))}
                <div style={{ flex: 1 }} />
                <input
                    placeholder="搜尋商品..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ margin: '8px 0', padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 200, outline: 'none' }}
                />
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Product grid */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                        {filtered.map(p => (
                            <button key={p.id} onClick={() => add(p)} style={{
                                background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px 14px',
                                cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8,
                                transition: 'all 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
                            >
                                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p.category}</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.35 }}>{p.name}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 }}>
                                    <span style={{ fontSize: 16, fontWeight: 800, color: '#6366f1' }}>NT${p.price}</span>
                                    <span style={{ fontSize: 11, color: p.stock <= 10 ? '#ef4444' : '#94a3b8' }}>庫存 {p.stock}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Cart */}
                <aside style={{ width: 320, background: '#fff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>購物車 ({cart.length} 項)</span>
                        {cart.length > 0 && <button onClick={clear} style={{ fontSize: 12, color: '#94a3b8', border: 'none', background: 'none', cursor: 'pointer' }}>清空</button>}
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
                        {cart.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#cbd5e1', gap: 8 }}>
                                <span style={{ fontSize: 40 }}>🛒</span>
                                <span style={{ fontSize: 13 }}>點擊商品加入購物車</span>
                            </div>
                        ) : cart.map(item => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                                    <div style={{ fontSize: 12, color: '#6366f1', marginTop: 2 }}>NT${item.price} × {item.qty}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                    <button onClick={() => adjust(item.id, -1)} style={{ width: 24, height: 24, border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                    <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                                    <button onClick={() => adjust(item.id, 1)} style={{ width: 24, height: 24, border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                    <button onClick={() => remove(item.id)} style={{ width: 24, height: 24, border: 'none', borderRadius: 6, background: '#fee2e2', color: '#ef4444', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ padding: 20, borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>合計</span>
                            <span style={{ fontSize: 24, fontWeight: 800, color: '#6366f1' }}>NT${total.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <button style={{ flex: 1, height: 44, border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569' }}>折扣</button>
                            <button style={{ flex: 1, height: 44, border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569' }}>備註</button>
                        </div>
                        <button disabled={cart.length === 0} style={{
                            width: '100%', height: 52, background: cart.length === 0 ? '#e2e8f0' : '#6366f1',
                            color: cart.length === 0 ? '#94a3b8' : '#fff', border: 'none', borderRadius: 12,
                            fontSize: 16, fontWeight: 800, cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                            transition: 'background 0.15s', letterSpacing: '-0.25px',
                        }}>
                            結帳 {cart.length > 0 ? `NT$${total.toLocaleString()}` : ''}
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
}

// ─── Variant B — "Dark Command" (dark, keyboard-fast, minimalist) ─────────────

function VariantB() {
    const [search, setSearch] = useState('');
    const { cart, add, remove, adjust, clear, total } = useCart();
    const filtered = PRODUCTS.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.category.includes(search));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117', fontFamily: '"SF Mono", "Fira Code", monospace', color: '#e6edf3' }}>
            {/* Top bar */}
            <header style={{ background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px', height: 48, flexShrink: 0 }}>
                <span style={{ color: '#58a6ff', fontWeight: 700, fontSize: 14 }}>⬡ POS</span>
                <span style={{ color: '#8b949e', fontSize: 12 }}>班次 S-241</span>
                <div style={{ flex: 1 }} />
                <span style={{ color: '#8b949e', fontSize: 12 }}>14:32</span>
                <Link to="/dashboard" style={{ fontSize: 12, color: '#8b949e', textDecoration: 'none', padding: '3px 8px', border: '1px solid #30363d', borderRadius: 4 }}>← exit</Link>
            </header>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left: search + product list */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #21262d' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '8px 12px' }}>
                            <span style={{ color: '#58a6ff', fontSize: 14 }}>›</span>
                            <input
                                autoFocus
                                placeholder="搜尋商品名稱、分類..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#e6edf3', fontSize: 14, fontFamily: 'inherit' }}
                            />
                            <span style={{ color: '#6e7681', fontSize: 11 }}>{filtered.length} 項</span>
                        </div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {filtered.map((p, i) => (
                            <button key={p.id} onClick={() => add(p)} style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '11px 16px',
                                background: 'none', border: 'none', borderBottom: '1px solid #21262d',
                                cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s', color: '#e6edf3',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = '#161b22'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                                <span style={{ color: '#484f58', fontSize: 11, width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                    <div style={{ fontSize: 11, color: '#6e7681', marginTop: 1 }}>{p.category} · 庫存 {p.stock}</div>
                                </div>
                                <span style={{ color: '#3fb950', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>NT${p.price}</span>
                                <span style={{ color: '#484f58', fontSize: 12, flexShrink: 0 }}>+</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right: cart */}
                <div style={{ width: 300, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #21262d', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 12, color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>CART</span>
                        {cart.length > 0 && <button onClick={clear} style={{ fontSize: 11, color: '#f85149', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>clear</button>}
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {cart.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#484f58', fontSize: 13 }}>empty</div>
                        ) : cart.map(item => (
                            <div key={item.id} style={{ padding: '10px 16px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                                    <div style={{ fontSize: 11, color: '#3fb950', marginTop: 2 }}>NT${item.price} × {item.qty} = NT${item.price * item.qty}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button onClick={() => adjust(item.id, -1)} style={{ background: '#21262d', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>-</button>
                                    <button onClick={() => adjust(item.id, 1)} style={{ background: '#21262d', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>+</button>
                                    <button onClick={() => remove(item.id)} style={{ background: '#21262d', border: '1px solid #30363d', color: '#f85149', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>×</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ padding: 16, borderTop: '1px solid #21262d', flexShrink: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{ fontSize: 12, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>TOTAL</span>
                            <span style={{ fontSize: 22, fontWeight: 700, color: '#3fb950' }}>NT${total.toLocaleString()}</span>
                        </div>
                        <button disabled={cart.length === 0} style={{
                            width: '100%', height: 44, background: cart.length === 0 ? '#21262d' : '#238636',
                            color: cart.length === 0 ? '#484f58' : '#fff', border: '1px solid',
                            borderColor: cart.length === 0 ? '#30363d' : '#2ea043',
                            borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit', letterSpacing: '0.05em',
                        }}>
                            {cart.length === 0 ? 'CHECKOUT' : `CHECKOUT  NT$${total.toLocaleString()}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Variant C — "Warm Touch" (tablet-first, warm colors, bold) ──────────────

function VariantC() {
    const [cat, setCat] = useState('全部');
    const { cart, add, remove, adjust, clear, total } = useCart();
    const filtered = PRODUCTS.filter(p => cat === '全部' || p.category === cat);

    const CAT_COLORS: Record<string, string> = {
        '全部': '#f59e0b', 'OTC 藥品': '#ef4444', '保健食品': '#22c55e', '醫療器材': '#3b82f6', '個人護理': '#a855f7',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fffbf0', fontFamily: '"Inter", system-ui, sans-serif' }}>
            {/* Header */}
            <header style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
                padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
                <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>PharmaSaaS POS</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>班次 S-241 · 收銀員 陳小明</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '6px 14px', color: '#fff', fontSize: 15, fontWeight: 700 }}>14:32</div>
                    <Link to="/dashboard" style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 14px', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>離開</Link>
                </div>
            </header>

            {/* Category pills */}
            <div style={{ background: '#fff', padding: '12px 20px', display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setCat(c)} style={{
                        height: 40, padding: '0 18px', border: 'none', borderRadius: 20, cursor: 'pointer',
                        fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', transition: 'all 0.15s',
                        background: cat === c ? CAT_COLORS[c] || '#f59e0b' : '#f1f5f9',
                        color: cat === c ? '#fff' : '#64748b',
                        boxShadow: cat === c ? `0 4px 12px ${CAT_COLORS[c]}55` : 'none',
                    }}>
                        {c}
                    </button>
                ))}
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Products */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                        {filtered.map(p => {
                            const inCart = cart.find(i => i.id === p.id);
                            const color = CAT_COLORS[p.category] || '#f59e0b';
                            return (
                                <button key={p.id} onClick={() => add(p)} style={{
                                    background: '#fff', border: `2px solid ${inCart ? color : '#f1f5f9'}`,
                                    borderRadius: 16, padding: '18px 16px', cursor: 'pointer', textAlign: 'left',
                                    display: 'flex', flexDirection: 'column', gap: 10, transition: 'all 0.15s',
                                    boxShadow: inCart ? `0 4px 16px ${color}30` : '0 2px 6px rgba(0,0,0,0.06)',
                                    position: 'relative',
                                }}>
                                    {inCart && (
                                        <div style={{ position: 'absolute', top: 10, right: 10, background: color, color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                                            {inCart.qty}
                                        </div>
                                    )}
                                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                                        {p.category === 'OTC 藥品' ? '💊' : p.category === '保健食品' ? '🌿' : p.category === '醫療器材' ? '🩺' : '🧴'}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.35 }}>{p.name}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>庫存 {p.stock}</div>
                                    </div>
                                    <div style={{ fontSize: 20, fontWeight: 900, color: color }}>
                                        NT${p.price}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Cart */}
                <aside style={{ width: 340, background: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0, boxShadow: '-4px 0 16px rgba(0,0,0,0.06)' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>購物車</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {cart.length > 0 && <span style={{ background: '#f59e0b', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{cart.reduce((s, i) => s + i.qty, 0)}</span>}
                            {cart.length > 0 && <button onClick={clear} style={{ fontSize: 13, color: '#94a3b8', border: 'none', background: 'none', cursor: 'pointer' }}>清空</button>}
                        </div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
                        {cart.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: '#cbd5e1' }}>
                                <div style={{ fontSize: 56 }}>🛍️</div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>購物車是空的</div>
                            </div>
                        ) : cart.map(item => (
                            <div key={item.id} style={{ padding: '12px 0', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                                    <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 700, marginTop: 3 }}>NT${item.price * item.qty}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', borderRadius: 12, overflow: 'hidden' }}>
                                    <button onClick={() => item.qty === 1 ? remove(item.id) : adjust(item.id, -1)} style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {item.qty === 1 ? '🗑' : '−'}
                                    </button>
                                    <span style={{ fontSize: 15, fontWeight: 800, minWidth: 28, textAlign: 'center', color: '#0f172a' }}>{item.qty}</span>
                                    <button onClick={() => adjust(item.id, 1)} style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ padding: 20 }}>
                        {cart.length > 0 && (
                            <div style={{ background: '#fffbf0', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>
                                    <span>小計</span><span>NT${total.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8', marginBottom: 10 }}>
                                    <span>折扣</span><span>-</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
                                    <span>合計</span><span style={{ color: '#f59e0b' }}>NT${total.toLocaleString()}</span>
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button style={{ flex: 1, height: 50, border: '2px solid #f1f5f9', borderRadius: 14, background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#64748b' }}>折扣</button>
                            <button disabled={cart.length === 0} style={{
                                flex: 2, height: 50, border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 900,
                                background: cart.length === 0 ? '#f1f5f9' : 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
                                color: cart.length === 0 ? '#94a3b8' : '#fff', cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                                boxShadow: cart.length > 0 ? '0 4px 14px rgba(245,158,11,0.4)' : 'none',
                            }}>
                                結帳 {cart.length > 0 ? `NT$${total.toLocaleString()}` : ''}
                            </button>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}

// ─── Switcher shell ───────────────────────────────────────────────────────────

const VARIANTS = [
    { key: 'A', label: 'A — Retail Grid', desc: '分類 tab + 卡片格，簡潔企業風' },
    { key: 'B', label: 'B — Dark Command', desc: '暗色搜尋導向，鍵盤快速操作' },
    { key: 'C', label: 'C — Warm Touch', desc: '暖色觸控優先，平板友善' },
];

export default function PosCheckoutPrototype() {
    const [params, setParams] = useSearchParams();
    const v = params.get('v') || 'A';

    useEffect(() => {
        if (!['A', 'B', 'C'].includes(v)) setParams({ v: 'A' });
    }, [v, setParams]);

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Prototype banner */}
            <div style={{ background: '#fef3c7', borderBottom: '1px solid #f59e0b', color: '#92400e', textAlign: 'center', padding: '5px 16px', fontSize: 12, fontWeight: 600, flexShrink: 0, zIndex: 50 }}>
                ⚠️ PROTOTYPE — 選定方向後刪除此頁面
            </div>

            {/* Variant content */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {v === 'A' && <VariantA />}
                {v === 'B' && <VariantB />}
                {v === 'C' && <VariantC />}
            </div>

            {/* Floating switcher */}
            <div style={{
                position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(12px)',
                borderRadius: 16, padding: '10px 14px', display: 'flex', gap: 8, zIndex: 1000,
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
            }}>
                {VARIANTS.map(vt => (
                    <button key={vt.key} onClick={() => setParams({ v: vt.key })} title={vt.desc} style={{
                        height: 36, padding: '0 16px', border: 'none', borderRadius: 10, cursor: 'pointer',
                        fontSize: 13, fontWeight: v === vt.key ? 700 : 500, transition: 'all 0.15s',
                        background: v === vt.key ? '#6366f1' : 'rgba(255,255,255,0.1)',
                        color: v === vt.key ? '#fff' : 'rgba(255,255,255,0.6)',
                        boxShadow: v === vt.key ? '0 2px 8px rgba(99,102,241,0.5)' : 'none',
                    }}>
                        {vt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
