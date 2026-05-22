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
          navigator as Navigator & {
            wakeLock: { request(t: 'screen'): Promise<WakeLockSentinel> };
          }
        ).wakeLock.request('screen');
      } catch { /* non-critical */ }
    }

    acquire();
    function onVisible() { if (document.visibilityState === 'visible') acquire(); }
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
  function toggle() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }
  return { isFs, toggle };
}

// ─── Display mode ────────────────────────────────────────────────────────────
function useDisplayMode() {
  const [standalone, setStandalone] = useState(
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const h = () => setStandalone(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return standalone;
}

// ─── Breakpoint ──────────────────────────────────────────────────────────────
type BP = 'mobile' | 'tablet-p' | 'tablet-l' | 'tv';
function bp(): BP {
  const w = window.innerWidth;
  if (w < 480) return 'mobile';
  if (w < 768) return 'tablet-p';
  if (w < 1400) return 'tablet-l';
  return 'tv';
}
function useBP(): BP {
  const [v, setV] = useState<BP>(bp);
  useEffect(() => {
    const h = () => setV(bp());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return v;
}

// ─── Idle ────────────────────────────────────────────────────────────────────
function useIdle(ms = 60_000) {
  const [idle, setIdle] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    function reset() {
      setIdle(false);
      clearTimeout(t.current);
      t.current = setTimeout(() => setIdle(true), ms);
    }
    reset();
    window.addEventListener('mousemove', reset);
    window.addEventListener('touchstart', reset);
    return () => {
      clearTimeout(t.current);
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('touchstart', reset);
    };
  }, [ms]);
  return idle;
}

// ─── Shared style tokens ──────────────────────────────────────────────────────
const C = {
  bg: '#FBF8F3',
  bgDark: '#1C1917',
  border: '#E8DDD0',
  borderMid: '#F5EFE8',
  accent: '#D97706',
  muted: '#A8A29E',
  mutedDark: '#57534E',
  text: '#1C1917',
  textSub: '#78716C',
  danger: '#F87171',
  headerBg: '#F5EFE8',
} as const;

// Layout rule: every branch follows this contract:
//   root        → height:100dvh  overflow:hidden  display:flex  flex-direction:column
//   header      → flex-shrink:0
//   body        → flex:1  min-height:0  (children may set overflow-y:auto)
//   footer      → flex-shrink:0
// This guarantees nothing spills outside the viewport.

// ─── Main ────────────────────────────────────────────────────────────────────
export default function CustomerDisplayPage() {
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { isFs, toggle } = useFullscreen();
  const standalone = useDisplayMode();
  const screen = useBP();
  const idle = useIdle(60_000);
  useWakeLock();

  useEffect(() => {
    const ch = new BroadcastChannel('pos-customer-display');
    ch.onmessage = (e: MessageEvent<CartSnapshot | { type: 'clear' }>) => {
      if ('type' in e.data && e.data.type === 'clear') {
        setCart(null);
      } else {
        setCart(e.data as CartSnapshot);
        setLastUpdated(new Date());
      }
    };
    return () => ch.close();
  }, []);

  const hasCart = !!(cart && cart.items.length > 0);

  // ── Screensaver ──
  if (idle && !hasCart) {
    return (
      <div
        className="customer-display-root"
        onClick={toggle}
        style={{ height: '100dvh', overflow: 'hidden', background: C.bgDark, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'none' }}
      >
        <div style={{ fontSize: screen === 'tv' ? 120 : 64, animation: 'cdPulse 3s ease-in-out infinite' }}>🌿</div>
        <div style={{ color: C.mutedDark, fontSize: screen === 'tv' ? 26 : 17, marginTop: 20, letterSpacing: '0.2em' }}>健康生活藥局</div>
        <style>{`@keyframes cdPulse{0%,100%{opacity:.5}50%{opacity:1}}`}</style>
      </div>
    );
  }

  // ── TV (≥1400px): left items col + right dark total panel ──
  if (screen === 'tv') {
    return (
      <div className="customer-display-root" style={ROOT}>
        <Header lastUpdated={lastUpdated} isFs={isFs} toggle={toggle} standalone={standalone} size="lg" />
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 400px' }}>
          {/* items: scrolls internally */}
          <div style={{ minHeight: 0, overflowY: 'auto', padding: '28px 40px', borderRight: `2px solid ${C.border}` }}>
            {!hasCart ? <Idle size="lg" /> : cart!.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 0', borderBottom: `1px solid ${C.borderMid}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ fontSize: 14, color: C.muted, marginTop: 3 }}>${item.unitPrice.toFixed(0)} / 件</div>
                </div>
                <div style={{ fontSize: 20, color: C.textSub, flexShrink: 0, width: 56, textAlign: 'center' }}>×{item.quantity}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: C.accent, flexShrink: 0, width: 130, textAlign: 'right' }}>${item.lineTotal.toFixed(0)}</div>
              </div>
            ))}
          </div>
          {/* total: never scrolls */}
          <div style={{ background: C.bgDark, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 36px', overflow: 'hidden' }}>
            {hasCart && <Summary cart={cart!} totalFontSize={72} labelFontSize={20} rowFontSize={16} />}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // ── Tablet landscape + desktop (768–1400px): stacked, items scroll, summary pinned ──
  if (screen === 'tablet-l') {
    return (
      <div className="customer-display-root" style={ROOT}>
        <Header lastUpdated={lastUpdated} isFs={isFs} toggle={toggle} standalone={standalone} size="md" />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '24px 32px', gap: 16 }}>
          {!hasCart
            ? <Idle size="md" />
            : <>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  <ItemsTable cart={cart!} />
                </div>
                <div style={{ flexShrink: 0, background: C.bgDark, borderRadius: 16, padding: '20px 24px' }}>
                  <Summary cart={cart!} totalFontSize={44} labelFontSize={17} rowFontSize={14} />
                </div>
              </>
          }
        </div>
        <Footer />
      </div>
    );
  }

  // ── Tablet portrait (480–768px): same structure, smaller ──
  if (screen === 'tablet-p') {
    return (
      <div className="customer-display-root cd-safe-top cd-safe-bottom" style={ROOT}>
        <Header lastUpdated={lastUpdated} isFs={isFs} toggle={toggle} standalone={standalone} size="sm" />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '16px 20px', gap: 12 }}>
          {!hasCart
            ? <Idle size="md" />
            : <>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  <ItemsTable cart={cart!} compact />
                </div>
                <div style={{ flexShrink: 0, background: C.bgDark, borderRadius: 14, padding: '16px 20px' }}>
                  <Summary cart={cart!} totalFontSize={36} labelFontSize={15} rowFontSize={13} />
                </div>
              </>
          }
        </div>
        <Footer />
      </div>
    );
  }

  // ── Mobile (<480px): card stack, everything scrolls together ──
  return (
    <div className="customer-display-root cd-safe-top cd-safe-bottom" style={ROOT}>
      <div style={{ flexShrink: 0, background: C.bgDark, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🌿</span>
        <div style={{ flex: 1, color: '#fff', fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>健康生活藥局</div>
        {!standalone && (
          <button onClick={toggle} style={ICON_BTN}>{isFs ? '✕' : '⛶'}</button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!hasCart
          ? <Idle size="sm" />
          : <>
              {cart!.items.map((item, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: C.text, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>× {item.quantity} · ${item.unitPrice.toFixed(0)}/件</div>
                  </div>
                  <div style={{ fontWeight: 800, color: C.accent, fontSize: 16, flexShrink: 0 }}>${item.lineTotal.toFixed(0)}</div>
                </div>
              ))}
              <div style={{ background: C.bgDark, borderRadius: 12, padding: '14px 16px', marginTop: 4 }}>
                <Summary cart={cart!} totalFontSize={34} labelFontSize={14} rowFontSize={12} />
              </div>
            </>
        }
      </div>
      <Footer />
    </div>
  );
}

// ─── Shared layout constants ──────────────────────────────────────────────────
const ROOT: React.CSSProperties = {
  height: '100dvh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  background: C.bg,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const ICON_BTN: React.CSSProperties = {
  background: 'none',
  border: `1px solid ${C.mutedDark}`,
  color: C.muted,
  borderRadius: 8,
  padding: '4px 8px',
  fontSize: 13,
  cursor: 'pointer',
  flexShrink: 0,
  lineHeight: 1.4,
};

// ─── Header ──────────────────────────────────────────────────────────────────
function Header({ lastUpdated, isFs, toggle, standalone, size }: {
  lastUpdated: Date | null;
  isFs: boolean;
  toggle: () => void;
  standalone: boolean;
  size: 'sm' | 'md' | 'lg';
}) {
  const pad = size === 'lg' ? '18px 40px' : size === 'md' ? '14px 32px' : '12px 20px';
  const logoSz = size === 'lg' ? 44 : size === 'md' ? 38 : 32;
  const titleSz = size === 'lg' ? 19 : size === 'md' ? 16 : 14;
  const subSz = size === 'lg' ? 13 : 11;

  return (
    <div style={{ flexShrink: 0, background: C.bgDark, padding: pad, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: logoSz, height: logoSz, borderRadius: Math.round(logoSz * 0.28), background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(logoSz * 0.55), flexShrink: 0 }}>🌿</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: titleSz, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>PharmaSaaS</div>
        <div style={{ color: C.muted, fontSize: subSz }}>健康生活藥局</div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {lastUpdated && (
          <div style={{ color: C.mutedDark, fontSize: 12 }}>{lastUpdated.toLocaleTimeString('zh-TW')}</div>
        )}
        {!standalone && (
          <button onClick={toggle} style={ICON_BTN}>
            {isFs ? '✕ 退出' : '⛶ 全螢幕'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── ItemsTable ───────────────────────────────────────────────────────────────
function ItemsTable({ cart, compact = false }: { cart: CartSnapshot; compact?: boolean }) {
  const rowPad = compact ? '11px 16px' : '14px 20px';
  const nameSz = compact ? 15 : 17;
  const priceSz = compact ? 17 : 20;

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ padding: `10px 20px`, background: C.headerBg, borderBottom: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: '1fr 64px 90px', gap: 12, fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: '0.06em' }}>
        <span>商品</span>
        <span style={{ textAlign: 'center' }}>數量</span>
        <span style={{ textAlign: 'right' }}>小計</span>
      </div>
      {cart.items.map((item, i) => (
        <div key={i} style={{ padding: rowPad, borderBottom: `1px solid ${C.borderMid}`, display: 'grid', gridTemplateColumns: '1fr 64px 90px', gap: 12, alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: nameSz, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
            <div style={{ fontSize: nameSz - 4, color: C.muted, marginTop: 2 }}>${item.unitPrice.toFixed(0)} / 件</div>
          </div>
          <div style={{ fontSize: nameSz, color: C.textSub, textAlign: 'center' }}>×{item.quantity}</div>
          <div style={{ fontSize: priceSz, fontWeight: 800, color: C.accent, textAlign: 'right' }}>${item.lineTotal.toFixed(0)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────
function Summary({ cart, totalFontSize, labelFontSize, rowFontSize }: {
  cart: CartSnapshot;
  totalFontSize: number;
  labelFontSize: number;
  rowFontSize: number;
}) {
  const showBreakdown = cart.subtotal !== cart.total || cart.discount > 0;

  return (
    <div>
      {showBreakdown && (
        <>
          {cart.subtotal !== cart.total && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: rowFontSize, color: '#A8A29E', marginBottom: 5 }}>
              <span>小計</span><span>${cart.subtotal.toFixed(0)}</span>
            </div>
          )}
          {cart.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: rowFontSize, color: C.danger, marginBottom: 5 }}>
              <span>折扣</span><span>-${cart.discount.toFixed(0)}</span>
            </div>
          )}
        </>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: showBreakdown ? '1px solid #2C2A28' : 'none', paddingTop: showBreakdown ? 10 : 0, marginTop: showBreakdown ? 6 : 0 }}>
        <span style={{ fontSize: labelFontSize, fontWeight: 700, color: '#D6D3D1' }}>合計</span>
        <span style={{ fontSize: totalFontSize, fontWeight: 900, color: C.accent, letterSpacing: '-0.03em', lineHeight: 1 }}>
          ${cart.total.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

// ─── Idle placeholder ─────────────────────────────────────────────────────────
function Idle({ size }: { size: 'sm' | 'md' | 'lg' }) {
  const emojiSz = size === 'sm' ? 36 : size === 'md' ? 52 : 72;
  const textSz  = size === 'sm' ? 15 : size === 'md' ? 18 : 24;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: 0.4 }}>
      <div style={{ fontSize: emojiSz }}>🛍️</div>
      <div style={{ fontSize: textSz, color: C.textSub, fontWeight: 500 }}>歡迎光臨！</div>
      <div style={{ fontSize: textSz * 0.7, color: C.muted }}>等待加入商品...</div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <div style={{ flexShrink: 0, padding: '10px 24px', background: C.headerBg, borderTop: `1.5px solid ${C.border}`, textAlign: 'center', fontSize: 12, color: C.muted }}>
      感謝您的光臨 · 請確認品項與金額無誤
    </div>
  );
}
