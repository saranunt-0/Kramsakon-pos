"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminOnly } from "@/components/app-shell";
import { DailyBars } from "@/components/charts";
import { ErrorBox, PageHeader, PageLoading, Stat, errorText } from "@/components/ui";
import { addDays, baht, bangkokToday, int, money } from "@/lib/format";
import { paymentLabel } from "@/lib/labels";
import { rpc } from "@/lib/supabase";
import type { ReportItem, ReportSummary, ShiftSummary } from "@/lib/types";

interface Dashboard {
  today: ReportSummary;
  month: ReportSummary;
  last30: ReportSummary["daily"];
  shift: ShiftSummary | null;
  top_items: ReportItem[];
  low_stock: { variant_id: number; sku: string; product_name: string; variant_label: string; stock_qty: number; low_stock_at: number }[];
  inventory: { units: number; cost_value: number; retail_value: number; variants_without_cost: number };
}

export default function DashboardPage() {
  return (
    <AdminOnly>
      <DashboardContent />
    </AdminOnly>
  );
}

function DashboardContent() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rpc<Dashboard>("dashboard")
      .then(setData)
      .catch((e) => setError(errorText(e)));
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <PageLoading />;

  const today = bangkokToday();
  const { today: t, month: m, shift, inventory } = data;

  return (
    <div className="space-y-6">
      <PageHeader title="ภาพรวม" />

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-500">วันนี้</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="ยอดขายสุทธิ" value={baht(t.net_sales)} sub={`${t.receipts} บิล`} />
          <Stat label="จำนวนชิ้นที่ขาย" value={int(t.items_sold)} sub={t.receipts ? `เฉลี่ย ฿${money(Number(t.net_sales) / t.receipts)}/บิล` : undefined} />
          <Stat label="กำไรขั้นต้น" value={baht(t.gross_profit)} sub="ยอดขายไม่รวม VAT − ต้นทุนสินค้า" />
          <Stat
            label="เงินสดที่ควรมีในลิ้นชัก"
            value={shift ? baht(shift.expected_cash) : "—"}
            sub={shift ? `กะเปิดโดย ${shift.opened_by}` : "ยังไม่ได้เปิดกะ"}
          />
        </div>
        {t.by_payment.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            {t.by_payment.map((p) => (
              <span key={p.method}>
                {paymentLabel(p.method)}: <span className="font-medium tabular-nums">฿{money(p.total)}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-500">เดือนนี้</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="ยอดขายสุทธิ" value={baht(m.net_sales)} sub={`VAT ขาย ฿${money(m.vat)}`} />
          <Stat label="กำไรขั้นต้น" value={baht(m.gross_profit)} sub={`ต้นทุนสินค้า ฿${money(m.cogs)}`} />
          <Stat label="ค่าใช้จ่าย" value={baht(m.expenses)} sub="ไม่รวมค่าซื้อสินค้าเข้าสต็อก" />
          <Stat label="กำไรสุทธิ (โดยประมาณ)" value={baht(m.net_profit)} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">ยอดขาย 30 วันล่าสุด</h2>
          <DailyBars data={data.last30} from={addDays(today, -29)} to={today} />
        </section>

        <section className="card p-4">
          <h2 className="mb-2 font-semibold">สต็อกสินค้า</h2>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-slate-500">จำนวนชิ้น</div>
              <div className="text-lg font-semibold tabular-nums">{int(inventory.units)}</div>
            </div>
            <div>
              <div className="text-slate-500">มูลค่าทุน</div>
              <div className="text-lg font-semibold tabular-nums">฿{money(inventory.cost_value)}</div>
            </div>
            <div>
              <div className="text-slate-500">มูลค่าขาย</div>
              <div className="text-lg font-semibold tabular-nums">฿{money(inventory.retail_value)}</div>
            </div>
          </div>
          {inventory.variants_without_cost > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              มีสินค้า {inventory.variants_without_cost} รายการที่ยังไม่ได้ใส่ต้นทุน — กำไรที่แสดงจะสูงกว่าความจริง
            </p>
          )}
          <h3 className="mt-4 mb-1 text-sm font-medium">สินค้าใกล้หมด / หมดแล้ว</h3>
          {data.low_stock.length === 0 ? (
            <p className="text-sm text-slate-500">ไม่มี</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {data.low_stock.map((v) => (
                <li key={v.variant_id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {v.product_name} {v.variant_label && <span className="text-slate-500">({v.variant_label})</span>}
                  </span>
                  <span className={`shrink-0 tabular-nums ${v.stock_qty <= 0 ? "text-red-600" : "text-amber-700"}`}>{v.stock_qty}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-semibold">สินค้าขายดี 30 วัน</h2>
          <Link href="/reports" className="text-sm text-kram-700 underline">
            ดูรายงานทั้งหมด
          </Link>
        </div>
        <table className="table mt-2">
          <thead>
            <tr>
              <th>สินค้า</th>
              <th className="num">ชิ้น</th>
              <th className="num">ยอดขาย</th>
              <th className="num">กำไรขั้นต้น</th>
              <th className="num">คงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            {data.top_items.map((i) => (
              <tr key={`${i.variant_id}`}>
                <td>
                  {i.product_name} {i.variant_label && <span className="text-slate-500">({i.variant_label})</span>}
                </td>
                <td className="num">{int(i.qty)}</td>
                <td className="num">{money(i.net_sales)}</td>
                <td className="num">{money(i.gross_profit)}</td>
                <td className="num">{i.stock_qty ?? "-"}</td>
              </tr>
            ))}
            {data.top_items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-slate-500">
                  ยังไม่มียอดขาย
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
