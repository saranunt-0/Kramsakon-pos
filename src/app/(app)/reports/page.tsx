"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { useSettings } from "@/components/auth";
import { DailyBars, RankBars } from "@/components/charts";
import { ErrorBox, Field, PageHeader, PageLoading, errorText } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { addDays, bangkokDayStart, bangkokToday, int, money, thaiDate } from "@/lib/format";
import { paymentLabel } from "@/lib/labels";
import { fetchAll, rpc, supabase } from "@/lib/supabase";
import type { ReportItem, ReportSummary, Sale } from "@/lib/types";

function presets(): { label: string; from: string; to: string }[] {
  const today = bangkokToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;
  return [
    { label: "วันนี้", from: today, to: today },
    { label: "เมื่อวาน", from: addDays(today, -1), to: addDays(today, -1) },
    { label: "7 วัน", from: addDays(today, -6), to: today },
    { label: "เดือนนี้", from: monthStart, to: today },
    { label: "เดือนที่แล้ว", from: lastMonthStart, to: lastMonthEnd },
  ];
}

export default function ReportsPage() {
  return (
    <AdminOnly>
      <Reports />
    </AdminOnly>
  );
}

function Reports() {
  const settings = useSettings();
  const [from, setFrom] = useState(`${bangkokToday().slice(0, 7)}-01`);
  const [to, setTo] = useState(bangkokToday());
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, i] = await Promise.all([
        rpc<ReportSummary>("report_summary", { p_from: from, p_to: to }),
        rpc<ReportItem[]>("report_items", { p_from: from, p_to: to }),
      ]);
      setSummary(s);
      setItems(i);
    } catch (e) {
      setError(errorText(e));
    }
  }, [from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function exportSalesVat() {
    try {
      const rows = await fetchAll<Sale>((a, b) =>
        supabase()
          .from("sales")
          .select("*")
          .gte("created_at", bangkokDayStart(from))
          .lt("created_at", bangkokDayStart(addDays(to, 1)))
          .order("created_at")
          .range(a, b),
      );
      downloadCsv(
        `output-vat_${from}_${to}.csv`,
        ["ลำดับ", "วันที่", "เลขที่เอกสาร", "ประเภท", "ชื่อลูกค้า", "เลขประจำตัวผู้เสียภาษีลูกค้า", "มูลค่าสินค้า", "ภาษีมูลค่าเพิ่ม", "รวม", "สถานะ"],
        rows.map((r, i) => {
          const voided = r.status === "voided";
          return [
            i + 1,
            thaiDate(r.created_at),
            r.receipt_no,
            r.kind === "refund" ? "ใบลดหนี้/คืนสินค้า" : r.customer_tax_id ? "ใบกำกับภาษีเต็มรูป" : "ใบกำกับภาษีอย่างย่อ",
            r.customer_name || "ลูกค้าทั่วไป",
            r.customer_tax_id,
            voided ? "0.00" : (Number(r.total) - Number(r.vat_amount)).toFixed(2),
            voided ? "0.00" : Number(r.vat_amount).toFixed(2),
            voided ? "0.00" : Number(r.total).toFixed(2),
            voided ? `ยกเลิก (${r.void_reason ?? ""})` : "",
          ];
        }),
      );
    } catch (e) {
      setError(errorText(e));
    }
  }

  function exportItems() {
    downloadCsv(
      `sales-by-item_${from}_${to}.csv`,
      ["บาร์โค้ด", "สินค้า", "ไซซ์/สี", "หมวดหมู่", "จำนวนขาย", "ยอดขาย (รวม VAT)", "ต้นทุน", "กำไรขั้นต้น", "คงเหลือ"],
      items.map((i) => [i.sku, i.product_name, i.variant_label, i.category ?? "", i.qty, i.net_sales, i.cogs, i.gross_profit, i.stock_qty]),
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="รายงาน">
        {settings.vat_registered && (
          <button className="btn btn-secondary" onClick={exportSalesVat}>
            <Download size={18} /> รายงานภาษีขาย (CSV)
          </button>
        )}
        <button className="btn btn-secondary" onClick={exportItems} disabled={!items.length}>
          <Download size={18} /> ยอดขายรายสินค้า (CSV)
        </button>
      </PageHeader>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="ตั้งแต่">
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="ถึง">
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {presets().map((p) => (
            <button
              key={p.label}
              className={`btn btn-sm ${p.from === from && p.to === to ? "btn-primary" : "btn-secondary"}`}
              onClick={() => {
                setFrom(p.from);
                setTo(p.to);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <ErrorBox error={error} />
      {!summary ? (
        <PageLoading />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="card p-4">
              <h2 className="mb-3 font-semibold">สรุปกำไรขาดทุน</h2>
              <table className="w-full text-sm">
                <tbody className="[&_td]:py-1">
                  <PL label="ยอดขาย (ก่อนส่วนลด)" value={summary.gross_sales} />
                  <PL label="หัก ส่วนลด" value={-summary.discounts} />
                  <PL label="หัก รับคืนสินค้า" value={-summary.refunds} />
                  <PL label="ยอดขายสุทธิ (รวม VAT)" value={summary.net_sales} strong />
                  {settings.vat_registered && <PL label="หัก ภาษีขาย (VAT)" value={-summary.vat} />}
                  <PL label="รายได้สุทธิ" value={summary.net_sales_ex_vat} />
                  <PL label="หัก ต้นทุนสินค้าที่ขาย" value={-summary.cogs} />
                  <PL label="กำไรขั้นต้น" value={summary.gross_profit} strong />
                  <PL label="หัก ค่าใช้จ่าย" value={-summary.expenses} />
                  <PL label="กำไรสุทธิ (โดยประมาณ)" value={summary.net_profit} strong />
                </tbody>
              </table>
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <div>
                  {int(summary.receipts)} บิลขาย · {int(summary.refund_receipts)} บิลคืน · {int(summary.items_sold)} ชิ้น
                </div>
                <div>ซื้อสินค้าเข้าสต็อก ฿{money(summary.inventory_purchases)} (ไม่นับเป็นค่าใช้จ่ายในกำไร)</div>
                {settings.vat_registered && (
                  <div>
                    ภาษีขาย ฿{money(summary.vat)} − ภาษีซื้อ ฿{money(summary.input_vat)} = ภาษีที่ต้องชำระโดยประมาณ ฿
                    {money(Number(summary.vat) - Number(summary.input_vat))}
                  </div>
                )}
              </div>
            </section>

            <section className="card space-y-4 p-4">
              <div>
                <h2 className="mb-2 font-semibold">ยอดขายรายวัน</h2>
                <DailyBars data={summary.daily} from={from} to={to} />
              </div>
              <div>
                <h2 className="mb-2 font-semibold">ช่องทางชำระเงิน</h2>
                <RankBars rows={summary.by_payment.map((p) => ({ label: paymentLabel(p.method), value: p.total, sub: `${p.count} บิล` }))} />
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-4">
              <h2 className="mb-2 font-semibold">ตามหมวดหมู่</h2>
              <RankBars rows={summary.by_category.map((c) => ({ label: c.category, value: c.net_sales, sub: `${c.qty} ชิ้น` }))} />
            </section>
            <section className="card p-4">
              <h2 className="mb-2 font-semibold">ตามพนักงาน</h2>
              <RankBars
                rows={summary.by_cashier.map((c) => ({
                  label: c.cashier,
                  value: c.net_sales,
                  sub: `${c.receipts} บิล${Number(c.refunds) ? ` · คืน ฿${money(c.refunds)}` : ""}`,
                }))}
              />
            </section>
          </div>

          <section className="card overflow-x-auto">
            <h2 className="px-4 pt-4 font-semibold">ยอดขายรายสินค้า</h2>
            <table className="table mt-2">
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th>หมวดหมู่</th>
                  <th className="num">ชิ้น</th>
                  <th className="num">ยอดขาย</th>
                  <th className="num">ต้นทุน</th>
                  <th className="num">กำไรขั้นต้น</th>
                  <th className="num">คงเหลือ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={`${i.variant_id}`}>
                    <td>
                      {i.product_name} {i.variant_label && <span className="text-slate-500">({i.variant_label})</span>}
                      <div className="font-mono text-xs text-slate-400">{i.sku}</div>
                    </td>
                    <td>{i.category ?? "-"}</td>
                    <td className="num">{int(i.qty)}</td>
                    <td className="num">{money(i.net_sales)}</td>
                    <td className="num">{money(i.cogs)}</td>
                    <td className="num">{money(i.gross_profit)}</td>
                    <td className="num">{i.stock_qty ?? "-"}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-slate-500">
                      ไม่มียอดขายในช่วงนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function PL({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <tr className={strong ? "font-semibold" : ""}>
      <td>{label}</td>
      <td className={`text-right tabular-nums ${Number(value) < 0 ? "text-slate-600" : ""}`}>{money(value)}</td>
    </tr>
  );
}
