import { useEffect, useState } from 'react';
import { getPendingCount } from '../services/offlineQueue';

interface Props {
  onSync?: () => void;
}

export default function OfflineStatus({ onSync }: Props) {
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      getPendingCount().then((n) => { if (!cancelled) setPendingCount(n); }).catch(() => {});
    }
    refresh();
    const id = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const dotColor = online ? '#10B981' : '#F59E0B';
  const dotLabel = online ? '連線中' : '離線中';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{dotLabel}</span>
      {pendingCount > 0 && (
        <>
          <span style={{ background: '#F59E0B', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
            {pendingCount} 筆待同步
          </span>
          {online && onSync && (
            <button
              type="button"
              onClick={onSync}
              style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-card)', cursor: 'pointer' }}
            >
              同步
            </button>
          )}
        </>
      )}
    </div>
  );
}
