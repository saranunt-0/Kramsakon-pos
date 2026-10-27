"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSettings } from "@/components/auth";
import { Barcode } from "@/components/barcode";
import { ErrorBox, PageLoading, errorText } from "@/components/ui";
import { money } from "@/lib/format";
import { parseLabelJob } from "@/lib/label-job";
import { variantLabel } from "@/lib/labels";
import { supabase } from "@/lib/supabase";
import type { Item } from "@/lib/types";

function LabelSheet() {
  const params = useSearchParams();
  const s = useSettings();
  const [labels, setLabels] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const job = useMemo(() => parseLabelJob(params.get("items")), [params]);

  useEffect(() => {
    if (!job.length) return;
    supabase()
      .from("variants")
      .select("*, products(id, name, category_id, is_unique, active)")
      .in("id", job.map((j) => j.id))
      .then(({ data, error }) => {
        if (error) return setError(errorText(error));
        const byId = new Map((data as Item[]).map((v) => [v.id, v]));
        setLabels(job.flatMap((j) => (byId.has(j.id) ? Array(j.copies).fill(byId.get(j.id)) : [])));
      });
  }, [job]);

  useEffect(() => {
    if (!labels?.length) return;
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, [labels]);

  if (!job.length) return <div className="p-4"><ErrorBox error="ไม่มีรายการที่จะพิมพ์" /></div>;
  if (error) return <div className="p-4"><ErrorBox error={error} /></div>;
  if (!labels) return <PageLoading />;

  const w = Number(s.label_width_mm);
  const h = Number(s.label_height_mm);
  const cols = s.label_columns;
  const gap = Number(s.label_gap_mm);
  const pageWidth = cols * w + (cols - 1) * gap;
  const rows: Item[][] = [];
  for (let i = 0; i < labels.length; i += cols) rows.push(labels.slice(i, i + cols));

  return (
    <>
      {/* One printed "page" = one row of labels on the roll. */}
      <style>{`
        @page { size: ${pageWidth}mm ${h}mm; margin: 0; }
        @media print { .label-row { break-after: page; } }
      `}</style>
      <div className="no-print space-y-1 border-b border-slate-200 bg-slate-50 p-3 text-center text-sm">
        <div>
          {labels.length} ดวง · ขนาด {w}×{h} มม. · {cols} ดวงต่อแถว
        </div>
        <div className="text-slate-500">ในหน้าต่างพิมพ์: เลือกเครื่องพิมพ์บาร์โค้ด, ระยะขอบ = ไม่มี, สเกล = 100%</div>
        <div className="flex justify-center gap-2">
          <button className="btn btn-primary" onClick={() => window.print()}>พิมพ์</button>
          <button className="btn btn-secondary" onClick={() => window.close()}>ปิด</button>
        </div>
      </div>
      <div className="flex flex-col items-center gap-4 py-4 print:block print:gap-0 print:py-0">
        {rows.map((row, r) => (
          <div key={r} className="label-row flex bg-white outline outline-1 outline-slate-200 print:outline-none" style={{ width: `${pageWidth}mm`, height: `${h}mm`, gap: `${gap}mm` }}>
            {row.map((item, i) => (
              <div
                key={i}
                className="flex flex-col items-center justify-center overflow-hidden px-[1.5mm] text-center text-black"
                style={{ width: `${w}mm`, height: `${h}mm` }}
              >
                <div className="w-full truncate text-[9pt] leading-tight font-semibold">{item.products.name}</div>
                <div className="flex w-full justify-between text-[8pt] leading-tight">
                  <span className="truncate">{variantLabel(item)}</span>
                  {s.label_show_price && <span className="font-bold">฿{money(item.price)}</span>}
                </div>
                <Barcode value={item.sku} height={Math.max(20, h * 2.2)} width={1.4} fontSize={11} className="mt-[0.5mm] max-h-[60%] w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

export default function PrintLabelsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <LabelSheet />
    </Suspense>
  );
}
