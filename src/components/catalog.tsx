"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchAll, supabase } from "@/lib/supabase";
import type { Category, Item } from "@/lib/types";

const ITEM_SELECT = "*, products!inner(id, name, category_id, is_unique, active)";

interface Catalog {
  items: Item[];
  categories: Category[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Finds a sellable item by barcode, asking the database if it is not cached yet. */
  findBySku: (sku: string) => Promise<Item | null>;
}

const CatalogContext = createContext<Catalog | null>(null);

/** Active, sellable items (variants + product), shared by POS / receiving / labels. */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [rows, cats] = await Promise.all([
        fetchAll<Item>((from, to) =>
          supabase()
            .from("variants")
            .select(ITEM_SELECT)
            .eq("active", true)
            .eq("products.active", true)
            .order("id")
            .range(from, to),
        ),
        supabase().from("categories").select("*").order("sort_order").order("name"),
      ]);
      setItems(rows);
      setCategories((cats.data ?? []) as Category[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load of the shared catalogue when the app shell mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const bySku = useMemo(() => new Map(items.map((i) => [i.sku, i])), [items]);

  const findBySku = useCallback(
    async (sku: string) => {
      const cached = bySku.get(sku);
      if (cached) return cached;
      const { data } = await supabase()
        .from("variants")
        .select(ITEM_SELECT)
        .eq("sku", sku)
        .eq("active", true)
        .eq("products.active", true)
        .maybeSingle();
      if (data) setItems((prev) => [...prev, data as Item]);
      return (data as Item | null) ?? null;
    },
    [bySku],
  );

  return (
    <CatalogContext.Provider value={{ items, categories, loading, error, refresh, findBySku }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): Catalog {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return ctx;
}

/** Simple search on name, barcode, size and colour. */
export function searchItems(items: Item[], query: string, categoryId: number | null = null): Item[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((i) => {
    if (categoryId !== null && i.products.category_id !== categoryId) return false;
    if (!words.length) return true;
    const text = `${i.products.name} ${i.sku} ${i.size} ${i.color}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
