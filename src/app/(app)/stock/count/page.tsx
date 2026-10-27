"use client";

import { useCallback, useState } from "react";
import { Trash2 } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { useCatalog } from "@/components/catalog";
import { ItemPicker } from "@/components/item-picker";
import { ScanBox, beep, useScanner } from "@/components/scanner";
import { EmptyState, ErrorBox, Field, PageHeader, Spinner, errorText, toast } from "@/components/ui";
import { variantLabel } from "@/lib/labels";
import { rpc } from "@/lib/supabase";
import type { Item } from "@/lib/types";

export default function CountPage() {
  return (
    <AdminOnly>
      <div className="max-w-4xl space-y-6">
        <PageHeader title="ตรวจนับ / ปรับสต็อก" />
        <StockCount />
        <Adjust />
      </div>
    </AdminOnly>
  );
}

function StockCount() {
  const { findBySku, refresh } = useCatalog();
  const [lines, setLines] = useState<{ item: Item; counted: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback((item: Item) => {
    setLines((prev) => {
      const found = prev.find((l) => l.item.id === item.id);
      if (found) return prev.map((l) => (l.item.id === item.id ? { ...l, counted: l.counted + 1 } : l));
      return [{ item, counted: 1 }, ...prev];
    });
    beep(true);
  }, []);

  const onScan = useCallback(
    async (code: string) => {
      const item = await findBySku(code);
      if (item) add(item);
      else {
        beep(false);
        toast(`ไม่พบสินค้ารหัส ${code}`, "error");
      }
    },
    [findBySku, add],
  );
  useScanner(onScan);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const changed = await rpc<number>("count_stock", {
        p_items: lines.map((l) => ({ variant_id: l.item.id, counted: l.counted })),
        p_note: "ตรวจนับ",
      });
      toast(`บันทึกผลตรวจนับแล้ว — ปรับ ${changed} รายการ`);
      setLines([]);
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">ตรวจนับสต็อก</h2>
      <p className="text-sm text-slate-600">
        สแกนสินค้าทุกชิ้นบนชั้น (สแกนซ้ำ = นับเพิ่ม) แล้วกดบันทึก ระบบจะปรับยอดคงเหลือให้ตรงกับที่นับได้ เฉพาะรายการที่นับเท่านั้น
      </p>
      <ScanBox onScan={onScan} continuousCamera />
      <ItemPicker onPick={add} />
      {lines.length === 0 ? (
        <EmptyState>ยังไม่ได้นับสินค้า</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th className="num">ในระบบ</th>
                  <th>นับได้</th>
                  <th className="num">ส่วนต่าง</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const diff = l.counted - l.item.stock_qty;
                  return (
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
                          value={l.counted}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x) =>
                                x.item.id === l.item.id ? { ...x, counted: Math.max(0, Math.floor(Number(e.target.value) || 0)) } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className={`num font-medium ${diff < 0 ? "text-red-600" : diff > 0 ? "text-emerald-700" : ""}`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm text-red-600" onClick={() => setLines((p) => p.filter((x) => x.item.id !== l.item.id))}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ErrorBox error={error} />
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            {busy && <Spinner />} บันทึกผลตรวจนับ
          </button>
        </>
      )}
    </section>
  );
}

const REASONS = ["สินค้าเสียหาย", "สินค้าสูญหาย", "ใช้เอง / ของแถม", "พบสินค้าเพิ่ม"];

function Adjust() {
  const { refresh } = useCatalog();
  const [item, setItem] = useState<Item | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      await rpc("adjust_stock", { p_variant_id: item.id, p_qty_change: Number(qty), p_note: reason });
      toast("ปรับสต็อกแล้ว");
      setItem(null);
      setQty("");
      setReason("");
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">ปรับสต็อกรายชิ้น</h2>
      {item ? (
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm">
          <span>
            <span className="font-medium">{item.products.name}</span> {variantLabel(item)} · คงเหลือ {item.stock_qty}
          </span>
          <button className="text-kram-700 underline" onClick={() => setItem(null)}>
            เปลี่ยน
          </button>
        </div>
      ) : (
        <ItemPicker onPick={setItem} />
      )}
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="จำนวนที่ปรับ (+/−)">
          <input className="input" inputMode="numeric" placeholder="-1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="เหตุผล">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button key={r} className="btn btn-secondary btn-sm" onClick={() => setReason(r)}>
            {r}
          </button>
        ))}
      </div>
      <ErrorBox error={error} />
      <button
        className="btn btn-primary"
        disabled={busy || !item || !Number.isInteger(Number(qty)) || Number(qty) === 0 || !reason.trim()}
        onClick={save}
      >
        {busy && <Spinner />} บันทึกการปรับ
      </button>
    </section>
  );
}
