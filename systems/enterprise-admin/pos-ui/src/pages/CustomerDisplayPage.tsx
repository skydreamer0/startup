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

// ─── Wake Lock ──────────────────────────────────────────────────────────────
function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return;

    async function acquire() {
      try {
        lockRef.current = await (navigator as Navigator & { wakeLock: { request(type: 'screen'): Promise<WakeLockSentinel> } }).wakeLock.request('screen');
      } catch { /* non-critical */ }
    }

    acquire();

    // Re-acquire when page becomes visible again (e.g. tab switch back)
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') acquire();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      lockRef.current?.release().catch(() => {});
    };
  }, []);
}

// ─── Fullscreen toggle ───────────────────────────────────────────────────────
function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    function onChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function toggle() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  return { isFullscreen, toggle };
}

// ─── Display mode detection ──────────────────────────────────────────────────
function useDisplayMode() {
  const [mode, setMode] = useState<'browser' | 'standalone' | 'fullscreen'>('browser');

  useEffect(() => {
    function detect() {
      if (window.matchMedia('(display-mode: fullscreen)').matches) setMode('fullscreen');
      else if (window.matchMedia('(display-mode: standalone)').matches) setMode('standalone');
      else setMode('browser');
    }
    detect();
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', detect);
    return () => mq.removeEventListener('change', detect);
  }, []);

  return mode;
}

// ─── Responsive breakpoint ───────────────────────────────────────────────────
type Breakpoint = 'mobile' | 'tablet-portrait' | 'tablet-landscape' | 'tv';

