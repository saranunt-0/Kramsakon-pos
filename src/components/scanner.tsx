"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ScanBarcode } from "lucide-react";
import { normalizeScan } from "@/lib/scan";
import { Modal } from "./ui";

// ---------------------------------------------------------------------------
// Beeps so the cashier hears whether a scan worked.
// ---------------------------------------------------------------------------

let audio: AudioContext | null = null;

export function beep(ok = true) {
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = ok ? 1400 : 300;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + (ok ? 0.08 : 0.3));
  } catch {
    // sound is optional
  }
}

// ---------------------------------------------------------------------------
// USB / Bluetooth scanner: types the code very fast and presses Enter.
// ---------------------------------------------------------------------------

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * Listens for a barcode scanner anywhere on the page (when the cursor is not
 * in a text box). Keys arriving less than ~60 ms apart and ending with Enter
 * are treated as one scan.
 */
export function useScanner(onScan: (code: string) => void, enabled = true) {
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
      const now = performance.now();
      if (now - last > 60) buffer = "";
      last = now;
      if (e.key === "Enter") {
        if (buffer.length >= 3) {
          e.preventDefault();
          handler.current(normalizeScan(buffer));
        }
        buffer = "";
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** A text box for scanning or typing a barcode, with a camera button for phones. */
export function ScanBox({
  onScan,
  placeholder = "สแกนบาร์โค้ด หรือพิมพ์รหัสแล้วกด Enter",
  autoFocus = false,
  continuousCamera = false,
}: {
  onScan: (code: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  continuousCamera?: boolean;
}) {
  const [value, setValue] = useState("");
  const [camera, setCamera] = useState(false);

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={20} />
        <input
          className="input pl-10 text-base"
          value={value}
          autoFocus={autoFocus}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="characters"
          enterKeyHint="search"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const code = normalizeScan(value);
              setValue("");
              if (code) onScan(code);
            }
          }}
        />
      </div>
      <button type="button" className="btn btn-secondary" onClick={() => setCamera(true)} title="สแกนด้วยกล้อง">
        <Camera size={20} />
        <span className="hidden sm:inline">กล้อง</span>
      </button>
      {camera && (
        <CameraScanner
          continuous={continuousCamera}
          onScan={(code) => {
            onScan(code);
            if (!continuousCamera) setCamera(false);
          }}
          onClose={() => setCamera(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phone / tablet camera scanner.
// ---------------------------------------------------------------------------

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

const FORMATS = ["code_128", "qr_code", "ean_13", "ean_8", "upc_a", "upc_e", "code_39"];

async function createDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } })
    .BarcodeDetector;
  if (native) {
    try {
      const supported = await native.getSupportedFormats();
      if (supported.includes("code_128")) return new native({ formats: FORMATS.filter((f) => supported.includes(f)) });
    } catch {
      // fall back to the WebAssembly version
    }
  }
  // iPhone/iPad Safari has no built-in barcode reader; use ZXing (WebAssembly),
  // served from our own /zxing folder (see scripts/copy-zxing-wasm.mjs).
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: {
      locateFile: (file: string, prefix: string) => (file.endsWith(".wasm") ? `/zxing/${file}` : prefix + file),
    },
  });
  return new BarcodeDetector({ formats: FORMATS as never[] }) as unknown as Detector;
}

export function CameraScanner({
  onScan,
  onClose,
  continuous = false,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
  continuous?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let recent = { code: "", at: 0 };

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("เบราว์เซอร์นี้ใช้กล้องไม่ได้ (ต้องเปิดผ่าน https)");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        const video = videoRef.current;
        if (!video || stopped) return;
        video.srcObject = stream;
        await video.play();
        const detector = await createDetector();

        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const found = await detector.detect(video);
              const raw = found[0]?.rawValue;
              if (raw) {
                const code = normalizeScan(raw);
                const now = Date.now();
                // Ignore the same code seen again within 2 seconds.
                if (code !== recent.code || now - recent.at > 2000) {
                  recent = { code, at: now };
                  setLastCode(code);
                  onScanRef.current(code);
                  if (!continuous) return;
                }
              }
            }
          } catch {
            // a frame that fails to decode is normal; keep going
          }
          timer = setTimeout(tick, 150);
        };
        tick();
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์"
            : e instanceof Error
              ? e.message
              : "เปิดกล้องไม่ได้",
        );
      }
    }
    start();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [continuous]);

  return (
    <Modal title="สแกนด้วยกล้อง" onClose={onClose}>
      {error ? (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} className="aspect-[4/3] w-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
          </div>
          <p className="text-center text-sm text-slate-500">
            เล็งบาร์โค้ดให้อยู่กลางกรอบ{continuous && " — สแกนได้ต่อเนื่อง กด ปิด เมื่อเสร็จ"}
          </p>
          {lastCode && <p className="text-center font-mono text-sm text-emerald-700">อ่านได้: {lastCode}</p>}
        </div>
      )}
      <button className="btn btn-secondary mt-4 w-full" onClick={onClose}>
        ปิด
      </button>
    </Modal>
  );
}
