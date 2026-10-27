"use client";

import { Barcode } from "./barcode";
import { money, thaiDateTime } from "@/lib/format";
import { paymentLabel } from "@/lib/labels";
import type { Receipt, Settings } from "@/lib/types";

function title(r: Receipt, s: Settings): string {
  if (r.kind === "refund") return s.vat_registered ? "ใบรับคืนสินค้า / ใบลดหนี้" : "ใบรับคืนสินค้า";
  if (!s.vat_registered) return "ใบเสร็จรับเงิน";
  return r.customer_tax_id ? "ใบเสร็จรับเงิน / ใบกำกับภาษี" : "ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ";
}

/** The printed receipt. Amounts on refund receipts are shown as positive numbers. */
export function ReceiptView({ receipt: r, settings: s }: { receipt: Receipt; settings: Settings }) {
  const sign = r.kind === "refund" ? -1 : 1;
  const abs = (n: number) => money(sign * Number(n));
  const full = s.vat_registered && Boolean(r.customer_tax_id);
  const discounts = r.items.reduce((sum, i) => sum + sign * Number(i.line_discount), 0) + sign * Number(r.bill_discount);

  return (
    <div className="relative bg-white text-[12px] leading-snug text-black">
      {r.status === "voided" && (
        <div className="mb-2 border-2 border-red-600 p-1 text-center font-bold text-red-600">
          ยกเลิกแล้ว {r.void_reason ? `(${r.void_reason})` : ""}
        </div>
      )}
      <div className="text-center">
        <div className="text-[15px] font-bold">{s.shop_name}</div>
        {s.branch_name && <div>{s.branch_name}</div>}
        {s.address && <div className="whitespace-pre-line">{s.address}</div>}
        {s.phone && <div>โทร {s.phone}</div>}
        {s.vat_registered && s.tax_id && <div>เลขประจำตัวผู้เสียภาษี {s.tax_id}</div>}
        {s.pos_reg_no && <div>POS ID: {s.pos_reg_no}</div>}
        <div className="mt-1 font-bold">{title(r, s)}</div>
      </div>

      <div className="mt-2 border-t border-dashed border-black pt-1">
        <div className="flex justify-between">
          <span>เลขที่ {r.receipt_no}</span>
          <span>{thaiDateTime(r.created_at)}</span>
        </div>
        {r.original_receipt_no && <div>อ้างอิงใบเสร็จ {r.original_receipt_no}</div>}
        {r.cashier_name && <div>พนักงาน: {r.cashier_name}</div>}
        {r.kind === "refund" && r.note && <div>เหตุผล: {r.note}</div>}
      </div>

      {r.customer_tax_id && (
        <div className="mt-1 border-t border-dashed border-black pt-1">
          <div>ลูกค้า: {r.customer_name}</div>
          <div>
            เลขประจำตัวผู้เสียภาษี {r.customer_tax_id} {r.customer_branch && `(${r.customer_branch})`}
          </div>
          {r.customer_address && <div className="whitespace-pre-line">{r.customer_address}</div>}
        </div>
      )}

      <div className="mt-1 border-t border-dashed border-black pt-1">
        {r.items.map((i) => (
          <div key={i.id} className="py-0.5">
            <div>
              {i.product_name}
              {i.variant_label && ` (${i.variant_label})`}
            </div>
            <div className="flex justify-between pl-2">
              <span>
                {sign * i.qty} × {money(i.unit_price)}
                {Number(i.line_discount) !== 0 && ` ลด ${abs(i.line_discount)}`}
              </span>
              <span className="tabular-nums">{money(sign * (i.qty * Number(i.unit_price) - Number(i.line_discount)))}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1 space-y-0.5 border-t border-dashed border-black pt-1">
        {Number(r.bill_discount) !== 0 && <Line label="ส่วนลดท้ายบิล" value={`-${abs(r.bill_discount)}`} />}
        {discounts > 0 && Number(r.bill_discount) === 0 && <Line label="ส่วนลดรวม" value={money(discounts)} />}
        {full && (
          <>
            <Line label="มูลค่าสินค้า (ไม่รวม VAT)" value={money(sign * (Number(r.total) - Number(r.vat_amount)))} />
            <Line label={`ภาษีมูลค่าเพิ่ม ${s.vat_rate}%`} value={abs(r.vat_amount)} />
          </>
        )}
        <div className="flex justify-between text-[14px] font-bold">
          <span>{r.kind === "refund" ? "ยอดคืนเงิน" : "ยอดสุทธิ"}</span>
          <span className="tabular-nums">{abs(r.total)}</span>
        </div>
        {s.vat_registered && !full && (
          <div className="text-[11px]">ราคารวมภาษีมูลค่าเพิ่มแล้ว (VAT {money(sign * Number(r.vat_amount))})</div>
        )}
        <Line label={paymentLabel(r.payment_method)} value={r.cash_received !== null ? money(r.cash_received) : abs(r.total)} />
        {r.change_amount !== null && <Line label="เงินทอน" value={money(r.change_amount)} />}
      </div>

      {s.receipt_footer && <div className="mt-2 text-center whitespace-pre-line">{s.receipt_footer}</div>}
      <div className="mt-2 flex justify-center">
        <Barcode value={r.receipt_no} height={28} width={1.2} fontSize={10} />
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
