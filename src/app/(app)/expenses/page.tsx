"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Plus } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { useSettings } from "@/components/auth";
import { EmptyState, ErrorBox, Field, Modal, PageHeader, PageLoading, Spinner, errorText, toast } from "@/components/ui";
import { vatIncluded } from "@/lib/cart";
import { downloadCsv } from "@/lib/csv";
import { bangkokToday, money, thaiDate } from "@/lib/format";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, expenseCategoryLabel, paymentLabel } from "@/lib/labels";
import { supabase } from "@/lib/supabase";
import type { Expense } from "@/lib/types";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export default function ExpensesPage() {
  const [month, setMonth] = useState(bangkokToday().slice(0, 7));
  const [rows, setRows] = useState<Expense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Expense> | null>(null);

  const load = useCallback(async () => {
    const { from, to } = monthRange(month);
    const { data, error } = await supabase()
      .from("expenses")
      .select("*")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date", { ascending: false })
      .order("id", { ascending: false });
    if (error) setError(error.message);
    setRows((data ?? []) as Expense[]);
  }, [month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const total = (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const vat = (rows ?? []).reduce((s, r) => s + Number(r.vat_amount), 0);

  function exportInputVat() {
    const withVat = (rows ?? []).filter((r) => Number(r.vat_amount) > 0).sort((a, b) => a.expense_date.localeCompare(b.expense_date));
    downloadCsv(
      `input-vat_${month}.csv`,
      ["ลำดับ", "วันที่", "เลขที่ใบกำกับภาษี", "ชื่อผู้ขาย", "เลขประจำตัวผู้เสียภาษีผู้ขาย", "มูลค่าสินค้า/บริการ", "ภาษีมูลค่าเพิ่ม", "รวม"],
      withVat.map((r, i) => [
        i + 1,
        thaiDate(r.expense_date),
        r.tax_invoice_no,
        r.vendor,
        r.vendor_tax_id,
        (Number(r.amount) - Number(r.vat_amount)).toFixed(2),
        Number(r.vat_amount).toFixed(2),
        Number(r.amount).toFixed(2),
      ]),
    );
  }

  return (
    <AdminOnly>
      <div className="space-y-4">
        <PageHeader title="ค่าใช้จ่าย">
          <button className="btn btn-secondary" onClick={exportInputVat} disabled={!rows?.length}>
            <Download size={18} /> รายงานภาษีซื้อ (CSV)
          </button>
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus size={18} /> บันทึกค่าใช้จ่าย
          </button>
        </PageHeader>
        <div className="card flex flex-wrap items-end gap-4 p-4">
          <Field label="เดือน">
            <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <div className="text-sm">
            รวม <span className="font-semibold">฿{money(total)}</span> · ภาษีซื้อ <span className="font-semibold">฿{money(vat)}</span>
          </div>
        </div>
        <ErrorBox error={error} />
        {!rows ? (
          <PageLoading />
        ) : rows.length === 0 ? (
          <EmptyState>ยังไม่มีค่าใช้จ่ายในเดือนนี้</EmptyState>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>หมวด</th>
                  <th>รายละเอียด</th>
                  <th>ผู้ขาย / ใบกำกับ</th>
                  <th>จ่ายโดย</th>
                  <th className="num">VAT</th>
                  <th className="num">ยอดจ่าย</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setEditing(r)}>
                    <td className="whitespace-nowrap">{thaiDate(r.expense_date)}</td>
                    <td>{expenseCategoryLabel(r.category)}</td>
                    <td>{r.description}</td>
                    <td className="text-xs">{[r.vendor, r.tax_invoice_no].filter(Boolean).join(" · ")}</td>
                    <td>{paymentLabel(r.payment_method)}</td>
                    <td className="num">{Number(r.vat_amount) ? money(r.vat_amount) : "-"}</td>
                    <td className="num font-medium">{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {editing && (
          <ExpenseModal
            expense={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </div>
    </AdminOnly>
  );
}

function ExpenseModal({ expense, onClose, onSaved }: { expense: Partial<Expense>; onClose: () => void; onSaved: () => void }) {
  const settings = useSettings();
  const [form, setForm] = useState({
    expense_date: expense.expense_date ?? bangkokToday(),
    category: expense.category ?? "other",
    description: expense.description ?? "",
    vendor: expense.vendor ?? "",
    vendor_tax_id: expense.vendor_tax_id ?? "",
    tax_invoice_no: expense.tax_invoice_no ?? "",
    amount: expense.amount !== undefined ? String(expense.amount) : "",
    vat_amount: expense.vat_amount ? String(expense.vat_amount) : "",
    payment_method: expense.payment_method ?? "cash",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true);
    setError(null);
    const row = { ...form, amount: Number(form.amount), vat_amount: Number(form.vat_amount || 0) };
    const { error } = expense.id
      ? await supabase().from("expenses").update(row).eq("id", expense.id)
      : await supabase().from("expenses").insert(row);
    setBusy(false);
    if (error) return setError(errorText(error));
    toast("บันทึกแล้ว");
    onSaved();
  }

  async function remove() {
    if (!expense.id || !confirm("ลบรายการนี้?")) return;
    const { error } = await supabase().from("expenses").delete().eq("id", expense.id);
    if (error) return setError(errorText(error));
    toast("ลบแล้ว");
    onSaved();
  }

  return (
    <Modal title={expense.id ? "แก้ไขค่าใช้จ่าย" : "บันทึกค่าใช้จ่าย"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="วันที่">
            <input type="date" className="input" value={form.expense_date} onChange={set("expense_date")} />
          </Field>
          <Field label="จ่ายโดย">
            <select className="input" value={form.payment_method} onChange={set("payment_method")}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="หมวด">
          <select className="input" value={form.category} onChange={set("category")}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        {form.category === "inventory" && (
          <p className="rounded-lg bg-kram-50 p-2 text-xs text-kram-800">
            ค่าซื้อสินค้าจะไม่หักเป็นค่าใช้จ่ายในกำไรทันที — ต้นทุนจะถูกนับเมื่อสินค้าขายออก (อย่าลืมรับสินค้าเข้าสต็อกพร้อมใส่ต้นทุน)
          </p>
        )}
        <Field label="รายละเอียด">
          <input className="input" value={form.description} onChange={set("description")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ยอดที่จ่าย (รวม VAT)">
            <input className="input" inputMode="decimal" value={form.amount} onChange={set("amount")} />
          </Field>
          <Field
            label="VAT ในบิล"
            hint={
              <button
                type="button"
                className="text-kram-700 underline"
                onClick={() => setForm({ ...form, vat_amount: String(vatIncluded(Number(form.amount) || 0, Number(settings.vat_rate) || 7)) })}
              >
                คำนวณ {settings.vat_rate}% จากยอด
              </button>
            }
          >
            <input className="input" inputMode="decimal" placeholder="0" value={form.vat_amount} onChange={set("vat_amount")} />
          </Field>
        </div>
        <details className="rounded-lg border border-slate-200 p-3 text-sm" open={Boolean(form.vendor || form.tax_invoice_no)}>
          <summary className="cursor-pointer font-medium">ข้อมูลใบกำกับภาษี (สำหรับขอคืนภาษีซื้อ)</summary>
          <div className="mt-3 space-y-3">
            <Field label="ชื่อผู้ขาย">
              <input className="input" value={form.vendor} onChange={set("vendor")} />
            </Field>
            <Field label="เลขประจำตัวผู้เสียภาษีผู้ขาย">
              <input className="input" inputMode="numeric" value={form.vendor_tax_id} onChange={set("vendor_tax_id")} />
            </Field>
            <Field label="เลขที่ใบกำกับภาษี">
              <input className="input" value={form.tax_invoice_no} onChange={set("tax_invoice_no")} />
            </Field>
          </div>
        </details>
        <ErrorBox error={error} />
        <div className="flex gap-2">
          {expense.id && (
            <button className="btn btn-danger" onClick={remove}>
              ลบ
            </button>
          )}
          <button className="btn btn-primary flex-1" disabled={busy || !(Number(form.amount) > 0)} onClick={save}>
            {busy && <Spinner />} บันทึก
          </button>
        </div>
      </div>
    </Modal>
  );
}
