"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Printer, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth";
import { useCatalog } from "@/components/catalog";
import { ItemPicker } from "@/components/item-picker";
import { ScanBox, beep, useScanner } from "@/components/scanner";
import { EmptyState, ErrorBox, Field, PageHeader, Spinner, errorText, toast } from "@/components/ui";
import { openLabelPrint, type LabelJob } from "@/lib/label-job";
import { variantLabel } from "@/lib/labels";
import { rpc } from "@/lib/supabase";
import type { Item } from "@/lib/types";

interface Line {
  item: Item;
  qty: number;
  cost: string;
}

export default function ReceivePage() {
  const { isAdmin } = useAuth();
  const { findBySku, refresh } = useCatalog();
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [lastJob, setLastJob] = useState<LabelJob[]>([]);

  const add = useCallback((item: Item) => {
    setLines((prev) => {
      const found = prev.find((l) => l.item.id === item.id);
      if (found) return prev.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l));
      return [{ item, qty: 1, cost: "" }, ...prev];
    });
    beep(true);
    setUnknown(null);
  }, []);

  const onScan = useCallback(
    async (code: string) => {
      const item = await findBySku(code);
      if (item) add(item);
      else {
        beep(false);
        setUnknown(code);
      }
    },
    [findBySku, add],
  );
  useScanner(onScan);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await rpc("receive_stock", {
        p_items: lines.map((l) => ({ variant_id: l.item.id, qty: l.qty, unit_cost: isAdmin ? l.cost : "" })),
        p_note: note,
      });
      toast(`รับสินค้าเข้า ${lines.reduce((s, l) => s + l.qty, 0)} ชิ้นแล้ว`);
      setLastJob(lines.map((l) => ({ id: l.item.id, copies: l.qty })));
      setLines([]);
      setNote("");
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="รับสินค้าเข้า" />
      <div className="card space-y-3 p-4">
        <p className="text-sm text-slate-600">สแกนสินค้าทีละชิ้น (สแกนซ้ำ = เพิ่มจำนวน) หรือค้นหาจากชื่อ แล้วกดบันทึก</p>
        <ScanBox onScan={onScan} autoFocus continuousCamera />
        <ItemPicker onPick={add} />
        {unknown && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <span>
              ไม่พบบาร์โค้ด <span className="font-mono">{unknown}</span> ในระบบ
            </span>
            <Link className="btn btn-primary btn-sm" href="/products/new">
              ลงทะเบียนสินค้าใหม่
            </Link>
          </div>
        )}
      </div>

      {lastJob.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <span>บันทึกแล้ว — ต้องการพิมพ์บาร์โค้ดสำหรับสินค้าที่รับเข้าไหม?</span>
          <button className="btn btn-primary btn-sm" onClick={() => openLabelPrint(lastJob)}>
            <Printer size={16} /> พิมพ์ {lastJob.reduce((s, j) => s + j.copies, 0)} ดวง
          </button>
        </div>
      )}

      {lines.length === 0 ? (
        <EmptyState>ยังไม่มีรายการ</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>สินค้า</th>
                <th className="num">คงเหลือเดิม</th>
                <th>จำนวนรับเข้า</th>
                {isAdmin && <th>ต้นทุน/ชิ้น (ไม่รวม VAT)</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.item.id}>
                  <td>
                    <div className="font-medium">{l.item.products.name}</div>
                    <div className="text-xs text-slate-500">{[variantLabel(l.item), l.item.sku].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="num">{l.item.stock_qty}</td>
                  <td>
                    <input
                      className="input w-24"
                      inputMode="numeric"
                      value={l.qty}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) => (x.item.id === l.item.id ? { ...x, qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) } : x)),
                        )
                      }
                    />
                  </td>
                  {isAdmin && (
                    <td>
                      <input
                        className="input w-28"
                        inputMode="decimal"
                        placeholder="ไม่เปลี่ยน"
                        value={l.cost}
                        onChange={(e) => setLines((prev) => prev.map((x) => (x.item.id === l.item.id ? { ...x, cost: e.target.value } : x)))}
                      />
                    </td>
                  )}
                  <td>
                    <button className="btn btn-ghost btn-sm text-red-600" onClick={() => setLines((prev) => prev.filter((x) => x.item.id !== l.item.id))}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="หมายเหตุ (เช่น ชื่อผู้ขาย / เลขที่บิล)">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <button className="btn btn-primary btn-lg" disabled={busy || lines.every((l) => l.qty <= 0)} onClick={save}>
              {busy && <Spinner />} บันทึกรับเข้า {lines.reduce((s, l) => s + l.qty, 0)} ชิ้น
            </button>
          </div>
          {isAdmin && (
            <p className="px-4 pb-4 text-xs text-slate-500">
              ใส่ต้นทุนเพื่อให้ระบบคำนวณต้นทุนเฉลี่ยใหม่ เว้นว่างไว้ถ้าต้นทุนเท่าเดิม • ค่าซื้อสินค้า (เงินที่จ่ายผู้ขาย) ให้บันทึกที่เมนู “ค่าใช้จ่าย” หมวด
              “ซื้อสินค้า/ผ้ามาขาย” ด้วย เพื่อให้ภาษีซื้อและเงินสดถูกต้อง
            </p>
          )}
        </div>
      )}
      <ErrorBox error={error} />
    </div>
  );
}
