import { useEffect, useRef, useState } from 'react';

/** A single user-requested frame, never a background scanner or audio recorder. */
export default function CameraCapture({ onCapture, onReset }: {
  onCapture: (file: File) => void;
  onReset: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [state, setState] = useState<'idle' | 'requesting' | 'live' | 'encoding'>('idle');
  const [error, setError] = useState<string | null>(null);

  function release() {
    const current = stream.current;
    stream.current = null;
    current?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    if (video.current) video.current.srcObject = null;
  }
  function stop() {
    ++generation.current;
    release(); onReset();
    setState('idle');
  }
  useEffect(() => {
    function suspend() { stop(); }
    function hide() { if (document.visibilityState === 'hidden') suspend(); }
    window.addEventListener('pagehide', suspend);
    document.addEventListener('visibilitychange', hide);
    return () => {
      ++generation.current;
      release();
      window.removeEventListener('pagehide', suspend);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  async function start() {
    const request = ++generation.current;
    release(); onReset(); setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState('idle');
      setError('此環境無法啟用相機。請使用支援相機的 HTTPS 網站；也可關閉後改用圖片掃碼或手動貼碼。');
      return;
    }
    setState('requesting');
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (request !== generation.current) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream.current = acquired;
      acquired.getVideoTracks().forEach(track => {
        track.onended = () => {
          if (request !== generation.current) return;
          stop(); setError('相機連線已中斷，請重新啟用或改用圖片掃碼。');
        };
      });
      if (!video.current || acquired.getVideoTracks().length === 0) throw new Error('No video');
      video.current.srcObject = acquired;
      await video.current.play();
      if (request !== generation.current) return;
      setState('live');
    } catch (failure: unknown) {
      if (request !== generation.current) return;
      release(); setState('idle');
      const name = failure instanceof Error ? failure.name : '';
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? '尚未允許使用相機。可在瀏覽器設定確認權限後重試，或改用圖片掃碼／手動貼碼。'
        : '無法開啟相機，可能未連接或正由其他程式使用。請確認後重試，或改用圖片掃碼。');
    }
  }

  function capture() {
    const current = video.current;
    if (state !== 'live' || !current || !stream.current) return;
    const request = generation.current;
    try {
      const { videoWidth: width, videoHeight: height } = current;
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw new Error('Frame not ready');
      // Bound canvas memory before allocation, retaining aspect ratio. No full-resolution buffer.
      const scale = Math.min(1, 1600 / width, 1600 / height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(width * scale));
      canvas.height = Math.max(1, Math.floor(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(current, 0, 0, canvas.width, canvas.height);
      release(); setState('encoding');
      canvas.toBlob(blob => {
        canvas.width = 0; canvas.height = 0;
        if (request !== generation.current) return;
        setState('idle');
        if (!blob || blob.type !== 'image/png' || blob.size === 0 || blob.size > 10 * 1024 * 1024) {
          setError('無法擷取這張影像，請重新啟用相機再拍攝。'); return;
        }
        onCapture(new File([blob], 'camera-frame.png', { type: 'image/png' }));
      }, 'image/png');
    } catch {
      release(); setState('idle');
      setError('影像尚未就緒或無法擷取，請重新啟用相機再拍攝。');
    }
  }

  return <section aria-label="相機擷取">
    <p>只有按下「啟用相機」才會要求權限；不錄音、不自動拍攝。拍攝後立即停止相機，影像僅在本機辨識。</p>
    <video ref={video} className="image-scan-preview" muted playsInline aria-label="相機即時預覽" />
    <div className="image-scan-actions">
      <button type="button" data-scan-entry disabled={state !== 'idle'} onClick={() => void start()}>啟用相機／重新拍攝</button>
      <button type="button" disabled={state !== 'live'} onClick={capture}>拍攝並在本機辨識</button>
      <button type="button" disabled={state === 'idle'} onClick={stop}>停止相機／取消擷取</button>
    </div>
    <p role="status">{state === 'requesting' ? '等待相機權限或啟動；可取消或關閉。' : state === 'live' ? '相機已啟用，請將條碼放入畫面後拍攝。' : state === 'encoding' ? '正在擷取影像；相機已停止。' : '相機未啟用。'}</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
