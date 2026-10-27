"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Printer, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth";
import { useCatalog } from "@/components/catalog";
import { ErrorBox, Field, PageHeader, PageLoading, Spinner, errorText, toast } from "@/components/ui";
import { int } from "@/lib/format";
import { encodeLabelJob, openLabelPrint, parseLabelJob } from "@/lib/label-job";
import { normalizeScan } from "@/lib/scan";
import { rpc, supabase } from "@/lib/supabase";
import type { Product, Variant } from "@/lib/types";

interface VariantForm {
  key: string;
  id?: number;
  sku: string;
  size: string;
  color: string;
  price: string;
  cost: string;
  low_stock_at: string;
  initial_qty: string;
  stock_qty?: number;
  active: boolean;
}

let keySeq = 0;
const blankVariant = (price = ""): VariantForm => ({
  key: `n${keySeq++}`,
  sku: "",
  size: "",
  color: "",
  price,
  cost: "",
  low_stock_at: "",
  initial_qty: "",
  active: true,
});

function ProductEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const search = useSearchParams();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { categories, refresh: refreshCatalog } = useCatalog();

  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [isUnique, setIsUnique] = useState(isNew && search.get("unique") === "1");
  const [active, setActive] = useState(true);
  const [variants, setVariants] = useState<VariantForm[]>([
    { ...blankVariant(), initial_qty: isNew && search.get("unique") === "1" ? "1" : "" },
  ]);
  const [sizes, setSizes] = useState("");
  const [colors, setColors] = useState("");

  const readOnly = !isNew && !isAdmin;
  const printJob = isNew ? [] : parseLabelJob(search.get("print"));

  const load = useCallback(async () => {
    const { data, error } = await supabase()
      .from("products")
      .select("*, variants(*, variant_costs(cost))")
      .eq("id", Number(id))
      .single();
    if (error || !data) {
      setError(error?.message ?? "ไม่พบสินค้า");
      setLoading(false);
      return;
    }
    const p = data as Product & { variants: (Variant & { variant_costs: { cost: number } | null })[] };
    setName(p.name);
    setCategoryId(p.category_id ? String(p.category_id) : "");
    setDescription(p.description);
    setIsUnique(p.is_unique);
    setActive(p.active);
    setVariants(
      p.variants
        .sort((a, b) => a.id - b.id)
        .map((v) => ({
          key: `v${v.id}`,
          id: v.id,
          sku: v.sku,
          size: v.size,
          color: v.color,
          price: String(v.price),
          cost: v.variant_costs ? String(v.variant_costs.cost) : "",
          low_stock_at: v.low_stock_at ? String(v.low_stock_at) : "",
          initial_qty: "",
          stock_qty: v.stock_qty,
          active: v.active,
        })),
    );
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isNew) load();
  }, [isNew, load]);

  function update(key: string, patch: Partial<VariantForm>) {
    setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  function generate() {
    const sizeList = sizes.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    const colorList = colors.split(",").map((s) => s.trim()).filter(Boolean);
    const price = variants[0]?.price ?? "";
    const cost = variants[0]?.cost ?? "";
    const combos: VariantForm[] = [];
    for (const size of sizeList.length ? sizeList : [""]) {
      for (const color of colorList.length ? colorList : [""]) {
        combos.push({ ...blankVariant(price), size, color, cost });
      }
    }
    // Replace untouched blank rows, keep rows that already exist in the database.
    setVariants((vs) => [...vs.filter((v) => v.id || v.size || v.color || v.sku), ...combos]);
    setSizes("");
    setColors("");
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await rpc<{ id: number; variants: { id: number; sku: string }[] }>("save_product", {
        p_product: {
          id: isNew ? null : Number(id),
          name,
          category_id: categoryId || null,
          description,
          is_unique: isUnique,
          active,
        },
        p_variants: variants.map((v) => ({
          id: v.id ?? null,
          sku: v.sku,
          size: v.size,
          color: v.color,
          price: v.price,
          cost: isAdmin ? v.cost : "",
          low_stock_at: v.low_stock_at,
          initial_qty: v.id ? "" : v.initial_qty,
          active: v.active,
        })),
      });
      toast("บันทึกสินค้าแล้ว");
      await refreshCatalog();
      if (isNew) {
        // New variants come back in the order they were sent.
        const job = variants
          .map((v, i) => ({ id: result.variants[i]?.id, copies: Number(v.initial_qty) || 0 }))
          .filter((j) => j.id && j.copies > 0);
        router.replace(`/products/${result.id}${job.length ? `?print=${encodeLabelJob(job)}` : ""}`);
      } else {
        await load();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("ลบสินค้านี้? (ถ้ามีประวัติขายแล้ว ระบบจะปิดการขายแทนการลบ)")) return;
    try {
      const res = await rpc<string>("delete_product", { p_product_id: Number(id) });
      toast(res === "deleted" ? "ลบสินค้าแล้ว" : "สินค้ามีประวัติแล้ว จึงปิดการขายแทน");
      await refreshCatalog();
      router.replace("/products");
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (loading) return <PageLoading />;

  return (
    <div className="max-w-5xl space-y-4">
      <Link href="/products" className="inline-flex items-center gap-1 text-sm text-kram-700">
        <ArrowLeft size={16} /> รายการสินค้า
      </Link>
      <PageHeader title={isNew ? (isUnique ? "เพิ่มสินค้าชิ้นเดียว" : "เพิ่มสินค้า") : name || "สินค้า"}>
        {!isNew && (
          <button
            className="btn btn-secondary"
            onClick={() => openLabelPrint(variants.filter((v) => v.id && v.active).map((v) => ({ id: v.id!, copies: 1 })))}
          >
            <Printer size={18} /> พิมพ์บาร์โค้ด
          </button>
        )}
        {!isNew && isAdmin && (
          <button className="btn btn-secondary text-red-600" onClick={remove}>
            <Trash2 size={18} /> ลบ
          </button>
        )}
      </PageHeader>

      {printJob.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <span>บันทึกแล้ว — พิมพ์บาร์โค้ดติดสินค้า {printJob.reduce((s, j) => s + j.copies, 0)} ดวง</span>
          <button className="btn btn-primary btn-sm" onClick={() => openLabelPrint(printJob)}>
            <Printer size={16} /> พิมพ์บาร์โค้ด
          </button>
        </div>
      )}

      {readOnly && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขสินค้าได้</div>
      )}

      <fieldset disabled={readOnly} className="space-y-4">
        <div className="card grid gap-4 p-4 sm:grid-cols-2">
          <Field label="ชื่อสินค้า">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} />
          </Field>
          <Field label="หมวดหมู่">
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="รายละเอียด (ไม่บังคับ)">
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="เช่น ผ้าฝ้ายย้อมคราม ลายมัดหมี่" />
          </Field>
          <div className="space-y-2 pt-6 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isUnique}
                onChange={(e) => {
                  setIsUnique(e.target.checked);
                  if (e.target.checked) setVariants((vs) => vs.slice(0, 1).map((v) => ({ ...v, initial_qty: v.id ? "" : "1" })));
                }}
              />
              สินค้าชิ้นเดียว (มีชิ้นเดียวในโลก — 1 บาร์โค้ด = 1 ชิ้น)
            </label>
            {!isNew && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                เปิดขาย
              </label>
            )}
          </div>
        </div>

        <div className="card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{isUnique ? "ราคาและบาร์โค้ด" : "ไซซ์ / สี / ราคา"}</h2>
            {!isUnique && (
              <button className="btn btn-secondary btn-sm" onClick={() => setVariants((vs) => [...vs, blankVariant(vs[0]?.price ?? "")])}>
                <Plus size={14} /> เพิ่มแถว
              </button>
            )}
          </div>

          {!isUnique && (
            <div className="mb-4 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="สร้างหลายไซซ์พร้อมกัน">
                <input className="input" placeholder="S, M, L, XL" value={sizes} onChange={(e) => setSizes(e.target.value)} />
              </Field>
              <Field label="สี (คั่นด้วย ,)">
                <input className="input" placeholder="ครามเข้ม, ครามอ่อน" value={colors} onChange={(e) => setColors(e.target.value)} />
              </Field>
              <button className="btn btn-secondary" onClick={generate} disabled={!sizes.trim() && !colors.trim()}>
                สร้างแถว
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  {!isUnique && <th>ไซซ์</th>}
                  {!isUnique && <th>สี</th>}
                  <th>ราคาขาย</th>
                  {isAdmin && <th>ต้นทุน/ชิ้น</th>}
                  <th>บาร์โค้ด</th>
                  {!isUnique && <th title="แจ้งเตือนเมื่อสต็อกเหลือน้อยกว่าหรือเท่ากับ">เตือนเมื่อเหลือ</th>}
                  <th>{isNew ? "จำนวนเริ่มต้น" : "คงเหลือ"}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.key} className={v.active ? "" : "opacity-50"}>
                    {!isUnique && (
                      <td>
                        <input className="input min-w-16" value={v.size} onChange={(e) => update(v.key, { size: e.target.value })} />
                      </td>
                    )}
                    {!isUnique && (
                      <td>
                        <input className="input min-w-24" value={v.color} onChange={(e) => update(v.key, { color: e.target.value })} />
                      </td>
                    )}
                    <td>
                      <input className="input min-w-24" inputMode="decimal" value={v.price} onChange={(e) => update(v.key, { price: e.target.value })} />
                    </td>
                    {isAdmin && (
                      <td>
                        <input className="input min-w-24" inputMode="decimal" value={v.cost} onChange={(e) => update(v.key, { cost: e.target.value })} />
                      </td>
                    )}
                    <td>
                      <input
                        className="input min-w-32 font-mono uppercase"
                        placeholder="อัตโนมัติ"
                        value={v.sku}
                        onChange={(e) => update(v.key, { sku: e.target.value })}
                        onBlur={(e) => update(v.key, { sku: normalizeScan(e.target.value) })}
                        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                      />
                    </td>
                    {!isUnique && (
                      <td>
                        <input className="input min-w-16" inputMode="numeric" value={v.low_stock_at} onChange={(e) => update(v.key, { low_stock_at: e.target.value })} />
                      </td>
                    )}
                    <td>
                      {v.id ? (
                        <span className="tabular-nums">{int(v.stock_qty)}</span>
                      ) : (
                        <input
                          className="input min-w-16"
                          inputMode="numeric"
                          value={v.initial_qty}
                          disabled={isUnique}
                          onChange={(e) => update(v.key, { initial_qty: e.target.value })}
                        />
                      )}
                    </td>
                    <td>
                      {variants.length > 1 && (
                        <button
                          className="btn btn-ghost btn-sm text-red-600"
                          onClick={() => setVariants((vs) => vs.filter((x) => x.key !== v.key))}
                          aria-label="ลบแถว"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            เว้นช่องบาร์โค้ดว่างไว้ ระบบจะสร้างให้ หรือสแกนบาร์โค้ดเดิมที่ติดมากับสินค้าลงในช่อง • ต้นทุนให้ใส่แบบไม่รวม VAT (ถ้าผู้ขายออกใบกำกับภาษี) •
            ไม่ต้องใส่ต้นทุนก็ได้ ใส่ภายหลังได้ แต่รายงานกำไรจะไม่ครบ
          </p>
        </div>

        <ErrorBox error={error} />
        {!readOnly && (
          <button className="btn btn-primary btn-lg" disabled={busy || !name.trim()} onClick={save}>
            {busy && <Spinner />} บันทึกสินค้า
          </button>
        )}
      </fieldset>
    </div>
  );
}

export default function ProductPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ProductEditor />
    </Suspense>
  );
}