function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(getBreakpoint);

  function getBreakpoint(): Breakpoint {
    const w = window.innerWidth;
    if (w < 480) return 'mobile';
    if (w < 768) return 'tablet-portrait';
    if (w < 1400) return 'tablet-landscape';
    return 'tv';
  }

  useEffect(() => {
    function onResize() { setBp(getBreakpoint()); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return bp;
}

// ─── Idle / screensaver state ────────────────────────────────────────────────
function useIdle(timeoutMs = 30_000) {
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    function reset() {
      setIdle(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setIdle(true), timeoutMs);
    }
    reset();
    window.addEventListener('mousemove', reset);
    window.addEventListener('touchstart', reset);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('touchstart', reset);
    };
  }, [timeoutMs]);

  return idle;
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function CustomerDisplayPage() {
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const displayMode = useDisplayMode();
  const bp = useBreakpoint();
  const idle = useIdle(60_000);
  useWakeLock();

  useEffect(() => {
    const channel = new BroadcastChannel('pos-customer-display');
    channel.onmessage = (e: MessageEvent<CartSnapshot | { type: 'clear' }>) => {
      if ('type' in e.data && e.data.type === 'clear') {
        setCart(null);
      } else {
        setCart(e.data as CartSnapshot);
        setLastUpdated(new Date());
      }
    };
    return () => channel.close();
  }, []);

  const isTV = bp === 'tv';
  const isMobile = bp === 'mobile';
  const isTabletPortrait = bp === 'tablet-portrait';
  const isStandalone = displayMode !== 'browser';

  // Screensaver / idle state
  if (idle && (!cart || cart.items.length === 0)) {
    return (
      <div
        className="customer-display-root"
        onClick={toggleFullscreen}
        style={{
          minHeight: '100dvh',
          background: '#1C1917',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'none',
        }}
      >
        <div style={{ fontSize: isTV ? 120 : 72, animation: 'pulse 3s ease-in-out infinite' }}>🌿</div>
        <div style={{ color: '#78716C', fontSize: isTV ? 28 : 18, marginTop: 24, letterSpacing: '0.2em' }}>
          健康生活藥局
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }`}</style>
      </div>
    );
  }

  const hasCart = cart && cart.items.length > 0;

  // TV / large screen: items left, total right
  if (isTV && hasCart) {
    return (
      <div className="customer-display-root" style={{ minHeight: '100dvh', background: '#FBF8F3', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
        <TVHeader lastUpdated={lastUpdated} isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} isStandalone={isStandalone} />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0, overflow: 'hidden' }}>
          {/* Items */}
          <div style={{ padding: '32px 40px', overflowY: 'auto', borderRight: '2px solid #E8DDD0' }}>
            <div style={{ fontSize: 13, color: '#A8A29E', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 20 }}>購物明細</div>
            {cart.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '18px 0', borderBottom: '1px solid #F5EFE8', gap: 20 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1C1917' }}>{item.name}</div>
                  <div style={{ fontSize: 15, color: '#A8A29E', marginTop: 4 }}>${item.unitPrice.toFixed(0)} / 件</div>
                </div>
                <div style={{ fontSize: 20, color: '#78716C', width: 60, textAlign: 'center' }}>×{item.quantity}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#D97706', width: 120, textAlign: 'right' }}>${item.lineTotal.toFixed(0)}</div>
              </div>
            ))}
          </div>

          {/* Total panel */}
          <div style={{ background: '#1C1917', padding: '40px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 24 }}>
            <SummaryBlock cart={cart} tvMode />
          </div>
        </div>
        <TVFooter />
      </div>
    );
  }

  // Mobile portrait: compact stacked
  if (isMobile) {
    return (
      <div className="customer-display-root cd-safe-top cd-safe-bottom" style={{ minHeight: '100dvh', background: '#FBF8F3', display: 'flex', flexDirection: 'column', fontSize: 14, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: '#1C1917', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🌿</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>健康生活藥局</div>
          </div>
          <button onClick={toggleFullscreen} style={{ background: 'none', border: '1px solid #57534E', color: '#A8A29E', borderRadius: 8, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
            {isFullscreen ? '✕ 退出' : '⛶ 全螢幕'}
          </button>
        </div>

        <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          {!hasCart ? (
            <IdleMessage size="small" />
          ) : (
            <>
              {cart.items.map((item, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #E8DDD0', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#1C1917', fontSize: 14 }}>{item.name}</div>
                    <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 2 }}>× {item.quantity} · ${item.unitPrice.toFixed(0)}/件</div>
                  </div>
                  <div style={{ fontWeight: 800, color: '#D97706', fontSize: 16 }}>${item.lineTotal.toFixed(0)}</div>
                </div>
              ))}
              <div style={{ background: '#1C1917', borderRadius: 12, padding: '16px 18px', marginTop: 4 }}>
                <SummaryBlock cart={cart} />
              </div>
            </>
          )}
        </div>
        <div style={{ padding: '10px 14px', background: '#F5EFE8', borderTop: '1px solid #E8DDD0', textAlign: 'center', fontSize: 11, color: '#A8A29E' }}>
          感謝您的光臨 · 請確認品項與金額
        </div>
      </div>
    );
  }

  // Tablet portrait: stacked, medium size
  if (isTabletPortrait) {
    return (
      <div className="customer-display-root cd-safe-top cd-safe-bottom" style={{ minHeight: '100dvh', background: '#FBF8F3', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
        <StandardHeader lastUpdated={lastUpdated} isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} compact />
        <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {!hasCart ? (
            <IdleMessage size="medium" />
          ) : (
            <>
              <ItemsTable cart={cart} rowPadding="14px 18px" nameFontSize={16} priceFontSize={18} />
              <div style={{ background: '#1C1917', borderRadius: 16, padding: '20px 22px' }}>
                <SummaryBlock cart={cart} />
              </div>
            </>
          )}
        </div>
        <TVFooter />
      </div>
    );
  }

  // Default: tablet landscape + small desktop
  return (
    <div className="customer-display-root cd-safe-top cd-safe-bottom" style={{ minHeight: '100dvh', background: '#FBF8F3', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      <StandardHeader lastUpdated={lastUpdated} isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} />
      <div style={{ flex: 1, padding: '28px 36px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
        {!hasCart ? (
          <IdleMessage size="medium" />
        ) : (
          <>
            <ItemsTable cart={cart} />
            <div style={{ background: '#1C1917', borderRadius: 16, padding: '24px 28px' }}>
              <SummaryBlock cart={cart} />
            </div>
          </>
        )}
      </div>
      <TVFooter />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TVHeader({ lastUpdated, isFullscreen, onToggleFullscreen, isStandalone }: {
  lastUpdated: Date | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isStandalone: boolean;
}) {
  return (
    <div style={{ background: '#1C1917', padding: '20px 40px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>🌿</div>
      <div>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 22 }}>PharmaSaaS</div>
        <div style={{ color: '#A8A29E', fontSize: 14 }}>健康生活藥局</div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
        {lastUpdated && (
          <div style={{ color: '#57534E', fontSize: 14 }}>{lastUpdated.toLocaleTimeString('zh-TW')}</div>
        )}
        {!isStandalone && (
          <button onClick={onToggleFullscreen} style={{ background: 'none', border: '1px solid #57534E', color: '#A8A29E', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
            {isFullscreen ? '✕ 退出全螢幕' : '⛶ 全螢幕'}
          </button>
        )}
      </div>
    </div>
  );
}

function StandardHeader({ lastUpdated, isFullscreen, onToggleFullscreen, compact = false }: {
  lastUpdated: Date | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  compact?: boolean;
}) {
  const pad = compact ? '14px 24px' : '18px 36px';
  const logoSize = compact ? 36 : 42;
  const titleSize = compact ? 15 : 18;

  return (
    <div style={{ background: '#1C1917', padding: pad, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: logoSize, height: logoSize, borderRadius: 10, background: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: logoSize * 0.55, flexShrink: 0 }}>🌿</div>
      <div>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: titleSize }}>PharmaSaaS</div>
        <div style={{ color: '#A8A29E', fontSize: compact ? 11 : 13 }}>健康生活藥局</div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        {lastUpdated && (
          <div style={{ color: '#57534E', fontSize: 12 }}>{lastUpdated.toLocaleTimeString('zh-TW')}</div>
        )}
        <button onClick={onToggleFullscreen} style={{ background: 'none', border: '1px solid #57534E', color: '#A8A29E', borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
          {isFullscreen ? '✕ 退出' : '⛶ 全螢幕'}
        </button>
      </div>
    </div>
  );
}

function ItemsTable({ cart, rowPadding = '16px 20px', nameFontSize = 17, priceFontSize = 20 }: {
  cart: CartSnapshot;
  rowPadding?: string;
  nameFontSize?: number;
  priceFontSize?: number;
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #E8DDD0', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', background: '#F5EFE8', borderBottom: '1px solid #E8DDD0', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, fontSize: 12, color: '#A8A29E', fontWeight: 700, letterSpacing: '0.06em' }}>
        <span>商品</span>
        <span style={{ textAlign: 'right' }}>數量</span>
        <span style={{ textAlign: 'right', minWidth: 80 }}>小計</span>
      </div>
      {cart.items.map((item, i) => (
        <div key={i} style={{ padding: rowPadding, borderBottom: '1px solid #FAF6F2', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: nameFontSize, fontWeight: 700, color: '#1C1917' }}>{item.name}</div>
            <div style={{ fontSize: nameFontSize - 4, color: '#A8A29E', marginTop: 2 }}>${item.unitPrice.toFixed(0)} / 件</div>
          </div>
          <div style={{ fontSize: nameFontSize, color: '#78716C', textAlign: 'right' }}>× {item.quantity}</div>
          <div style={{ fontSize: priceFontSize, fontWeight: 800, color: '#D97706', textAlign: 'right', minWidth: 80 }}>${item.lineTotal.toFixed(0)}</div>
        </div>
      ))}
    </div>
  );
}

function SummaryBlock({ cart, tvMode = false }: { cart: CartSnapshot; tvMode?: boolean }) {
  const totalSize = tvMode ? 72 : 42;
  const labelSize = tvMode ? 20 : 15;
  const rowSize = tvMode ? 16 : 13;

  return (
    <>
      {tvMode && (
        <div style={{ fontSize: 13, color: '#57534E', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>結帳金額</div>
      )}
      {cart.subtotal !== cart.total && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: rowSize, color: '#78716C', marginBottom: 6 }}>
          <span>小計</span><span>${cart.subtotal.toFixed(0)}</span>
        </div>
      )}
      {cart.discount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: rowSize, color: '#F87171', marginBottom: 6 }}>
          <span>折扣</span><span>-${cart.discount.toFixed(0)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: tvMode ? '1px solid #3C3835' : '1px solid #2C2C2C', paddingTop: tvMode ? 20 : 12, marginTop: tvMode ? 12 : 6 }}>
        <span style={{ fontSize: labelSize, fontWeight: 700, color: '#D6D3D1' }}>合計</span>
        <span style={{ fontSize: totalSize, fontWeight: 900, color: '#D97706', letterSpacing: '-0.03em', lineHeight: 1 }}>
          ${cart.total.toFixed(0)}
        </span>
      </div>
    </>
  );
}

function IdleMessage({ size }: { size: 'small' | 'medium' | 'large' }) {
  const emojiSize = size === 'small' ? 40 : size === 'medium' ? 56 : 80;
  const textSize = size === 'small' ? 16 : size === 'medium' ? 20 : 28;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, opacity: 0.45 }}>
      <div style={{ fontSize: emojiSize }}>🛍️</div>
      <div style={{ fontSize: textSize, color: '#78716C', fontWeight: 500 }}>歡迎光臨！</div>
      <div style={{ fontSize: textSize * 0.65, color: '#A8A29E' }}>等待加入商品...</div>
    </div>
  );
}

function TVFooter() {
  return (
    <div style={{ padding: '12px 32px', background: '#F5EFE8', borderTop: '1.5px solid #E8DDD0', textAlign: 'center', fontSize: 12, color: '#A8A29E' }}>
      感謝您的光臨 · 請確認品項與金額無誤
    </div>
  );
}
