// Keep the existing decoder: gaps > 300ms reset the buffer; Enter emits
// trimmed codes with at least three characters. Sequence events only describe
// input ownership so consumers can defer effects while input is unfinished.

let buffer = '';
let lastKeyTime = 0;

type BarcodeCallback = (code: string) => void;
const subscribers = new Set<BarcodeCallback>();

export interface BarcodeSequenceEvent {
  kind: 'started' | 'completed' | 'cancelled';
  id: number;
  target: EventTarget | null;
}
const sequenceSubscribers = new Set<(event: BarcodeSequenceEvent) => void>();
let nextSequenceId = 0;
let sequence: { id: number; target: EventTarget | null; key: string } | null = null;
let sequenceTimer: ReturnType<typeof setTimeout> | undefined;

function endSequence(kind: 'completed' | 'cancelled') {
  clearTimeout(sequenceTimer);
  sequenceTimer = undefined;
  const ended = sequence;
  sequence = null;
  if (ended) sequenceSubscribers.forEach((cb) => cb({ kind, id: ended.id, target: ended.target }));
}

function expireSequence() {
  const remaining = 301 - (Date.now() - lastKeyTime);
  if (remaining > 0) sequenceTimer = setTimeout(expireSequence, remaining);
  else endSequence('cancelled');
}

export function getBarcodeInputSequence(event: Event): number | null {
  if (!(event instanceof InputEvent) || !sequence || event.target !== sequence.target
    || event.inputType !== 'insertText' || event.isComposing || event.data !== sequence.key) return null;
  return sequence.id;
}

export function onBarcodeSequence(cb: (event: BarcodeSequenceEvent) => void): () => void {
  sequenceSubscribers.add(cb);
  return () => sequenceSubscribers.delete(cb);
}

function handleKeydown(e: KeyboardEvent) {
  // Native control activation belongs to that control, never the scanner.
  // In particular Space must not start a sequence and remove a choice before click.
  const target = e.target;
  if (e.defaultPrevented || (target instanceof Element && target.closest(
    'button, [role="button"], a[href], [role="link"], select, textarea, [contenteditable]:not([contenteditable="false"])',
  ))) {
    endSequence('cancelled');
    buffer = '';
    return;
  }
  const now = Date.now();
  if (now - lastKeyTime > 300) {
    endSequence('cancelled');
    buffer = '';
  }
  lastKeyTime = now;

  if (e.key === 'Enter') {
    const code = buffer.trim();
    buffer = '';
    // Mark a completed scan as consumed before page-wide Enter shortcuts run.
    if (code.length >= 3) e.preventDefault();
    endSequence(code.length >= 3 ? 'completed' : 'cancelled');
    if (code.length >= 3) {
      subscribers.forEach((cb) => cb(code));
    }
    return;
  }

  if (e.key.length === 1) {
    if (sequence && sequence.target !== e.target) endSequence('cancelled');
    if (!buffer) {
      const started = { id: ++nextSequenceId, target: e.target, key: e.key };
      sequence = started;
      sequenceSubscribers.forEach((cb) => cb({ kind: 'started', id: started.id, target: started.target }));
    } else if (sequence) sequence.key = e.key;
    buffer += e.key;
    if (sequence) {
      clearTimeout(sequenceTimer);
      sequenceTimer = setTimeout(expireSequence, 301);
    }
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    endSequence('cancelled');
  }
}

export function startBarcodeListener() {
  document.addEventListener('keydown', handleKeydown);
}

export function stopBarcodeListener() {
  document.removeEventListener('keydown', handleKeydown);
  endSequence('cancelled');
}

export function onBarcode(cb: BarcodeCallback): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
