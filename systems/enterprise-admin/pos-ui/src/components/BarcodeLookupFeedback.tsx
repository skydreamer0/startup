import type { BarcodeLookupStatus } from '../hooks/useBarcodeScanner';

export function BarcodeLookupFeedback({ status }: { status: BarcodeLookupStatus }) {
  if (!status) return null;
  const failed = status.kind === 'error' || status.kind === 'forbidden';
  return <p role={failed ? 'alert' : 'status'} aria-live={failed ? 'assertive' : 'polite'}
    className="rounded-lg border p-3 text-base"
    style={{ borderColor: 'var(--border)', color: failed ? 'var(--danger)' : 'var(--text-primary)',
      background: failed ? 'var(--danger-bg)' : 'var(--bg-card)' }}>{status.message}</p>;
}
