// Copies the ZXing WebAssembly barcode reader (used for camera scanning on
// iPhone/iPad and other browsers without a built-in barcode reader) into
// public/ so the app serves it itself instead of downloading it from a CDN.
// Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// zxing-wasm is a dependency of barcode-detector, so resolve it from there.
const require = createRequire(import.meta.url);
const fromBarcodeDetector = createRequire(require.resolve("barcode-detector"));
const src = fromBarcodeDetector.resolve("zxing-wasm/reader/zxing_reader.wasm");
const destDir = path.join(process.cwd(), "public", "zxing");
mkdirSync(destDir, { recursive: true });
copyFileSync(src, path.join(destDir, "zxing_reader.wasm"));
console.log("copied zxing_reader.wasm → public/zxing/");
