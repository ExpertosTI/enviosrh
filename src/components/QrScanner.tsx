import { useEffect, useRef, useState } from 'react';

interface QrScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;

    async function start() {
      try {
        if ('BarcodeDetector' in window) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          const tick = async () => {
            if (!videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes[0]?.rawValue) {
                onScan(codes[0].rawValue);
                return;
              }
            } catch { /* continue */ }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        } else {
          setError('Usa el campo manual o un navegador compatible con BarcodeDetector');
        }
      } catch {
        setError('No se pudo acceder a la cámara');
      }
    }
    start();
    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[1200] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-4 w-full max-w-sm flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-[#e8e8f4]">Escanear código</span>
          <button onClick={onClose} className="text-[#6b6b8a] bg-transparent border-0 cursor-pointer text-xs font-bold">Cerrar</button>
        </div>
        {!error && (
          <video ref={videoRef} className="w-full rounded-xl bg-black aspect-square object-cover" playsInline muted />
        )}
        {error && <p className="text-xs text-[#f59e0b]">{error}</p>}
        <input
          className="chat-input border rounded-xl px-3 py-2 text-xs"
          placeholder="O ingresa el código manualmente"
          value={manual}
          onChange={e => setManual(e.target.value)}
        />
        <button
          onClick={() => manual.trim() && onScan(manual.trim())}
          className="py-2.5 rounded-xl bg-[#5b8af9] text-white font-bold text-xs border-0 cursor-pointer"
        >
          Confirmar código
        </button>
      </div>
    </div>
  );
}
