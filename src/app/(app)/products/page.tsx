"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useCatalog } from "@/components/catalog";
import { Badge, EmptyState, ErrorBox, PageHeader, PageLoading } from "@/components/ui";
import { int, money } from "@/lib/format";
import { fetchAll, supabase } from "@/lib/supabase";
import type { Product, Variant } from "@/lib/types";

type Row = Product & { variants: Pick<Variant, "id" | "sku" | "price" | "stock_qty" | "active" | "size" | "color">[] };

export default function ProductsPage() {
  const { categories } = useCatalog();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    fetchAll<Row>((from, to) =>
      supabase()
        .from("products")
        .select("*, variants(id, sku, price, stock_qty, active, size, color)")
        .order("created_at", { ascending: false })
        .range(from, to),
    )
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (rows ?? []).filter((p) => {
      if (!showArchived && !p.active) return false;
      if (categoryId && String(p.category_id) !== categoryId) return false;
      if (!words.length) return true;
      const text = `${p.name} ${p.variants.map((v) => `${v.sku} ${v.size} ${v.color}`).join(" ")}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [rows, query, categoryId, showArchived]);

  return (
    <div className="space-y-4">
      <PageHeader title="รายการสินค้า">
        <Link href="/products/new?unique=1" className="btn btn-secondary">
          <Plus size={18} /> สินค้าชิ้นเดียว
        </Link>
        <Link href="/products/new" className="btn btn-primary">
          <Plus size={18} /> เพิ่มสินค้า
        </Link>
      </PageHeader>

      <div className="card grid gap-3 p-4 sm:grid-cols-[1fr_200px_auto] sm:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={18} />
          <input className="input pl-10" placeholder="ค้นหาชื่อ บาร์โค้ด ไซซ์ สี" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">ทุกหมวดหมู่</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          แสดงสินค้าที่ปิดการขาย
        </label>
      </div>

      <ErrorBox error={error} />
      {!rows ? (
        <PageLoading />
      ) : filtered.length === 0 ? (
        <EmptyState>ไม่พบสินค้า</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>สินค้า</th>
                <th>หมวดหมู่</th>
                <th>ไซซ์/สี</th>
                <th className="num">ราคา</th>
                <th className="num">คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const variants = p.variants.filter((v) => v.active);
                const prices = variants.map((v) => Number(v.price));
                const stock = variants.reduce((s, v) => s + v.stock_qty, 0);
                const min = Math.min(...prices);
                const max = Math.max(...prices);
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td>
                      <Link href={`/products/${p.id}`} className="font-medium text-kram-700 hover:underline">
                        {p.name}
                      </Link>
                      <div className="flex gap-1 pt-0.5">
                        {p.is_unique && <Badge tone="kram">ชิ้นเดียว</Badge>}
                        {!p.active && <Badge tone="red">ปิดการขาย</Badge>}
                      </div>
                    </td>
                    <td>{p.category_id ? catName.get(p.category_id) : "-"}</td>
                    <td>{variants.length > 1 ? `${variants.length} แบบ` : variants[0] ? [variants[0].size, variants[0].color].filter(Boolean).join(" / ") || "-" : "-"}</td>
                    <td className="num">{prices.length ? (min === max ? money(min) : `${money(min)} – ${money(max)}`) : "-"}</td>
                    <td className={`num ${stock <= 0 ? "text-red-600" : ""}`}>{int(stock)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
