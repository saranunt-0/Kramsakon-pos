"use client";

import { useCallback, useState } from "react";
import { Printer, Trash2 } from "lucide-react";
import { useSettings } from "@/components/auth";
import { useCatalog } from "@/components/catalog";
import { Barcode } from "@/components/barcode";
import { ItemPicker } from "@/components/item-picker";
import { ScanBox, beep, useScanner } from "@/components/scanner";
import { EmptyState, PageHeader, toast } from "@/components/ui";
import { money } from "@/lib/format";
import { openLabelPrint } from "@/lib/label-job";
import { variantLabel } from "@/lib/labels";
import type { Item } from "@/lib/types";

export default function LabelsPage() {
  const s = useSettings();
  const { findBySku } = useCatalog();
  const [lines, setLines] = useState<{ item: Item; copies: number }[]>([]);

  const add = useCallback((item: Item, copies = 1) => {
    setLines((prev) => {
      const found = prev.find((l) => l.item.id === item.id);
      if (found) return prev.map((l) => (l.item.id === item.id ? { ...l, copies: l.copies + copies } : l));
      return [...prev, { item, copies }];
    });
  }, []);

  const onScan = useCallback(
    async (code: string) => {
      const item = await findBySku(code);
      if (item) {
        add(item);
        beep(true);
      } else {
        beep(false);
        toast(`ไม่พบสินค้ารหัส ${code}`, "error");
      }
    },
    [findBySku, add],
  );
  useScanner(onScan);

  const total = lines.reduce((sum, l) => sum + l.copies, 0);

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="พิมพ์บาร์โค้ด">
        <button
          className="btn btn-primary"
          disabled={!total}
          onClick={() => openLabelPrint(lines.map((l) => ({ id: l.item.id, copies: l.copies })))}
        >
          <Printer size={18} /> พิมพ์ {total} ดวง
        </button>
      </PageHeader>

      <div className="card space-y-3 p-4">
        <ItemPicker onPick={(item) => add(item, Math.max(1, item.stock_qty))} placeholder="ค้นหาสินค้า (จะใส่จำนวนดวงเท่ากับสต็อก)" />
        <ScanBox onScan={onScan} placeholder="หรือสแกนบาร์โค้ดเดิมเพื่อพิมพ์ซ้ำ" />
        <p className="text-xs text-slate-500">
          ขนาดสติกเกอร์ปัจจุบัน {s.label_width_mm}×{s.label_height_mm} มม., {s.label_columns} ดวงต่อแถว — เปลี่ยนได้ที่ “ตั้งค่าร้าน”
        </p>
      </div>

      {lines.length === 0 ? (
        <EmptyState>เลือกสินค้าที่ต้องการพิมพ์บาร์โค้ด</EmptyState>
      ) : (
        <div className="card divide-y divide-slate-100">
          {lines.map((l) => (
            <div key={l.item.id} className="flex flex-wrap items-center gap-4 p-3">
              <div
                className="flex shrink-0 flex-col items-center justify-center rounded border border-slate-300 bg-white px-1 text-center"
                style={{ width: `${s.label_width_mm * 2.2}px`, height: `${s.label_height_mm * 2.2}px` }}
              >
                <div className="w-full truncate text-[8px] font-semibold">{l.item.products.name}</div>
                <Barcode value={l.item.sku} height={22} width={1} fontSize={8} className="max-w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{l.item.products.name}</div>
                <div className="text-xs text-slate-500">
                  {[variantLabel(l.item), l.item.sku, `฿${money(l.item.price)}`, `คงเหลือ ${l.item.stock_qty}`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                จำนวนดวง
                <input
                  className="input w-20"
                  inputMode="numeric"
                  value={l.copies}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x) => (x.item.id === l.item.id ? { ...x, copies: Math.max(0, Math.floor(Number(e.target.value) || 0)) } : x)),
                    )
                  }
                />
              </label>
              <button className="btn btn-ghost btn-sm text-red-600" onClick={() => setLines((prev) => prev.filter((x) => x.item.id !== l.item.id))}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
