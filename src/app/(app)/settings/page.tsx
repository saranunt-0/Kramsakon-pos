"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { useAuth, useSettings } from "@/components/auth";
import { useCatalog } from "@/components/catalog";
import { ErrorBox, Field, PageHeader, Spinner, errorText, toast } from "@/components/ui";
import { isValidPromptPayId } from "@/lib/promptpay";
import { supabase } from "@/lib/supabase";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  return (
    <AdminOnly>
      <div className="max-w-3xl space-y-6">
        <PageHeader title="ตั้งค่าร้าน" />
        <ShopSettings />
        <Categories />
      </div>
    </AdminOnly>
  );
}

function ShopSettings() {
  const current = useSettings();
  const { refreshSettings } = useAuth();
  const [form, setForm] = useState<Settings>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = (k: keyof Settings) => ({
    value: String(form[k] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value }),
  });
  const check = (k: keyof Settings) => ({
    checked: Boolean(form[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.checked }),
  });

  async function save() {
    setBusy(true);
    setError(null);
    const row = {
      ...form,
      sku_prefix: form.sku_prefix.trim().toUpperCase(),
      vat_rate: Number(form.vat_rate),
      receipt_width_mm: Number(form.receipt_width_mm),
      label_width_mm: Number(form.label_width_mm),
      label_height_mm: Number(form.label_height_mm),
      label_columns: Number(form.label_columns),
      label_gap_mm: Number(form.label_gap_mm),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase().from("settings").update(row).eq("id", true);
    setBusy(false);
    if (error) return setError(errorText(error));
    await refreshSettings();
    toast("บันทึกการตั้งค่าแล้ว");
  }

  return (
    <div className="space-y-6">
      <section className="card grid gap-4 p-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">ข้อมูลร้าน (แสดงบนใบเสร็จ)</h2>
        <Field label="ชื่อร้าน / ชื่อผู้ประกอบการ">
          <input className="input" {...text("shop_name")} />
        </Field>
        <Field label="สาขา">
          <input className="input" {...text("branch_name")} />
        </Field>
        <Field label="ที่อยู่">
          <textarea className="input" rows={2} {...text("address")} />
        </Field>
        <Field label="โทรศัพท์">
          <input className="input" {...text("phone")} />
        </Field>
        <Field label="ข้อความท้ายใบเสร็จ">
          <textarea className="input" rows={2} {...text("receipt_footer")} />
        </Field>
        <Field label="ความกว้างกระดาษใบเสร็จ (มม.)" hint="เครื่องพิมพ์ใบเสร็จ 80 มม. หรือ 58 มม.">
          <select className="input" {...text("receipt_width_mm")}>
            <option value="80">80 มม.</option>
            <option value="58">58 มม.</option>
          </select>
        </Field>
      </section>

      <section className="card grid gap-4 p-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">ภาษีมูลค่าเพิ่ม (VAT)</h2>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" {...check("vat_registered")} /> ร้านจดทะเบียนภาษีมูลค่าเพิ่ม (ราคาขายรวม VAT แล้ว)
        </label>
        <Field label="เลขประจำตัวผู้เสียภาษี 13 หลัก">
          <input className="input" inputMode="numeric" {...text("tax_id")} />
        </Field>
        <Field label="อัตรา VAT (%)">
          <input className="input" inputMode="decimal" {...text("vat_rate")} />
        </Field>
        <Field label="หมายเลขเครื่อง POS ที่ได้รับอนุมัติ (ถ้ามี)" hint="ได้จากการยื่นแบบ ภ.พ.06 กับกรมสรรพากร">
          <input className="input" {...text("pos_reg_no")} />
        </Field>
      </section>

      <section className="card grid gap-4 p-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">การชำระเงินและการขาย</h2>
        <Field
          label="พร้อมเพย์ (เบอร์มือถือ หรือ เลขประจำตัวผู้เสียภาษี)"
          hint={form.promptpay_id && !isValidPromptPayId(form.promptpay_id) ? "รูปแบบไม่ถูกต้อง (10, 13 หรือ 15 หลัก)" : "ใช้สร้าง QR ให้ลูกค้าสแกนจ่าย"}
        >
          <input className="input" inputMode="numeric" {...text("promptpay_id")} />
        </Field>
        <Field label="ตัวอักษรนำหน้าบาร์โค้ดที่สร้างอัตโนมัติ" hint="A-Z/0-9 ไม่เกิน 6 ตัว เช่น KS → KS000123">
          <input className="input uppercase" maxLength={6} {...text("sku_prefix")} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" {...check("staff_can_refund")} /> อนุญาตให้พนักงานทำรายการคืนสินค้าได้
        </label>
      </section>

      <section className="card grid gap-4 p-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">สติกเกอร์บาร์โค้ด</h2>
        <Field label="กว้าง (มม.)">
          <input className="input" inputMode="decimal" {...text("label_width_mm")} />
        </Field>
        <Field label="สูง (มม.)">
          <input className="input" inputMode="decimal" {...text("label_height_mm")} />
        </Field>
        <Field label="จำนวนดวงต่อแถว" hint="ม้วนสติกเกอร์แบบ 1, 2 หรือ 3 ดวงเรียงกัน">
          <input className="input" inputMode="numeric" {...text("label_columns")} />
        </Field>
        <Field label="ระยะห่างระหว่างดวง (มม.)">
          <input className="input" inputMode="decimal" {...text("label_gap_mm")} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" {...check("label_show_price")} /> แสดงราคาบนสติกเกอร์
        </label>
      </section>

      <ErrorBox error={error} />
      <button className="btn btn-primary btn-lg" disabled={busy} onClick={save}>
        {busy && <Spinner />} บันทึกการตั้งค่า
      </button>
    </div>
  );
}

function Categories() {
  const { categories, refresh } = useCatalog();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    if (error) {
      setError(error.message.includes("duplicate") ? "มีหมวดหมู่ชื่อนี้แล้ว" : errorText(error));
      return false;
    }
    setError(null);
    await refresh();
    return true;
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">หมวดหมู่สินค้า</h2>
      <div className="divide-y divide-slate-100">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2 py-2">
            <input
              className="input"
              defaultValue={c.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.name) run(supabase().from("categories").update({ name: v }).eq("id", c.id));
              }}
            />
            <input
              className="input w-20"
              inputMode="numeric"
              title="ลำดับ"
              defaultValue={c.sort_order}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isInteger(v) && v !== c.sort_order) run(supabase().from("categories").update({ sort_order: v }).eq("id", c.id));
              }}
            />
            <button
              className="btn btn-ghost btn-sm text-red-600"
              onClick={() => confirm(`ลบหมวด "${c.name}"? สินค้าในหมวดนี้จะกลายเป็น "ไม่ระบุหมวดหมู่"`) && run(supabase().from("categories").delete().eq("id", c.id))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input" placeholder="ชื่อหมวดหมู่ใหม่" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn btn-secondary"
          disabled={!name.trim()}
          onClick={async () => {
            if (await run(supabase().from("categories").insert({ name: name.trim(), sort_order: categories.length + 1 }))) {
              setName("");
              toast("เพิ่มหมวดหมู่แล้ว");
            }
          }}
        >
          เพิ่ม
        </button>
      </div>
      <ErrorBox error={error} />
    </section>
  );
}
