"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

/** Code 128 barcode as SVG (readable by every USB scanner and phone camera). */
export function Barcode({
  value,
  height = 40,
  width = 1.6,
  fontSize = 12,
  showText = true,
  className = "",
}: {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  showText?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        width,
        fontSize,
        displayValue: showText,
        margin: 0,
        textMargin: 1,
        font: "monospace",
      });
    } catch {
      // invalid value — leave empty
    }
  }, [value, height, width, fontSize, showText]);
  return <svg ref={ref} className={className} />;
}

/** QR code (used for PromptPay). */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: "M" }).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} width={size} height={size} alt="QR code" /> : <div style={{ width: size, height: size }} />;
}
