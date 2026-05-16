// Barcode scanners send characters very quickly (< 50ms between keystrokes).
// This service collects rapid keystrokes and fires a callback when Enter is received.

let buffer = '';
let lastKeyTime = 0;

type BarcodeCallback = (code: string) => void;
const subscribers = new Set<BarcodeCallback>();

function handleKeydown(e: KeyboardEvent) {
  const now = Date.now();
  if (now - lastKeyTime > 300) {
    buffer = '';
  }
  lastKeyTime = now;

  if (e.key === 'Enter') {
    const code = buffer.trim();
    buffer = '';
    if (code.length >= 3) {
      subscribers.forEach((cb) => cb(code));
    }
    return;
  }

  if (e.key.length === 1) {
    buffer += e.key;
  }
}

export function startBarcodeListener() {
  document.addEventListener('keydown', handleKeydown);
}

export function stopBarcodeListener() {
  document.removeEventListener('keydown', handleKeydown);
}

export function onBarcode(cb: BarcodeCallback): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
