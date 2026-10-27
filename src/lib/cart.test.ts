import { describe, expect, it } from "vitest";
import { cartTotals, cashSuggestions, parseDiscount, vatIncluded, type CartLine } from "./cart";

const line = (price: number, qty: number, discount = 0): CartLine => ({
  variantId: 1, sku: "KS1", name: "x", label: "", price, qty, discount, stockQty: 10, isUnique: false,
});

describe("cart maths", () => {
  it("matches the database example", () => {
    const t = cartTotals([line(590, 3, 70), line(1200, 1)], 100, 7);
    expect(t).toEqual({ itemCount: 4, subtotal: 2900, billDiscount: 100, total: 2800, vat: 183.18 });
  });

  it("ignores VAT when the shop is not VAT registered", () => {
    expect(cartTotals([line(100, 1)], 0, null).vat).toBe(0);
  });

  it("parses baht and percent discounts", () => {
    expect(parseDiscount("", 500)).toBe(0);
    expect(parseDiscount("50", 500)).toBe(50);
    expect(parseDiscount("10%", 590)).toBe(59);
    expect(parseDiscount("abc", 500)).toBeNaN();
  });

  it("computes included VAT", () => {
    expect(vatIncluded(107, 7)).toBe(7);
  });

  it("suggests cash amounts", () => {
    expect(cashSuggestions(280)).toEqual([280, 300, 500, 1000]);
  });
});
