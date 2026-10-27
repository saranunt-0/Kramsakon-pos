"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { CartLine } from "@/lib/cart";
import type { Item } from "@/lib/types";
import { variantLabel } from "@/lib/labels";

const STORAGE_KEY = "kramsakon-pos-cart";

interface Cart {
  lines: CartLine[];
  billDiscountInput: string;
  setBillDiscountInput: (v: string) => void;
  add: (item: Item, qty?: number) => void;
  setQty: (variantId: number, qty: number) => void;
  setDiscount: (variantId: number, discount: number) => void;
  remove: (variantId: number) => void;
  clear: () => void;
}

const CartContext = createContext<Cart | null>(null);

function loadSaved(): { lines: CartLine[]; bill: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // storage unavailable — start empty
  }
  return { lines: [], bill: "" };
}

/** The current bill. Lives above the pages so it survives moving between screens. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [billDiscountInput, setBillDiscountInput] = useState("");
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const saved = loadSaved();
    // Restore an unfinished bill after a page reload (browser-only state).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(saved.lines ?? []);
    setBillDiscountInput(saved.bill ?? "");
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ lines, bill: billDiscountInput }));
    } catch {
      // ignore
    }
  }, [lines, billDiscountInput, restored]);

  const add = useCallback((item: Item, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === item.id);
      if (existing) {
        return prev.map((l) => (l.variantId === item.id ? { ...l, qty: l.qty + qty } : l));
      }
      return [
        ...prev,
        {
          variantId: item.id,
          sku: item.sku,
          name: item.products.name,
          label: variantLabel(item),
          price: Number(item.price),
          qty,
          discount: 0,
          stockQty: item.stock_qty,
          isUnique: item.products.is_unique,
        },
      ];
    });
  }, []);

  const setQty = useCallback((variantId: number, qty: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.variantId === variantId ? { ...l, qty, discount: Math.min(l.discount, l.price * qty) } : l))
        .filter((l) => l.qty > 0),
    );
  }, []);

  const setDiscount = useCallback((variantId: number, discount: number) => {
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, discount } : l)));
  }, []);

  const remove = useCallback((variantId: number) => {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setBillDiscountInput("");
  }, []);

  return (
    <CartContext.Provider value={{ lines, billDiscountInput, setBillDiscountInput, add, setQty, setDiscount, remove, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): Cart {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
