"use client";

import * as React from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import {
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";
import {
  CameraOff,
  Keyboard,
  Loader2,
  RefreshCw,
  Zap,
  ZapOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Camera barcode / QR scanner built on ZXing.
 *
 * Handles the real-world failure modes deliberately: permission denied, no
 * camera, torch unsupported, front/rear switching — and always offers manual
 * entry so the till never gets stuck behind a dead camera. The rear camera is
 * preferred (`facingMode: environment`).
 */
const HINTS = new Map();
HINTS.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
]);

type Status = "starting" | "scanning" | "denied" | "no-camera" | "error";

export function BarcodeScanner({
  onDetected,
  onManualEntry,
}: {
  onDetected: (code: string) => void;
  onManualEntry?: (code: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const controlsRef = React.useRef<IScannerControls | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const lastCodeRef = React.useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const [status, setStatus] = React.useState<Status>("starting");
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = React.useState(0);
  const [torchOn, setTorchOn] = React.useState(false);
  const [torchSupported, setTorchSupported] = React.useState(false);
  const [manual, setManual] = React.useState("");
  const [showManual, setShowManual] = React.useState(false);

  const stop = React.useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = React.useCallback(
    async (index: number) => {
      stop();
      setStatus("starting");
      try {
        const reader = new BrowserMultiFormatReader(HINTS, {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 400,
        });

        const videoDevices = await BrowserMultiFormatReader.listVideoInputDevices();
        setDevices(videoDevices);

        if (videoDevices.length === 0) {
          setStatus("no-camera");
          return;
        }

        // Prefer a rear-facing camera on first start.
        let chosen = videoDevices[index]?.deviceId;
        if (index === 0) {
          const rear = videoDevices.find((d) => /back|rear|environment/i.test(d.label));
          if (rear) {
            chosen = rear.deviceId;
            setDeviceIndex(videoDevices.indexOf(rear));
          }
        }

        const controls = await reader.decodeFromVideoDevice(
          chosen,
          videoRef.current!,
          (result) => {
            if (!result) return;
            const text = result.getText().trim();
            const now = Date.now();
            // Debounce repeats of the same code within 1.2s.
            if (text === lastCodeRef.current.code && now - lastCodeRef.current.at < 1200) {
              return;
            }
            lastCodeRef.current = { code: text, at: now };
            if (navigator.vibrate) navigator.vibrate(40);
            onDetected(text);
          },
        );

        controlsRef.current = controls;
        const stream = videoRef.current?.srcObject as MediaStream | null;
        streamRef.current = stream;

        // Detect torch capability on the active track.
        const track = stream?.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as
          | (MediaTrackCapabilities & { torch?: boolean })
          | undefined;
        setTorchSupported(Boolean(capabilities?.torch));

        setStatus("scanning");
      } catch (error) {
        const err = error as { name?: string };
        if (err.name === "NotAllowedError" || err.name === "SecurityError") {
          setStatus("denied");
        } else if (err.name === "NotFoundError") {
          setStatus("no-camera");
        } else {
          setStatus("error");
        }
      }
    },
    [onDetected, stop],
  );

  React.useEffect(() => {
    // Deferred a tick so the camera handshake (and its status updates) happens
    // after the first paint — the reticle renders immediately instead of
    // waiting on getUserMedia.
    const t = window.setTimeout(() => void start(0), 0);
    return () => {
      window.clearTimeout(t);
      stop();
    };
    // Mount only; device switches call start(index) directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet & { torch: boolean }],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  function switchCamera() {
    if (devices.length < 2) return;
    const next = (deviceIndex + 1) % devices.length;
    setDeviceIndex(next);
    setTorchOn(false);
    void start(next);
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    (onManualEntry ?? onDetected)(code);
    setManual("");
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[--radius-lg] border border-line bg-ink-strong">
        {/* Video */}
        <video
          ref={videoRef}
          className={cn(
            "size-full object-cover",
            status !== "scanning" && "opacity-0",
          )}
          playsInline
          muted
        />

        {/* Reticle */}
        {status === "scanning" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[55%] w-[78%]">
              <span className="absolute top-0 left-0 size-7 rounded-tl-lg border-t-2 border-l-2 border-white/90" />
              <span className="absolute top-0 right-0 size-7 rounded-tr-lg border-t-2 border-r-2 border-white/90" />
              <span className="absolute bottom-0 left-0 size-7 rounded-bl-lg border-b-2 border-l-2 border-white/90" />
              <span className="absolute right-0 bottom-0 size-7 rounded-br-lg border-r-2 border-b-2 border-white/90" />
              <span className="scanline absolute inset-x-3 h-0.5 rounded-full bg-primary shadow-[0_0_12px_2px_var(--primary)]" />
            </div>
          </div>
        ) : null}

        {/* Non-scanning states */}
        {status !== "scanning" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/90">
            {status === "starting" ? (
              <>
                <Loader2 className="size-8 animate-spin" aria-hidden />
                <p className="text-sm">Starting camera…</p>
              </>
            ) : status === "denied" ? (
              <>
                <CameraOff className="size-8" aria-hidden />
                <div>
                  <p className="text-sm font-medium">Camera access is blocked</p>
                  <p className="mt-1 text-xs text-white/70">
                    Allow camera access in your browser settings, or enter the code by hand below.
                  </p>
                </div>
              </>
            ) : status === "no-camera" ? (
              <>
                <CameraOff className="size-8" aria-hidden />
                <p className="text-sm">No camera found. Enter the code by hand below.</p>
              </>
            ) : (
              <>
                <CameraOff className="size-8" aria-hidden />
                <p className="text-sm">The camera could not start. Enter the code by hand below.</p>
              </>
            )}
          </div>
        ) : null}

        {/* Camera controls */}
        {status === "scanning" ? (
          <div className="absolute top-3 right-3 flex gap-2">
            {torchSupported ? (
              <button
                type="button"
                onClick={toggleTorch}
                aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
                className="flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
              >
                {torchOn ? <Zap className="size-5" aria-hidden /> : <ZapOff className="size-5" aria-hidden />}
              </button>
            ) : null}
            {devices.length > 1 ? (
              <button
                type="button"
                onClick={switchCamera}
                aria-label="Switch camera"
                className="flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
              >
                <RefreshCw className="size-5" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Manual entry */}
      {showManual || status !== "scanning" ? (
        <form onSubmit={submitManual} className="flex gap-2">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Enter barcode or product code"
            inputMode="text"
            autoComplete="off"
            aria-label="Enter code manually"
          />
          <Button type="submit" disabled={!manual.trim()}>
            Find
          </Button>
        </form>
      ) : (
        <Button variant="outline" block onClick={() => setShowManual(true)}>
          <Keyboard aria-hidden />
          Enter code manually
        </Button>
      )}
    </div>
  );
}
