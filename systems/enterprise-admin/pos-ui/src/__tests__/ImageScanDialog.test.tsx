import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImageScanDialog from '../components/ImageScanDialog';
import { decodeImageScan, ImageScanError } from '../services/imageScanDecoder';
import type { ImageScanEvidence } from '../services/imageScanResult';

vi.mock('../services/imageScanDecoder', () => ({
  decodeImageScan: vi.fn(),
  ImageScanError: class extends Error { constructor(readonly code: string) { super(code); } },
}));

function observation(literal: string): ImageScanEvidence {
  return {
    scan: { contractVersion: 1, source: 'image', literal,
      bytes: { status: 'observed', value: [0, 29, 65] }, symbology: { status: 'observed', value: 'qr' },
      gs1: { status: 'unknown' }, decoder: { name: 'zxing-wasm/reader', version: '3.1.2' },
      evidence: { inputRoute: 'image-file', hardwareVerified: false } },
    decoderObservation: { text: literal, bytes: [0, 29, 65], bytesECI: [0, 29, 65], format: 'QRCode',
      symbologyIdentifier: ']Q1', isValid: true, error: '', extra: '{}', sequenceSize: -1, sequenceIndex: -1, sequenceId: '', orientation: 0, isMirrored: false, isInverted: false, lineCount: 0, symbol: { data: [], width: 0, height: 0 }, version: '', readerInit: false, ecLevel: '', symbology: 'QRCode', hasECI: false, contentType: 'Text',
      position: { topLeft: { x: 0, y: 0 }, topRight: { x: 10, y: 0 }, bottomRight: { x: 10, y: 10 }, bottomLeft: { x: 0, y: 10 } } },
  };
}
const file = () => new File(['synthetic transport fixture; decoder is mocked in UI tests'], 'test.png', { type: 'image/png' });
const choose = () => screen.getByLabelText('選擇條碼或 QR Code 圖片');
const confirm = () => screen.getByRole('button', { name: '確認這段辨識文字' });
const createObjectURL = vi.fn(() => 'blob:synthetic-local-image');
const revokeObjectURL = vi.fn();
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
beforeEach(() => {
  vi.resetAllMocks();
  createObjectURL.mockReturnValue('blob:synthetic-local-image');
  URL.createObjectURL = createObjectURL; URL.revokeObjectURL = revokeObjectURL;
});
afterEach(() => {
  cleanup();
  URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
});

