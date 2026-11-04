"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { Camera, CircleStop } from "lucide-react";

type TicketQrScannerProps = {
  onDetected: (code: string) => void;
};

export default function TicketQrScanner({ onDetected }: TicketQrScannerProps) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const reader = new BrowserQRCodeReader();

    void reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _error, controls) => {
        if (cancelled || !result) return;
        const code = result.getText().trim();
        if (!code) return;
        controls.stop();
        setActive(false);
        onDetected(code);
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch((scanError: unknown) => {
        if (cancelled) return;
        console.error("Could not start ticket QR scanner", scanError);
        setError(
          scanError instanceof Error
            ? scanError.message
            : "Impossible d’accéder à la caméra. Vérifiez son autorisation.",
        );
        setActive(false);
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [active, onDetected]);

  return (
    <div className="agent-camera-scanner">
      {active ? (
        <>
          <div className="agent-camera-scanner__preview">
            <video ref={videoRef} muted playsInline aria-label="Aperçu de la caméra pour scanner le QR code" />
            <span className="agent-camera-scanner__guide" aria-hidden="true" />
          </div>
          <button
            type="button"
            className="agent-camera-scanner__toggle"
            onClick={() => setActive(false)}
          >
            <CircleStop aria-hidden="true" />
            Arrêter le scanner
          </button>
        </>
      ) : (
        <button
          type="button"
          className="agent-camera-scanner__toggle"
          onClick={() => {
            setError(null);
            setActive(true);
          }}
        >
          <Camera aria-hidden="true" />
          Scanner avec la caméra
        </button>
      )}
      {error ? (
        <p className="agent-camera-scanner__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
