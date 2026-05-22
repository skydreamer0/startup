import { useEffect, useRef, useState } from 'react';

interface CartItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface CartSnapshot {
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
}

// ─── Wake Lock ───────────────────────────────────────────────────────────────
function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    async function acquire() {
      try {
        lockRef.current = await (
          navigator as Navigator & { wakeLock: { request(t: 'screen'): Promise<WakeLockSentinel> } }
        ).wakeLock.request('screen');
      } catch { /**/ }
    }
    acquire();
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lockRef.current?.release().catch(() => {});
    };
  }, []);
}

// ─── Fullscreen ──────────────────────────────────────────────────────────────
function useFullscreen() {
  const [isFs, setIsFs] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const h = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const toggle = () =>
    document.fullscreenElement
      ? document.exitFullscreen().catch(() => {})
      : document.documentElement.requestFullscreen().catch(() => {});
  return { isFs, toggle };
}

// ─── Standalone / display-mode ───────────────────────────────────────────────
function useStandalone() {
  const [v, setV] = useState(
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const h = () => setV(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return v;
}

// ─── Breakpoint ──────────────────────────────────────────────────────────────
type BP = 'mobile' | 'tablet' | 'tv';
const getBP = (): BP => window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1400 ? 'tablet' : 'tv';
function useBP(): BP {
  const [v, setV] = useState<BP>(getBP);
  useEffect(() => {
    const h = () => setV(getBP());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return v;
}

// ─── Idle screensaver ────────────────────────────────────────────────────────
function useIdle(ms = 60_000) {
  const [idle, setIdle] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const reset = () => { setIdle(false); clearTimeout(t.current); t.current = setTimeout(() => setIdle(true), ms); };
    reset();
    window.addEventListener('mousemove', reset);
    window.addEventListener('touchstart', reset);
    return () => { clearTimeout(t.current); window.removeEventListener('mousemove', reset); window.removeEventListener('touchstart', reset); };
  }, [ms]);
  return idle;
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function CustomerDisplayPage() {
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const { isFs, toggle } = useFullscreen();
  const standalone = useStandalone();
  const bp = useBP();
  const idle = useIdle(60_000);
  useWakeLock();

  useEffect(() => {
    const ch = new BroadcastChannel('pos-customer-display');
    ch.onmessage = (e: MessageEvent<CartSnapshot | { type: 'clear' }>) => {
      if ('type' in e.data && e.data.type === 'clear') setCart(null);
      else setCart(e.data as CartSnapshot);
    };
    return () => ch.close();
  }, []);

  const hasCart = !!(cart?.items.length);

  // ── Screensaver ──────────────────────────────────────────────────────────
  if (idle && !hasCart) {
    return (
      <div
        className="customer-display-root"
        onClick={toggle}
        style={{ height: '100dvh', overflow: 'hidden', background: '#141210', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'none' }}
      >
        <div style={{ fontSize: bp === 'tv' ? 100 : 60, animation: 'cdp 3s ease-in-out infinite' }}>🌿</div>
        <div style={{ color: '#44403C', fontSize: bp === 'tv' ? 22 : 15, marginTop: 16, letterSpacing: '0.25em', fontFamily: 'system-ui, sans-serif' }}>
          健康生活藥局
        </div>
        <style>{`@keyframes cdp{0%,100%{opacity:.35}50%{opacity:.9}}`}</style>
      </div>
    );
  }

  // ── TV: items left | total right ─────────────────────────────────────────
  if (bp === 'tv') {
    return (
      <Layout>
        <SmallHeader isFs={isFs} toggle={toggle} standalone={standalone} />
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 360px' }}>
          <ItemsCol cart={cart} tv />
          <TotalPanel cart={cart} totalSize={80} />
        </div>
      </Layout>
    );
  }

  // ── Tablet + Mobile: items top (scroll) | total bottom (pinned) ──────────
  //
  // Total zone height:  mobile→180px  tablet→220px
  // This ratio (≈30-40% of screen) matches Square/Toast patterns.
  const totalZoneH = bp === 'mobile' ? 172 : 210;

  return (
    <Layout>
      <SmallHeader isFs={isFs} toggle={toggle} standalone={standalone} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* scrollable items */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {!hasCart
            ? <IdlePlaceholder />
            : <ItemsCol cart={cart} tv={false} compact={bp === 'mobile'} />
          }
        </div>
        {/* pinned total */}
        <TotalPanel cart={cart} totalSize={bp === 'mobile' ? 56 : 68} height={totalZoneH} />
      </div>
    </Layout>
  );
}

// ─── Layout shell ─────────────────────────────────────────────────────────────
// height:100dvh + overflow:hidden guarantees nothing escapes the viewport.
function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="customer-display-root"
      style={{ height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#FAFAF9', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {children}
    </div>
  );
}

// ─── Minimal header strip (≤40px) ────────────────────────────────────────────
// Deliberate: small. The customer doesn't need branding — they need the total.
function SmallHeader({ isFs, toggle, standalone }: { isFs: boolean; toggle: () => void; standalone: boolean }) {
  return (
    <div style={{ flexShrink: 0, height: 38, background: '#1C1917', display: 'flex', alignItems: 'center', paddingInline: 14, gap: 8 }}>
      <span style={{ fontSize: 16 }}>🌿</span>
      <span style={{ color: '#78716C', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }}>健康生活藥局</span>
      {!standalone && (
        <button
          onClick={toggle}
          style={{ marginLeft: 'auto', background: 'none', border: '1px solid #3C3835', color: '#57534E', borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer', lineHeight: 1.6 }}
        >
          {isFs ? '退出' : '⛶'}
        </button>
      )}
    </div>
  );
}

// ─── Items column ──────────────────────────────────────────────────────────────
// Single-line row: name | qty | line-total   (~42px per row)
// No sub-line unit price — that's merchant info, not customer-facing.
function ItemsCol({ cart, tv, compact = false }: { cart: CartSnapshot | null; tv: boolean; compact?: boolean }) {
  if (!cart?.items.length) return <IdlePlaceholder />;

  const rowH   = tv ? 52 : compact ? 40 : 46;
  const nameSz = tv ? 18 : compact ? 13 : 15;
  const numSz  = tv ? 18 : compact ? 14 : 16;
  const px     = tv ? 32 : 12;
  const py     = tv ? 14 : 10;

  return (
    <div>
      {/* column header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 48px 80px', paddingInline: px, paddingBlock: 6, borderBottom: '1px solid #E7E5E4', background: '#F5F4F2' }}>
        <span style={{ fontSize: 11, color: '#A8A29E', fontWeight: 700, letterSpacing: '0.05em' }}>商品</span>
        <span style={{ fontSize: 11, color: '#A8A29E', fontWeight: 700, textAlign: 'center' }}>數量</span>
        <span style={{ fontSize: 11, color: '#A8A29E', fontWeight: 700, textAlign: 'right' }}>小計</span>
      </div>
      {cart.items.map((item, i) => (
        <div
          key={i}
          style={{ display: 'grid', gridTemplateColumns: '1fr 48px 80px', alignItems: 'center', paddingInline: px, paddingBlock: py, minHeight: rowH, borderBottom: '1px solid #F0EFEE' }}
        >
          {/* name: truncate — never let long names blow the grid */}
          <span style={{ fontSize: nameSz, fontWeight: 600, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
            {item.name}
          </span>
          <span style={{ fontSize: numSz, color: '#78716C', textAlign: 'center' }}>
            ×{item.quantity}
          </span>
          <span style={{ fontSize: numSz, fontWeight: 700, color: '#D97706', textAlign: 'right' }}>
            ${item.lineTotal.toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Total panel ──────────────────────────────────────────────────────────────
// Dark background, huge number — the only thing the customer really cares about.
function TotalPanel({ cart, totalSize, height }: { cart: CartSnapshot | null; totalSize: number; height?: number }) {
  const showBreakdown = !!(cart && cart.discount > 0);

  return (
    <div style={{
      flexShrink: 0,
      background: '#1C1917',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      paddingInline: height ? 16 : 36,
      paddingBlock: height ? 0 : 36,
      gap: 4,
      ...(height ? { height } : { borderLeft: '2px solid #2C2A28' }),
      overflow: 'hidden',
    }}>
      {/* breakdown row — only when there's a discount */}
      {showBreakdown && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#57534E', marginBottom: 4 }}>
          <span>小計 ${cart!.subtotal.toFixed(0)}</span>
          <span style={{ color: '#F87171' }}>折扣 -${cart!.discount.toFixed(0)}</span>
        </div>
      )}

      {/* label */}
      <div style={{ fontSize: height ? 13 : 16, color: '#78716C', fontWeight: 600, letterSpacing: '0.06em' }}>
        合計
      </div>

      {/* THE number */}
      <div style={{
        fontSize: totalSize,
        fontWeight: 900,
        color: cart ? '#F59E0B' : '#3C3835',
        letterSpacing: '-0.03em',
        lineHeight: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {cart ? `$${cart.total.toFixed(0)}` : '——'}
      </div>
    </div>
  );
}

// ─── Empty / idle placeholder ─────────────────────────────────────────────────
function IdlePlaceholder() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: 0.35, padding: 24 }}>
      <span style={{ fontSize: 40 }}>🛍️</span>
      <span style={{ fontSize: 15, color: '#78716C' }}>等待加入商品</span>
    </div>
  );
}
