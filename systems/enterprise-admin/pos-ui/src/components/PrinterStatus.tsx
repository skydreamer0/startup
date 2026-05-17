import { useEffect, useState } from 'react';
import { getPrinterStatus, PrinterType } from '../services/receiptService';

const LABELS: Record<PrinterType, string> = {
  usb: 'USB 印表機',
  fallback: '瀏覽器列印',
  unavailable: '無列印',
};

const COLORS: Record<PrinterType, string> = {
  usb: '#10B981',
  fallback: '#94A3B8',
  unavailable: '#EF4444',
};

export default function PrinterStatus() {
  const [status, setStatus] = useState<PrinterType>('fallback');

  useEffect(() => {
    getPrinterStatus().then(setStatus).catch(() => setStatus('fallback'));
    // Re-check when USB devices change (Chrome only)
    if ('usb' in navigator) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usb = (navigator as unknown as { usb: any }).usb;
      const refresh = () => getPrinterStatus().then(setStatus).catch(() => {});
      usb.addEventListener('connect', refresh);
      usb.addEventListener('disconnect', refresh);
      return () => {
        usb.removeEventListener('connect', refresh);
        usb.removeEventListener('disconnect', refresh);
      };
    }
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLORS[status], display: 'inline-block', flexShrink: 0 }} />
      <span style={{ whiteSpace: 'nowrap' }}>{LABELS[status]}</span>
    </div>
  );
}
