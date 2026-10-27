// Cart maths for the POS screen. The database recalculates everything when the
// sale is saved (and rejects it if the total differs), so this only needs to
// match create_sale in supabase/migrations.
import { round2 } from "./format";

export interface CartLine {
  variantId: number;
  sku: string;
  name: string;
  label: string;
  price: number;
  qty: number;
  discount: number; // baht off this line
  stockQty: number;
  isUnique: boolean;
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  billDiscount: number;
  total: number;
  vat: number;
}

export function lineTotal(line: CartLine): number {
  return round2(line.qty * line.price - line.discount);
}

export function cartTotals(lines: CartLine[], billDiscount: number, vatRate: number | null): CartTotals {
  const subtotal = round2(lines.reduce((sum, l) => sum + lineTotal(l), 0));
  const bill = Math.min(round2(billDiscount), subtotal);
  const total = round2(subtotal - bill);
  return {
    itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
    subtotal,
    billDiscount: bill,
    total,
    vat: vatRate ? vatIncluded(total, vatRate) : 0,
  };
}

/** VAT contained in a VAT-inclusive amount, e.g. 107 at 7% → 7. */
export function vatIncluded(amount: number, rate: number): number {
  return round2((amount * rate) / (100 + rate));
}

/** Converts "10%" or "50" (baht) into a baht discount on `base`. */
export function parseDiscount(input: string, base: number): number {
  const text = input.trim();
  if (!text) return 0;
  if (text.endsWith("%")) {
    const pct = Number(text.slice(0, -1));
    if (!Number.isFinite(pct) || pct < 0) return NaN;
    return round2((base * Math.min(pct, 100)) / 100);
  }
  const baht = Number(text);
  return Number.isFinite(baht) && baht >= 0 ? round2(baht) : NaN;
}

/** Quick cash buttons: exact amount and the next round banknote amounts. */
export function cashSuggestions(total: number): number[] {
  const notes = [20, 50, 100, 500, 1000];
  const out = new Set<number>([total]);
  for (const n of notes) out.add(Math.ceil(total / n) * n);
  return [...out].filter((v) => v >= total).sort((a, b) => a - b).slice(0, 5);
}
