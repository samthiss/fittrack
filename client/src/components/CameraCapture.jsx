import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

// Full-screen live camera view for "Ajouter un aliment > Photo", styled after a reference
// screenshot (Yazio's meal-photo capture screen): framing square + hint text, and a bottom row
// with a library-picker button, a shutter, and a flash toggle. Falls back to the plain
// <input type="file" capture> flow (onFallback) if getUserMedia isn't available/denied — e.g.
// desktop browsers without a camera, or a user who declines the permission prompt.
export default function CameraCapture({ onCapture, onClose, onPickLibrary, onFallback }) {
  const { t } = useLanguage();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [error, setError] = useState(null);

  // onFallback is a fresh closure every parent render — a plain dependency would tear the camera
  // stream down and restart it on every unrelated re-render while this screen is open. A ref
  // always has the latest version without making the mount effect below re-run.
  const onFallbackRef = useRef(onFallback);
  onFallbackRef.current = onFallback;

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        onFallbackRef.current();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.();
        setTorchSupported(!!caps?.torch);
      } catch (err) {
        if (!cancelled) setError(err.message || 'camera unavailable');
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handing off to the fallback flow is a side effect (it triggers a native file-picker click in
  // the parent) — it belongs in an effect keyed on `error`, not fired directly during render.
  useEffect(() => {
    if (error) onFallbackRef.current();
  }, [error]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch {
      // Some browsers report torch as a capability but reject the constraint anyway.
    }
  }

  function handleShutter() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], 'meal.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9
    );
  }

  if (error) return null;

  return (
    <div className="camera-capture">
      <video ref={videoRef} autoPlay playsInline muted className="camera-capture-video" />
      <div className="camera-capture-header">
        <button type="button" className="camera-capture-icon-btn" onClick={onClose} aria-label={t('meal.close')}>
          <Icon name="chevron-left" size={22} color="#fff" />
        </button>
      </div>
      <div className="camera-capture-frame-wrap">
        <div className="camera-capture-frame" />
        <p className="camera-capture-hint">{t('addFood.cameraHint')}</p>
      </div>
      <div className="camera-capture-controls">
        <button type="button" className="camera-capture-side-btn" onClick={onPickLibrary} aria-label={t('addFood.cameraLibrary')}>
          <Icon name="images" size={24} color="#fff" />
          <span>{t('addFood.cameraLibrary')}</span>
        </button>
        <button type="button" className="camera-capture-shutter" onClick={handleShutter} aria-label={t('addFood.cameraShutter')} />
        {torchSupported ? (
          <button type="button" className="camera-capture-side-btn" onClick={toggleTorch} aria-label="flash">
            <Icon name={torchOn ? 'zap' : 'zap-off'} size={24} color="#fff" />
            <span>Flash</span>
          </button>
        ) : (
          <span className="camera-capture-side-btn" style={{ visibility: 'hidden' }} />
        )}
      </div>
    </div>
  );
}
