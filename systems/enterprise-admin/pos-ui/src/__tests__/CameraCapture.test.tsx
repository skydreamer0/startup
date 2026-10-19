import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CameraCapture from '../components/CameraCapture';

const start = () => screen.getByRole('button', { name: '啟用相機／重新拍攝' });
const capture = () => screen.getByRole('button', { name: '拍攝並在本機辨識' });
const cancel = () => screen.getByRole('button', { name: '停止相機／取消擷取' });
const getUserMedia = vi.fn();
const play = vi.fn();
const drawImage = vi.fn();
const toBlob = vi.fn();
function media() {
  const track = { stop: vi.fn(), onended: null as (() => void) | null };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { track, stream };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlob);
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 3840 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 2160 });
  play.mockResolvedValue(undefined);
  toBlob.mockImplementation((callback: BlobCallback) => callback(new Blob(['synthetic PNG'], { type: 'image/png' })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('user-owned single-frame camera lifecycle (synthetic media)', () => {
  it('requests no permission on mount; explicit start requests video only, capture bounds canvas and releases all tracks', async () => {
    const { stream, track } = media(); getUserMedia.mockResolvedValue(stream);
    const onCapture = vi.fn(); const onReset = vi.fn();
    render(<CameraCapture onCapture={onCapture} onReset={onReset} />);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(capture()).toBeDisabled();
    await act(async () => { fireEvent.click(start()); });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    expect(onReset).toHaveBeenCalledOnce();
    expect(onCapture).not.toHaveBeenCalled();
    fireEvent.click(capture());
    expect(drawImage).toHaveBeenCalledWith(screen.getByLabelText('相機即時預覽'), 0, 0, 1600, 900);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture.mock.calls[0][0]).toMatchObject({ name: 'camera-frame.png', type: 'image/png' });
    expect(screen.getByLabelText('相機即時預覽')).toHaveProperty('srcObject', null);
  });

  it.each(['NotAllowedError', 'NotFoundError', 'NotReadableError'])('shows recoverable %s without capture; retry can start', async name => {
    const { stream, track } = media();
    getUserMedia.mockRejectedValueOnce(new DOMException('synthetic', name)).mockResolvedValueOnce(stream);
    const onCapture = vi.fn(); const view = render(<CameraCapture onCapture={onCapture} onReset={vi.fn()} />);
    await act(async () => { fireEvent.click(start()); });
    expect(screen.getByRole('alert')).toBeVisible(); expect(onCapture).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(start()); });
    expect(screen.queryByRole('alert')).toBeNull(); expect(capture()).toBeEnabled();
    view.unmount(); expect(track.stop).toHaveBeenCalledOnce();
  });

  it('does not call getUserMedia in an insecure context', () => {
    vi.stubGlobal('isSecureContext', false);
    render(<CameraCapture onCapture={vi.fn()} onReset={vi.fn()} />);
    fireEvent.click(start());
    expect(screen.getByRole('alert')).toHaveTextContent('HTTPS');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'unmount', 'pagehide'])('stops a late permission result after %s, never attaching it', async action => {
    const { stream, track } = media();
    let resolve!: (value: MediaStream) => void;
    getUserMedia.mockImplementation(() => new Promise<MediaStream>(yes => { resolve = yes; }));
    const onCapture = vi.fn(); const view = render(<CameraCapture onCapture={onCapture} onReset={vi.fn()} />);
    fireEvent.click(start());
    if (action === 'cancel') fireEvent.click(cancel());
    else if (action === 'unmount') view.unmount();
    else fireEvent(window, new Event('pagehide'));
    await act(async () => { resolve(stream); });
    expect(track.stop).toHaveBeenCalledOnce(); expect(play).not.toHaveBeenCalled(); expect(onCapture).not.toHaveBeenCalled();
  });

  it('releases live tracks on page hiding and on track interruption', async () => {
    const a = media(); const b = media(); getUserMedia.mockResolvedValueOnce(a.stream).mockResolvedValueOnce(b.stream);
    render(<CameraCapture onCapture={vi.fn()} onReset={vi.fn()} />);
    await act(async () => { fireEvent.click(start()); });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    fireEvent(document, new Event('visibilitychange'));
    expect(a.track.stop).toHaveBeenCalledOnce();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => { fireEvent.click(start()); });
    act(() => { b.track.onended?.(); });
    expect(b.track.stop).toHaveBeenCalledOnce(); expect(screen.getByRole('alert')).toHaveTextContent('中斷');
  });

  it('releases the acquired stream if video playback fails', async () => {
    const { stream, track } = media(); getUserMedia.mockResolvedValue(stream); play.mockRejectedValue(new Error('play failure'));
    render(<CameraCapture onCapture={vi.fn()} onReset={vi.fn()} />);
    await act(async () => { fireEvent.click(start()); });
    expect(track.stop).toHaveBeenCalledOnce(); expect(screen.getByRole('alert')).toBeVisible();
  });

  it('discards late encoded frames after cancel and after a retake, without leaking the new stream', async () => {
    const a = media(); const b = media(); getUserMedia.mockResolvedValueOnce(a.stream).mockResolvedValueOnce(b.stream);
    let encode!: BlobCallback; toBlob.mockImplementation((callback: BlobCallback) => { encode = callback; });
    const onCapture = vi.fn(); const view = render(<CameraCapture onCapture={onCapture} onReset={vi.fn()} />);
    await act(async () => { fireEvent.click(start()); }); fireEvent.click(capture()); fireEvent.click(cancel());
    await act(async () => { fireEvent.click(start()); });
    act(() => { encode(new Blob(['late'], { type: 'image/png' })); });
    expect(onCapture).not.toHaveBeenCalled(); expect(capture()).toBeEnabled();
    expect(a.track.stop).toHaveBeenCalledOnce(); expect(b.track.stop).not.toHaveBeenCalled();
    view.unmount(); expect(b.track.stop).toHaveBeenCalledOnce();
  });

  it.each(['not-ready', 'empty-blob', 'canvas-error'])('stops media and recovers from %s', async failure => {
    const { stream, track } = media(); getUserMedia.mockResolvedValue(stream);
    if (failure === 'not-ready') Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 0 });
    if (failure === 'empty-blob') toBlob.mockImplementation((callback: BlobCallback) => callback(null));
    if (failure === 'canvas-error') drawImage.mockImplementation(() => { throw new Error('synthetic'); });
    const onCapture = vi.fn(); render(<CameraCapture onCapture={onCapture} onReset={vi.fn()} />);
    await act(async () => { fireEvent.click(start()); }); fireEvent.click(capture());
    expect(track.stop).toHaveBeenCalledOnce(); expect(onCapture).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeVisible(); expect(start()).toBeEnabled();
  });
});
