import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';

// Retail products use these 1D formats — narrowing to them (vs. the full QR/PDF417/DataMatrix/
// Aztec/MaxiCode set the reader tries by default) skips wasted decode attempts on every frame.
// TRY_HARDER deliberately left off: it makes the decoder run multiple extra passes per frame
// (rotations, extra thresholding) to squeeze out reads on damaged/blurry barcodes, but on a
// normal retail barcode in reasonable light it mostly just slows down how fast a good frame gets
// recognized — narrowing the format list above already does most of the real speedup.
const HINTS = new Map([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128],
  ],
]);

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader(HINTS);
    let active = true;
    let controls;

    reader
      .decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (result) => {
          if (result && active) {
            active = false;
            controls?.stop();
            onDetected(result.getText());
          }
        }
      )
      .then((c) => {
        controls = c;
      })
      .catch((e) => setError("Impossible d'accéder à la caméra : " + e.message));

    return () => {
      active = false;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scanner">
      <div className="scanner-video-wrap">
        <video ref={videoRef} className="scanner-video" muted playsInline />
        {/* Scanning stays fast (see HINTS above) by only reading horizontal barcodes — this
            guide is the trade-off's other half: instead of the decoder trying every angle,
            it asks the user to align the barcode instead. */}
        <div className="scanner-guide">
          <div className="scanner-guide-line" />
        </div>
      </div>
      <p className="hint" style={{ textAlign: 'center', marginTop: -4 }}>
        Aligne le code-barre à l'horizontale dans le cadre
      </p>
      {error && <p className="hint error">{error}</p>}
      <button type="button" className="btn-ghost" onClick={onClose}>
        Fermer la caméra
      </button>
    </div>
  );
}
