"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSettings } from "@/components/auth";
import { ReceiptView } from "@/components/receipt";
import { ErrorBox, PageLoading, errorText } from "@/components/ui";
import { rpc } from "@/lib/supabase";
import type { Receipt } from "@/lib/types";

export default function PrintReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const settings = useSettings();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rpc<Receipt | null>("get_receipt", { p_sale_id: id })
      .then((r) => (r ? setReceipt(r) : setError("ไม่พบใบเสร็จ")))
      .catch((e) => setError(errorText(e)));
  }, [id]);

  useEffect(() => {
    if (!receipt) return;
    // Give the barcode a moment to render, then open the print dialog.
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [receipt]);

  if (error) return <div className="p-4"><ErrorBox error={error} /></div>;
  if (!receipt) return <PageLoading />;

  const width = settings.receipt_width_mm;
  return (
    <>
      <style>{`@page { margin: 0; } @media print { body { width: ${width}mm; } }`}</style>
      <div className="no-print flex justify-center gap-2 border-b border-slate-200 bg-slate-50 p-3">
        <button className="btn btn-primary" onClick={() => window.print()}>พิมพ์</button>
        <button className="btn btn-secondary" onClick={() => window.close()}>ปิด</button>
      </div>
      <div className="mx-auto p-[3mm]" style={{ width: `${width}mm` }}>
        <ReceiptView receipt={receipt} settings={settings} />
      </div>
    </>
  );
}
