import type { BarcodeLookupStatus } from '../hooks/useBarcodeScanner';

export function BarcodeLookupFeedback({ status }: { status: BarcodeLookupStatus }) {
  if (!status) return null;
  const failed = status.kind === 'error' || status.kind === 'forbidden';
  const tone = failed ? 'danger'
    : status.kind === 'ambiguous' ? 'warning'
    : status.kind === 'loading' ? 'info'
    : 'neutral';

  return <p role={failed ? 'alert' : 'status'} aria-live={failed ? 'assertive' : 'polite'}
    className={`pos-barcode-feedback pos-barcode-feedback--${tone} rounded-lg border p-3 text-base`}
  >{status.message}</p>;
}
