"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { searchItems, useCatalog } from "./catalog";
import { money } from "@/lib/format";
import { variantLabel } from "@/lib/labels";
import type { Item } from "@/lib/types";

/** Search box with a dropdown of matching items (for typing instead of scanning). */
export function ItemPicker({ onPick, placeholder = "ค้นหาสินค้าด้วยชื่อ ไซซ์ สี" }: { onPick: (item: Item) => void; placeholder?: string }) {
  const { items } = useCatalog();
  const [query, setQuery] = useState("");
  const results = useMemo(() => (query.trim() ? searchItems(items, query).slice(0, 12) : []), [items, query]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={18} />
      <input className="input pl-10" placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      {results.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.map((item) => (
            <button
              key={item.id}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-kram-50"
              onClick={() => {
                onPick(item);
                setQuery("");
              }}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.products.name}</span>
                <span className="text-xs text-slate-500">{[variantLabel(item), item.sku].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="shrink-0 text-right text-xs text-slate-500">
                ฿{money(item.price)}
                <br />
                คงเหลือ {item.stock_qty}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
