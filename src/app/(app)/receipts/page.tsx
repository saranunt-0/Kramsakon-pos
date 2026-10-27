"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer, RotateCcw, Ban } from "lucide-react";
import { useAuth, useSettings } from "@/components/auth";
import { openReceipt } from "@/components/checkout";
import { ReceiptView } from "@/components/receipt";
import { ScanBox, useScanner } from "@/components/scanner";
import { Badge, EmptyState, ErrorBox, Field, Modal, PageHeader, PageLoading, Spinner, errorText, toast } from "@/components/ui";
import { addDays, bangkokDayStart, bangkokToday, money, thaiDateTime } from "@/lib/format";
import { PAYMENT_METHODS, paymentLabel } from "@/lib/labels";
import { rpc, supabase } from "@/lib/supabase";
import type { PaymentMethod, Receipt, Sale } from "@/lib/types";

type Row = Sale & { cashier: { display_name: string } | null };

export default function ReceiptsPage() {
  const [date, setDate] = useState(bangkokToday());
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    let q = supabase()
      .from("sales")
      .select("*, cashier:profiles!sales_cashier_id_fkey(display_name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (search.trim()) q = q.ilike("receipt_no", `%${search.trim()}%`);
    else q = q.gte("created_at", bangkokDayStart(date)).lt("created_at", bangkokDayStart(addDays(date, 1)));
    const { data, error } = await q;
    if (error) setError(error.message);
    setRows((data ?? []) as Row[]);
  }, [date, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Scanning the barcode printed on a receipt opens it.
  const openByNumber = useCallback(async (code: string) => {
    const { data } = await supabase().from("sales").select("id").eq("receipt_no", code).maybeSingle();
    if (data) setOpenId(data.id);
    else toast(`ไม่พบใบเสร็จ ${code}`, "error");
  }, []);
  useScanner(openByNumber, !openId);

  const totalNet = (rows ?? []).filter((r) => r.status === "completed").reduce((s, r) => s + Number(r.total), 0);

  return (
    <div className="space-y-4">
      <PageHeader title="ใบเสร็จ / คืนสินค้า" />
      <div className="card grid gap-3 p-4 sm:grid-cols-[180px_1fr_1fr]">
        <Field label="วันที่">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} disabled={!!search} />
        </Field>
        <Field label="ค้นหาเลขที่ใบเสร็จ">
          <input className="input" placeholder="เช่น S2610-0012" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <div>
          <span className="label">สแกนบาร์โค้ดบนใบเสร็จ</span>
          <ScanBox onScan={openByNumber} placeholder="สแกนใบเสร็จ" />
        </div>
      </div>
      <ErrorBox error={error} />

      {!rows ? (
        <PageLoading />
      ) : rows.length === 0 ? (
        <EmptyState>ไม่มีใบเสร็จ</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>เลขที่</th>
                <th>เวลา</th>
                <th>พนักงาน</th>
                <th>ชำระโดย</th>
                <th className="num">ยอด</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(r.id)}>
                  <td className="font-mono">{r.receipt_no}</td>
                  <td className="whitespace-nowrap">{thaiDateTime(r.created_at)}</td>
                  <td>{r.cashier?.display_name}</td>
                  <td>{paymentLabel(r.payment_method)}</td>
                  <td className={`num ${Number(r.total) < 0 ? "text-red-600" : ""}`}>{money(r.total)}</td>
                  <td>
                    {r.status === "voided" ? (
                      <Badge tone="red">ยกเลิก</Badge>
                    ) : r.kind === "refund" ? (
                      <Badge tone="amber">คืนสินค้า</Badge>
                    ) : (
                      <Badge tone="green">ขาย</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="font-medium">ยอดสุทธิ (ไม่รวมบิลที่ยกเลิก)</td>
                <td className="num font-semibold">{money(totalNet)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {openId && (
        <ReceiptModal
          key={openId}
          saleId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            load();
          }}
          onOpen={setOpenId}
        />
      )}
    </div>
  );
}

function ReceiptModal({
  saleId,
  onClose,
  onChanged,
  onOpen,
}: {
  saleId: string;
  onClose: () => void;
  onChanged: () => void;
  onOpen: (id: string) => void;
}) {
  const settings = useSettings();
  const { isAdmin } = useAuth();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "refund" | "void">("view");

  const load = useCallback(() => {
    rpc<Receipt>("get_receipt", { p_sale_id: saleId })
      .then(setReceipt)
      .catch((e) => setError(errorText(e)));
  }, [saleId]);
  useEffect(load, [load]);

  const canRefund =
    receipt?.kind === "sale" &&
    receipt.status === "completed" &&
    (isAdmin || settings.staff_can_refund) &&
    receipt.items.some((i) => i.refundable_qty > 0);
  const canVoid = isAdmin && receipt?.status === "completed";

  return (
    <Modal title={receipt ? `ใบเสร็จ ${receipt.receipt_no}` : "ใบเสร็จ"} onClose={onClose} wide>
      <ErrorBox error={error} />
      {!receipt ? (
        <PageLoading />
      ) : mode === "refund" ? (
        <RefundForm
          receipt={receipt}
          onCancel={() => setMode("view")}
          onDone={(refundId) => {
            onChanged();
            onOpen(refundId);
          }}
        />
      ) : mode === "void" ? (
        <VoidForm
          receipt={receipt}
          onCancel={() => setMode("view")}
          onDone={() => {
            setMode("view");
            load();
            onChanged();
          }}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-[1fr_220px]">
          <div className="mx-auto w-full max-w-[80mm] rounded-lg border border-slate-200 p-3">
            <ReceiptView receipt={receipt} settings={settings} />
          </div>
          <div className="space-y-2">
            <button className="btn btn-secondary w-full" onClick={() => openReceipt(receipt.id)}>
              <Printer size={18} /> พิมพ์ซ้ำ
            </button>
            {canRefund && (
              <button className="btn btn-secondary w-full" onClick={() => setMode("refund")}>
                <RotateCcw size={18} /> คืนสินค้า / เปลี่ยนสินค้า
              </button>
            )}
            {canVoid && (
              <button className="btn btn-secondary w-full text-red-600" onClick={() => setMode("void")}>
                <Ban size={18} /> ยกเลิกบิล
              </button>
            )}
            {receipt.refunds.length > 0 && (
              <div className="pt-2 text-sm">
                <div className="mb-1 font-medium">การคืนสินค้าของบิลนี้</div>
                {receipt.refunds.map((r) => (
                  <button key={r.id} className="block text-kram-700 underline" onClick={() => onOpen(r.id)}>
                    {r.receipt_no} ({money(r.total)}){r.status === "voided" && " – ยกเลิก"}
                  </button>
                ))}
              </div>
            )}
            {receipt.refund_of && (
              <button className="text-sm text-kram-700 underline" onClick={() => onOpen(receipt.refund_of!)}>
                ดูใบเสร็จเดิม {receipt.original_receipt_no}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

const QUICK_REASONS = ["เปลี่ยนไซซ์", "เปลี่ยนสี/แบบ", "สินค้ามีตำหนิ", "ลูกค้าเปลี่ยนใจ"];

function RefundForm({
  receipt,
  onCancel,
  onDone,
}: {
  receipt: Receipt;
  onCancel: () => void;
  onDone: (refundId: string) => void;
}) {
  const [qty, setQty] = useState<Record<number, number>>({});
  const [method, setMethod] = useState<PaymentMethod>(receipt.payment_method);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refundable = receipt.items.filter((i) => i.refundable_qty > 0);
  const estimate = refundable.reduce((s, i) => s + (Number(i.line_total) * (qty[i.id] ?? 0)) / i.qty, 0);
  const anything = Object.values(qty).some((n) => n > 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await rpc<{ id: string; receipt_no: string }>("refund_sale", {
        p_sale_id: receipt.id,
        p_items: Object.entries(qty)
          .filter(([, n]) => n > 0)
          .map(([id, n]) => ({ sale_item_id: Number(id), qty: n })),
        p_payment_method: method,
        p_reason: reason,
      });
      toast(`บันทึกการคืนสินค้า ${res.receipt_no} แล้ว — สินค้ากลับเข้าสต็อก`);
      onDone(res.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-kram-50 p-3 text-sm text-kram-800">
        เลือกจำนวนที่ลูกค้านำมาคืน สินค้าจะกลับเข้าสต็อก — ถ้าเป็นการเปลี่ยนสินค้า ให้คืนที่นี่ แล้วขายชิ้นใหม่ที่หน้าขายตามปกติ
      </p>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {refundable.map((i) => (
          <div key={i.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{i.product_name}</div>
              <div className="text-xs text-slate-500">
                {[i.variant_label, i.sku].filter(Boolean).join(" · ")} · คืนได้ {i.refundable_qty} ชิ้น
              </div>
            </div>
            <select
              className="input w-20"
              value={qty[i.id] ?? 0}
              onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })}
            >
              {Array.from({ length: i.refundable_qty + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="คืนเงินทาง">
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="เหตุผล">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_REASONS.map((r) => (
          <button key={r} className="btn btn-secondary btn-sm" onClick={() => setReason(r)}>
            {r}
          </button>
        ))}
      </div>
      <div className="text-right text-lg">
        ยอดคืนเงินประมาณ <span className="font-bold">฿{money(estimate)}</span>
      </div>
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <button className="btn btn-secondary" onClick={onCancel}>
          ย้อนกลับ
        </button>
        <button className="btn btn-primary flex-1" disabled={busy || !anything || !reason.trim()} onClick={submit}>
          {busy && <Spinner />} ยืนยันการคืนสินค้า
        </button>
      </div>
    </div>
  );
}

function VoidForm({ receipt, onCancel, onDone }: { receipt: Receipt; onCancel: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await rpc("void_sale", { p_sale_id: receipt.id, p_reason: reason });
      toast("ยกเลิกบิลแล้ว — สต็อกถูกปรับกลับ");
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
        ใช้สำหรับบิลที่บันทึกผิดเท่านั้น (เช่น กดขายผิด) ใบเสร็จจะยังอยู่ในระบบแต่ถูกทำเครื่องหมายว่ายกเลิก และไม่นับในยอดขาย ถ้าลูกค้านำสินค้ามาคืน ให้ใช้ “คืนสินค้า” แทน
      </p>
      <Field label="เหตุผลที่ยกเลิก">
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <button className="btn btn-secondary" onClick={onCancel}>
          ย้อนกลับ
        </button>
        <button className="btn btn-danger flex-1" disabled={busy || !reason.trim()} onClick={submit}>
          {busy && <Spinner />} ยืนยันยกเลิกบิล
        </button>
      </div>
    </div>
  );
}
