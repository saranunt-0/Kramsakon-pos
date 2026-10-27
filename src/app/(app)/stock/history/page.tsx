"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { EmptyState, ErrorBox, Field, PageHeader, PageLoading, errorText } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { addDays, bangkokDayStart, bangkokToday, money, thaiDateTime } from "@/lib/format";
import { MOVEMENT_REASONS, variantLabel } from "@/lib/labels";
import { fetchAll, supabase } from "@/lib/supabase";

interface Movement {
  id: number;
  qty_change: number;
  reason: string;
  unit_cost: number | null;
  note: string;
  created_at: string;
  sale: { receipt_no: string } | null;
  by: { display_name: string } | null;
  variant: { sku: string; size: string; color: string; product: { name: string } };
}

const SELECT =
  "id, qty_change, reason, unit_cost, note, created_at, sale:sales(receipt_no), by:profiles(display_name), variant:variants(sku, size, color, product:products(name))";

export default function StockHistoryPage() {
  const [from, setFrom] = useState(addDays(bangkokToday(), -6));
  const [to, setTo] = useState(bangkokToday());
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<Movement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(
    (rangeFrom: number, rangeTo: number) => {
      let q = supabase()
        .from("stock_movements")
        .select(SELECT)
        .gte("created_at", bangkokDayStart(from))
        .lt("created_at", bangkokDayStart(addDays(to, 1)))
        .order("created_at", { ascending: false })
        .range(rangeFrom, rangeTo);
      if (reason) q = q.eq("reason", reason);
      return q;
    },
    [from, to, reason],
  );

  useEffect(() => {
    query(0, 499).then(({ data, error }) => {
      if (error) setError(error.message);
      setRows((data ?? []) as unknown as Movement[]);
    });
  }, [query]);

  async function exportCsv() {
    try {
      const all = (await fetchAll((a, b) => query(a, b))) as unknown as Movement[];
      downloadCsv(
        `stock-movements_${from}_${to}.csv`,
        ["วันที่เวลา", "บาร์โค้ด", "สินค้า", "ไซซ์/สี", "ประเภท", "จำนวน", "ต้นทุน/ชิ้น", "เลขที่เอกสาร", "หมายเหตุ", "ผู้บันทึก"],
        all.map((m) => [
          thaiDateTime(m.created_at),
          m.variant.sku,
          m.variant.product.name,
          variantLabel(m.variant),
          MOVEMENT_REASONS[m.reason] ?? m.reason,
          m.qty_change,
          m.unit_cost,
          m.sale?.receipt_no ?? "",
          m.note,
          m.by?.display_name ?? "",
        ]),
      );
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <AdminOnly>
      <div className="space-y-4">
        <PageHeader title="ประวัติสต็อก (รายงานสินค้าเข้า-ออก)">
          <button className="btn btn-secondary" onClick={exportCsv}>
            <Download size={18} /> ดาวน์โหลด CSV
          </button>
        </PageHeader>
        <div className="card grid gap-3 p-4 sm:grid-cols-3">
          <Field label="ตั้งแต่วันที่">
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="ถึงวันที่">
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="ประเภท">
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {Object.entries(MOVEMENT_REASONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ErrorBox error={error} />
        {!rows ? (
          <PageLoading />
        ) : rows.length === 0 ? (
          <EmptyState>ไม่มีรายการ</EmptyState>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>สินค้า</th>
                  <th>ประเภท</th>
                  <th className="num">จำนวน</th>
                  <th className="num">ต้นทุน</th>
                  <th>อ้างอิง / หมายเหตุ</th>
                  <th>ผู้บันทึก</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{thaiDateTime(m.created_at)}</td>
                    <td>
                      <div>{m.variant.product.name}</div>
                      <div className="text-xs text-slate-500">{[variantLabel(m.variant), m.variant.sku].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>{MOVEMENT_REASONS[m.reason] ?? m.reason}</td>
                    <td className={`num font-medium ${m.qty_change < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change}
                    </td>
                    <td className="num">{m.unit_cost !== null ? money(m.unit_cost) : "-"}</td>
                    <td className="text-xs">{[m.sale?.receipt_no, m.note].filter(Boolean).join(" · ")}</td>
                    <td>{m.by?.display_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 500 && <p className="p-3 text-xs text-slate-500">แสดง 500 รายการล่าสุด — ดาวน์โหลด CSV เพื่อดูทั้งหมด</p>}
          </div>
        )}
      </div>
    </AdminOnly>
  );
}
