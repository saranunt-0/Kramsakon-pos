"use client";

import { useCallback, useMemo, useState } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { useSettings } from "@/components/auth";
import { useCart } from "@/components/cart";
import { searchItems, useCatalog } from "@/components/catalog";
import { ScanBox, beep, useScanner } from "@/components/scanner";
import { OpenShiftModal, useOpenShift } from "@/components/shift";
import { CheckoutModal } from "@/components/checkout";
import { ErrorBox, Modal, PageLoading, toast } from "@/components/ui";
import { cartTotals, lineTotal, parseDiscount, type CartLine } from "@/lib/cart";
import { money } from "@/lib/format";
import { variantLabel } from "@/lib/labels";
import type { Item } from "@/lib/types";

export default function PosPage() {
  const settings = useSettings();
  const { items, categories, loading, error, findBySku, refresh } = useCatalog();
  const cart = useCart();
  const { shift, loading: shiftLoading, refresh: refreshShift } = useOpenShift();

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [editing, setEditing] = useState<CartLine | null>(null);
  const [openingShift, setOpeningShift] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const vatRate = settings.vat_registered ? Number(settings.vat_rate) : null;
  const billBase = cart.lines.reduce((s, l) => s + lineTotal(l), 0);
  const billDiscount = parseDiscount(cart.billDiscountInput, billBase);
  const totals = cartTotals(cart.lines, Number.isNaN(billDiscount) ? 0 : billDiscount, vatRate);

  const results = useMemo(() => searchItems(items, query, categoryId).slice(0, 120), [items, query, categoryId]);

  const addItem = useCallback(
    (item: Item) => {
      const inCart = cart.lines.find((l) => l.variantId === item.id)?.qty ?? 0;
      if (item.products.is_unique && inCart >= 1) {
        beep(false);
        toast(`"${item.products.name}" เป็นสินค้าชิ้นเดียว อยู่ในบิลแล้ว`, "error");
        return;
      }
      cart.add(item);
      beep(true);
      if (item.stock_qty - inCart <= 0) {
        toast(
          item.products.is_unique
            ? `ระวัง: "${item.products.name}" ชิ้นนี้ในระบบขายไปแล้ว`
            : `ระวัง: "${item.products.name}" สต็อกในระบบหมด`,
          "error",
        );
      }
    },
    [cart],
  );

  const onScan = useCallback(
    async (code: string) => {
      const item = await findBySku(code);
      if (item) addItem(item);
      else {
        beep(false);
        toast(`ไม่พบสินค้ารหัส ${code}`, "error");
      }
    },
    [findBySku, addItem],
  );

  useScanner(onScan, !checkingOut && !editing && !openingShift);

  if (loading || shiftLoading) return <PageLoading />;

  return (
    <div className="grid gap-4 pb-24 lg:grid-cols-[1fr_400px] lg:pb-0">
      {/* Left: find products */}
      <section className="min-w-0 space-y-3">
        {!shift && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <span>ยังไม่ได้เปิดกะ — ต้องเปิดกะก่อนจึงจะขายได้</span>
            <button className="btn btn-primary" onClick={() => setOpeningShift(true)}>
              เปิดกะ
            </button>
          </div>
        )}
        <ErrorBox error={error} />
        <ScanBox onScan={onScan} autoFocus />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={18} />
          <input
            className="input pl-10"
            placeholder="ค้นหาชื่อสินค้า ไซซ์ สี"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <CategoryChip active={categoryId === null} onClick={() => setCategoryId(null)}>
            ทั้งหมด
          </CategoryChip>
          {categories.map((c) => (
            <CategoryChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
              {c.name}
            </CategoryChip>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="card p-6 text-center text-slate-500">ยังไม่มีสินค้า — เพิ่มสินค้าที่เมนู “รายการสินค้า”</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {results.map((item) => (
              <button
                key={item.id}
                onClick={() => addItem(item)}
                className="card flex flex-col items-start p-3 text-left hover:border-kram-400 hover:bg-kram-50 active:scale-[0.98]"
              >
                <span className="line-clamp-2 text-sm font-medium">{item.products.name}</span>
                <span className="text-xs text-slate-500">{variantLabel(item) || " "}</span>
                <span className="mt-auto flex w-full items-end justify-between pt-2">
                  <span className="font-semibold text-kram-700">฿{money(item.price)}</span>
                  <span className={`text-xs ${item.stock_qty <= 0 ? "text-red-600" : "text-slate-500"}`}>
                    {item.products.is_unique ? (item.stock_qty > 0 ? "ชิ้นเดียว" : "ขายแล้ว") : `เหลือ ${item.stock_qty}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Right: the bill */}
      <section id="bill" className="card flex h-fit scroll-mt-16 flex-col lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">บิลปัจจุบัน ({totals.itemCount} ชิ้น)</h2>
          {cart.lines.length > 0 && (
            <button className="btn btn-ghost btn-sm text-red-600" onClick={() => confirm("ล้างบิลนี้?") && cart.clear()}>
              ล้างบิล
            </button>
          )}
        </div>

        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {cart.lines.length === 0 && <p className="p-6 text-center text-sm text-slate-500">สแกนหรือแตะสินค้าเพื่อเพิ่มลงบิล</p>}
          {cart.lines.map((line) => (
            <div key={line.variantId} className="flex gap-2 px-4 py-2">
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(line)}>
                <div className="truncate text-sm font-medium">{line.name}</div>
                <div className="text-xs text-slate-500">
                  {[line.label, `฿${money(line.price)}`].filter(Boolean).join(" · ")}
                  {line.discount > 0 && <span className="text-emerald-700"> · ลด ฿{money(line.discount)}</span>}
                </div>
              </button>
              <div className="flex items-center gap-1">
                <button className="btn btn-secondary btn-sm px-1.5" onClick={() => cart.setQty(line.variantId, line.qty - 1)} aria-label="ลด">
                  <Minus size={14} />
                </button>
                <span className="w-7 text-center text-sm tabular-nums">{line.qty}</span>
                <button
                  className="btn btn-secondary btn-sm px-1.5"
                  onClick={() => cart.setQty(line.variantId, line.qty + 1)}
                  disabled={line.isUnique}
                  aria-label="เพิ่ม"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="w-20 text-right text-sm font-medium tabular-nums">{money(lineTotal(line))}</div>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-slate-100 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-600">ส่วนลดท้ายบิล</span>
            <input
              className={`input w-28 py-1 text-right ${Number.isNaN(billDiscount) ? "border-red-400" : ""}`}
              placeholder="0 หรือ 10%"
              value={cart.billDiscountInput}
              onChange={(e) => cart.setBillDiscountInput(e.target.value)}
            />
          </div>
          <Row label="รวม" value={money(totals.subtotal)} />
          {totals.billDiscount > 0 && <Row label="ส่วนลด" value={`-${money(totals.billDiscount)}`} />}
          {vatRate !== null && <Row label={`VAT ${vatRate}% (รวมในราคาแล้ว)`} value={money(totals.vat)} muted />}
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-base font-semibold">ยอดชำระ</span>
            <span className="text-2xl font-bold text-kram-800 tabular-nums">฿{money(totals.total)}</span>
          </div>
          <button
            className="btn btn-primary btn-lg hidden w-full lg:flex"
            disabled={!cart.lines.length || !shift || Number.isNaN(billDiscount)}
            onClick={() => setCheckingOut(true)}
          >
            ชำระเงิน
          </button>
        </div>
      </section>

      {/* Phone: sticky pay bar */}
      <div className="no-print fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-slate-200 bg-white p-3 lg:hidden">
        <button className="flex-1 text-left" onClick={() => document.getElementById("bill")?.scrollIntoView({ behavior: "smooth" })}>
          <div className="text-xs text-slate-500">{totals.itemCount} ชิ้น · ดูบิล</div>
          <div className="text-xl font-bold text-kram-800 tabular-nums">฿{money(totals.total)}</div>
        </button>
        <button
          className="btn btn-primary btn-lg"
          disabled={!cart.lines.length || !shift || Number.isNaN(billDiscount)}
          onClick={() => setCheckingOut(true)}
        >
          ชำระเงิน
        </button>
      </div>

      {editing && (
        <EditLineModal
          line={cart.lines.find((l) => l.variantId === editing.variantId) ?? editing}
          onClose={() => setEditing(null)}
        />
      )}
      {openingShift && (
        <OpenShiftModal
          onClose={() => setOpeningShift(false)}
          onOpened={() => {
            setOpeningShift(false);
            refreshShift();
          }}
        />
      )}
      {checkingOut && (
        <CheckoutModal
          totals={totals}
          onClose={() => setCheckingOut(false)}
          onDone={() => {
            cart.clear();
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-xs text-slate-500" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
        active ? "border-kram-700 bg-kram-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function EditLineModal({ line, onClose }: { line: CartLine; onClose: () => void }) {
  const cart = useCart();
  const [qty, setQty] = useState(String(line.qty));
  const [discount, setDiscount] = useState(line.discount ? String(line.discount) : "");
  const gross = line.price * (Number(qty) || 0);
  const parsed = parseDiscount(discount, gross);
  const invalid = !Number.isInteger(Number(qty)) || Number(qty) < 1 || Number.isNaN(parsed) || parsed > gross;

  function save() {
    if (invalid) return;
    cart.setQty(line.variantId, Number(qty));
    cart.setDiscount(line.variantId, parsed);
    onClose();
  }

  return (
    <Modal title={line.name} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          {[line.label, line.sku, `฿${money(line.price)}`].filter(Boolean).join(" · ")}
        </p>
        <label className="block">
          <span className="label">จำนวน</span>
          <input className="input" inputMode="numeric" value={qty} disabled={line.isUnique} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">ส่วนลดรายการนี้ (บาท หรือ %)</span>
          <input
            className="input"
            placeholder="เช่น 50 หรือ 10%"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          {!Number.isNaN(parsed) && parsed > 0 && <span className="mt-1 block text-xs text-emerald-700">ลด ฿{money(parsed)}</span>}
        </label>
        <div className="flex gap-2">
          <button
            className="btn btn-danger"
            onClick={() => {
              cart.remove(line.variantId);
              onClose();
            }}
          >
            <Trash2 size={16} /> ลบ
          </button>
          <button className="btn btn-primary flex-1" disabled={invalid} onClick={save}>
            ตกลง
          </button>
        </div>
      </div>
    </Modal>
  );
}
