"use client";

import { useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { useSettings } from "./auth";
import { useCart } from "./cart";
import { QrCode } from "./barcode";
import { ErrorBox, Field, Modal, Spinner, errorText } from "./ui";
import { cashSuggestions, type CartTotals } from "@/lib/cart";
import { money, round2 } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/labels";
import { isValidPromptPayId, promptPayPayload } from "@/lib/promptpay";
import { rpc } from "@/lib/supabase";
import type { PaymentMethod } from "@/lib/types";

interface SaleResult {
  id: string;
  receipt_no: string;
  total: number;
  change: number | null;
}

export function openReceipt(saleId: string) {
  window.open(`/print/receipt/${saleId}`, "_blank", "width=420,height=700");
}

export function CheckoutModal({
  totals,
  onClose,
  onDone,
}: {
  totals: CartTotals;
  onClose: () => void;
  onDone: () => void;
}) {
  const settings = useSettings();
  const cart = useCart();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cash, setCash] = useState("");
  const [wantTaxInvoice, setWantTaxInvoice] = useState(false);
  const [customer, setCustomer] = useState({ name: "", tax_id: "", address: "", branch: "สำนักงานใหญ่" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaleResult | null>(null);

  const cashNumber = Number(cash);
  const change = method === "cash" && cash !== "" ? round2(cashNumber - totals.total) : null;
  const cashOk = method !== "cash" || (cash !== "" && cashNumber >= totals.total);
  const promptPayReady = isValidPromptPayId(settings.promptpay_id);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const sale = await rpc<SaleResult>("create_sale", {
        p_items: cart.lines.map((l) => ({ variant_id: l.variantId, qty: l.qty, discount: l.discount })),
        p_payment_method: method,
        p_bill_discount: totals.billDiscount,
        p_cash_received: method === "cash" ? cashNumber : null,
        p_expected_total: totals.total,
        p_customer: wantTaxInvoice ? customer : {},
        p_note: note,
      });
      setResult(sale);
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Modal title="ขายสำเร็จ" onClose={onClose}>
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" size={56} />
          <div className="text-sm text-slate-500">เลขที่ใบเสร็จ {result.receipt_no}</div>
          <div className="text-3xl font-bold tabular-nums">฿{money(result.total)}</div>
          {result.change !== null && (
            <div className="rounded-xl bg-amber-50 p-4">
              <div className="text-sm text-amber-800">เงินทอน</div>
              <div className="text-4xl font-bold text-amber-900 tabular-nums">฿{money(result.change)}</div>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn btn-secondary flex-1" onClick={() => openReceipt(result.id)}>
              <Printer size={18} /> พิมพ์ใบเสร็จ
            </button>
            <button className="btn btn-primary flex-1" autoFocus onClick={onClose}>
              ขายบิลถัดไป
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="ชำระเงิน" onClose={onClose} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl bg-kram-50 p-4 text-center">
            <div className="text-sm text-kram-700">ยอดชำระ</div>
            <div className="text-4xl font-bold text-kram-900 tabular-nums">฿{money(totals.total)}</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                className={`btn ${method === m.value ? "btn-primary" : "btn-secondary"} ${m.value === "cash" ? "col-span-2" : ""}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {method === "cash" && (
            <div className="space-y-2">
              <Field label="รับเงินมา (บาท)">
                <input
                  className="input text-xl"
                  inputMode="decimal"
                  autoFocus
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && cashOk && !busy && confirm()}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {cashSuggestions(totals.total).map((v) => (
                  <button key={v} className="btn btn-secondary btn-sm" onClick={() => setCash(String(v))}>
                    {money(v)}
                  </button>
                ))}
              </div>
              {change !== null && (
                <div className={`text-lg font-semibold ${change < 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {change < 0 ? `ยังขาดอีก ฿${money(-change)}` : `เงินทอน ฿${money(change)}`}
                </div>
              )}
            </div>
          )}

          {method === "promptpay" && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-3">
              {promptPayReady ? (
                <>
                  <QrCode value={promptPayPayload(settings.promptpay_id, totals.total)} />
                  <div className="text-sm text-slate-600">ให้ลูกค้าสแกนเพื่อจ่าย ฿{money(totals.total)}</div>
                  <div className="text-xs text-amber-700">ตรวจสอบยอดเงินเข้าในแอปธนาคารก่อนกดยืนยัน</div>
                </>
              ) : (
                <div className="text-sm text-amber-700">ยังไม่ได้ตั้งค่าพร้อมเพย์ — ผู้ดูแลระบบตั้งได้ที่หน้า “ตั้งค่าร้าน”</div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={wantTaxInvoice} onChange={(e) => setWantTaxInvoice(e.target.checked)} />
            ลูกค้าขอใบกำกับภาษีเต็มรูป
          </label>
          {wantTaxInvoice && (
            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <input className="input" placeholder="ชื่อลูกค้า / บริษัท" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
              <input className="input" placeholder="เลขประจำตัวผู้เสียภาษี 13 หลัก" inputMode="numeric" value={customer.tax_id} onChange={(e) => setCustomer({ ...customer, tax_id: e.target.value })} />
              <input className="input" placeholder="สาขา (เช่น สำนักงานใหญ่)" value={customer.branch} onChange={(e) => setCustomer({ ...customer, branch: e.target.value })} />
              <textarea className="input" rows={2} placeholder="ที่อยู่" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
            </div>
          )}
          <Field label="หมายเหตุ (ถ้ามี)">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <ErrorBox error={error} />
          <button
            className="btn btn-primary btn-lg w-full"
            disabled={busy || !cashOk || (wantTaxInvoice && (!customer.name.trim() || !customer.tax_id.trim()))}
            onClick={confirm}
          >
            {busy && <Spinner />} ยืนยันการขาย
          </button>
        </div>
      </div>
    </Modal>
  );
}