describe('local image evidence UI (synthetic decoder adapter)', () => {
  it('imports and previews literal evidence, requiring explicit selection then human confirmation', async () => {
    const user = userEvent.setup();
    const literal = '  001aB\u001d\r\nhttps://example.invalid  ';
    vi.mocked(decodeImageScan).mockResolvedValue([observation(literal)]);
    render(<ImageScanDialog onClose={vi.fn()} />);
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    try {
      expect(confirm()).toBeDisabled();
      await user.upload(choose(), file());
      expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:synthetic-local-image');
      expect(confirm()).toBeDisabled();
      expect(screen.getByRole('radio')).not.toBeChecked();
      await user.click(screen.getByRole('radio'));
      expect(confirm()).toBeEnabled();
      expect(JSON.parse(screen.getByLabelText('圖片掃描證據 JSON').textContent!).scan.literal).toBe(literal);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      await user.click(confirm());
      expect(screen.getByRole('status')).toHaveTextContent('已人工確認本次辨識文字');
      expect(confirm()).toBeDisabled();
      expect(storage).not.toHaveBeenCalled();
      expect(decodeImageScan).toHaveBeenCalledOnce();
    } finally { storage.mockRestore(); }
  });

  it('preserves multiple symbols separately and clears confirmation when selection or image changes', async () => {
    const user = userEvent.setup();
    vi.mocked(decodeImageScan).mockResolvedValue([observation('A'), observation('B')]);
    render(<ImageScanDialog onClose={vi.fn()} />);
    await user.upload(choose(), file());
    const radios = await screen.findAllByRole('radio');
    expect(radios).toHaveLength(2); expect(radios.every(radio => !(radio as HTMLInputElement).checked)).toBe(true);
    await user.click(radios[0]); await user.click(confirm());
    await user.click(radios[1]); expect(confirm()).toBeEnabled();
    expect(screen.getByRole('status')).not.toHaveTextContent('已人工確認');
    await user.click(confirm());
    await user.upload(choose(), file());
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-local-image');
    expect(confirm()).toBeDisabled();
    expect(screen.getByRole('status')).not.toHaveTextContent('已人工確認');
  });

  it('labels a structured-append segment without claiming a complete assembled payload', async () => {
    const user = userEvent.setup();
    const part = observation('PARTIAL');
    vi.mocked(decodeImageScan).mockResolvedValue([{ ...part, decoderObservation: {
      ...part.decoderObservation, sequenceSize: 0, sequenceIndex: 1, sequenceId: 'opaque',
    } }]);
    render(<ImageScanDialog onClose={vi.fn()} />);
    await user.upload(choose(), file());
    expect(await screen.findByText('分段條碼：第 2 段，總段數 未知。此處未合併其他段。')).toBeInTheDocument();
    expect(confirm()).toBeDisabled();
  });

  it('distinguishes no code from decode failure, clears old evidence and retries the same filename', async () => {
    const user = userEvent.setup();
    vi.mocked(decodeImageScan).mockResolvedValueOnce([]).mockRejectedValueOnce(new ImageScanError('decoder-unavailable')).mockResolvedValueOnce([observation('RETRY')]);
    render(<ImageScanDialog onClose={vi.fn()} />);
    await user.upload(choose(), file());
    expect(await screen.findByText(/未找到支援的條碼/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.upload(choose(), file());
    expect(await screen.findByRole('alert')).toHaveTextContent('本地辨識元件載入失敗');
    expect(screen.queryByRole('img')).not.toBeInTheDocument(); expect(confirm()).toBeDisabled();
    await user.upload(choose(), file());
    expect(await screen.findByRole('radio')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(decodeImageScan).toHaveBeenCalledTimes(3);
  });

  it('drops older success and older failure after a newer file selection', async () => {
    const user = userEvent.setup();
    let resolve!: (value: readonly ImageScanEvidence[]) => void;
    let reject!: (reason: Error) => void;
    vi.mocked(decodeImageScan)
      .mockImplementationOnce(() => new Promise(yes => { resolve = yes; }))
      .mockImplementationOnce(() => new Promise((_, no) => { reject = no; }))
      .mockResolvedValueOnce([observation('NEW')]);
    render(<ImageScanDialog onClose={vi.fn()} />);
    await user.upload(choose(), file()); await user.upload(choose(), file()); await user.upload(choose(), file());
    await screen.findByRole('radio');
    expect(vi.mocked(decodeImageScan).mock.calls[0][1]?.aborted).toBe(true);
    expect(vi.mocked(decodeImageScan).mock.calls[1][1]?.aborted).toBe(true);
    expect(vi.mocked(decodeImageScan).mock.calls[2][1]?.aborted).toBe(false);
    await act(async () => { resolve([observation('OLD')]); reject(new ImageScanError('decode-failed')); });
    expect(screen.getByRole('radio')).toHaveAccessibleName(/NEW/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledOnce();
  });

  it('owns keyboard/focus while pending, cleans URLs/scroll/background and restores the opener', async () => {
    const user = userEvent.setup();
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const originalOverflow = document.body.style.overflow; document.body.style.overflow = 'scroll';
    vi.mocked(decodeImageScan).mockResolvedValueOnce([observation('A')]);
    const onClose = vi.fn(); const view = render(<ImageScanDialog onClose={onClose} />);
    try {
      expect(choose()).toHaveFocus(); expect(opener).toHaveAttribute('inert'); expect(document.body.style.overflow).toBe('hidden');
      await user.tab({ shift: true }); expect(screen.getByRole('button', { name: '關閉' })).toHaveFocus();
      await user.tab(); expect(choose()).toHaveFocus();
      opener.focus(); expect(choose()).toHaveFocus();
      await user.upload(choose(), file()); await screen.findByRole('radio');
      fireEvent.keyDown(document.body, { key: 'F5' }); expect(choose()).toHaveFocus();
      fireEvent.keyDown(document.body, { key: 'Escape' }); expect(onClose).toHaveBeenCalledOnce();
      view.unmount();
      expect(opener).toHaveFocus(); expect(opener).not.toHaveAttribute('inert');
      expect(document.body.style.overflow).toBe('scroll');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-local-image');
    } finally { opener.remove(); document.body.style.overflow = originalOverflow; }
  });

  it('unmount cancels the presentation of in-flight work and reopen starts empty', async () => {
    const user = userEvent.setup();
    let resolve!: (value: readonly ImageScanEvidence[]) => void;
    vi.mocked(decodeImageScan).mockImplementation(() => new Promise(yes => { resolve = yes; }));
    const view = render(<ImageScanDialog onClose={vi.fn()} />);
    await user.upload(choose(), file());
    expect(screen.getByRole('status')).toHaveTextContent('正在本機辨識');
    view.unmount();
    expect(vi.mocked(decodeImageScan).mock.calls[0][1]?.aborted).toBe(true);
    await act(async () => { resolve([observation('LATE')]); });
    expect(createObjectURL).not.toHaveBeenCalled();
    render(<ImageScanDialog onClose={vi.fn()} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument(); expect(confirm()).toBeDisabled();
  });
});

describe('camera acquisition reuses the same evidence and confirmation boundary', () => {
  it('retains exact decoder bytes, labels camera provenance, and hands off only after selection plus confirmation', async () => {
    const track = { stop: vi.fn(), onended: null };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    vi.stubGlobal('isSecureContext', true);
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['synthetic PNG'], { type: 'image/png' })));
    const literal = '  001aB\u001d\r\nhttps://example.invalid  ';
    const observed = observation(literal); vi.mocked(decodeImageScan).mockResolvedValue([observed]);
    const onLookup = vi.fn();
    const view = render(<ImageScanDialog source="camera" onClose={vi.fn()} onLookup={onLookup} />);
    try {
      const start = screen.getByRole('button', { name: '啟用相機／重新拍攝' });
      expect(start).toHaveFocus(); expect(getUserMedia).not.toHaveBeenCalled();
      await act(async () => { fireEvent.click(start); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '拍攝並在本機辨識' })); });
      expect(track.stop).toHaveBeenCalledOnce(); expect(onLookup).not.toHaveBeenCalled();
      const lookup = screen.getByRole('button', { name: '使用這段原碼查找商品／包裝' });
      expect(lookup).toBeDisabled();
      fireEvent.click(screen.getByRole('radio'));
      const evidence = JSON.parse(screen.getByLabelText('圖片掃描證據 JSON').textContent!);
      expect(evidence).toEqual({ ...observed, scan: { ...observed.scan, source: 'camera', evidence: { inputRoute: 'camera-frame', hardwareVerified: false } } });
      expect(lookup).toBeDisabled(); fireEvent.click(confirm()); expect(onLookup).not.toHaveBeenCalled();
      fireEvent.click(lookup); expect(onLookup).toHaveBeenCalledWith(evidence.scan);
      await act(async () => { fireEvent.click(start); });
      expect(screen.queryByRole('radio')).toBeNull(); expect(lookup).toBeDisabled();
      expect(revokeObjectURL).toHaveBeenCalled();
    } finally { view.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
  });
});
