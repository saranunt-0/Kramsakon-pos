/**
 * Integration tests for the database rules in supabase/migrations.
 *
 * They need a Supabase instance with the migration applied and NO users yet
 * (the first user becomes admin). Point them at a throwaway local instance:
 *
 *   SUPABASE_TEST_URL=http://localhost:54321 \
 *   SUPABASE_TEST_ANON_KEY=... SUPABASE_TEST_SERVICE_ROLE_KEY=... \
 *   npm run test:db
 *
 * Without those variables the whole file is skipped.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { usernameToEmail } from "@/lib/auth-email";

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const enabled = Boolean(url && anonKey && serviceKey);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

async function createUser(service: SupabaseClient, username: string, password: string) {
  const { data, error } = await service.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { username, display_name: username },
  });
  if (error) throw error;
  return data.user.id;
}

async function signIn(username: string, password: string) {
  const client = createClient(url!, anonKey!, opts);
  const { error } = await client.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error) throw error;
  return client;
}

/** Call an RPC and return data, throwing the database error message on failure. */
async function rpc<T = unknown>(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const bkkMonth = () => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", year: "2-digit", month: "2-digit" }).formatToParts(new Date());
  return parts.find((p) => p.type === "year")!.value + parts.find((p) => p.type === "month")!.value;
};
const bkkToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

describe.skipIf(!enabled)("database rules", () => {
  let service: SupabaseClient;
  let admin: SupabaseClient;
  let staff: SupabaseClient;
  let staffId: string;
  let shirtS: number; // variant ids
  let shirtM: number;
  let scarf: number;

  beforeAll(async () => {
    service = createClient(url!, serviceKey!, opts);
    const { count } = await service.from("profiles").select("*", { count: "exact", head: true });
    if (count !== 0) throw new Error("Integration tests need an empty database (no users).");

    await createUser(service, "owner", "owner-pass-123");
    staffId = await createUser(service, "staff1", "staff-pass-123");
    admin = await signIn("owner", "owner-pass-123");
    staff = await signIn("staff1", "staff-pass-123");
  });

  it("makes the first user an active admin and later users inactive staff", async () => {
    const { data } = await service.from("profiles").select("username, role, active").order("created_at");
    expect(data).toEqual([
      { username: "owner", role: "admin", active: true },
      { username: "staff1", role: "staff", active: false },
    ]);
  });

  it("gives inactive users no access", async () => {
    const { data } = await staff.from("categories").select("*");
    expect(data).toEqual([]);
    await expect(rpc(staff, "open_shift", { p_opening_cash: 0 })).rejects.toThrow("ไม่มีสิทธิ์");
  });

  it("lets an admin activate staff", async () => {
    const { error } = await admin.from("profiles").update({ active: true }).eq("id", staffId);
    expect(error).toBeNull();
    const { data } = await staff.from("categories").select("name");
    expect(data!.length).toBeGreaterThan(0);
  });

  it("blocks anonymous access", async () => {
    const anon = createClient(url!, anonKey!, opts);
    const { error } = await anon.from("products").select("*");
    expect(error).not.toBeNull();
    const r = await anon.rpc("dashboard");
    expect(r.error).not.toBeNull();
  });

  it("does not let the last admin lock themselves out", async () => {
    const { data: me } = await admin.auth.getUser();
    const { error } = await admin.from("profiles").update({ role: "staff" }).eq("id", me.user!.id);
    expect(error?.message).toContain("ผู้ดูแลระบบ");
  });

  it("creates products with generated barcodes; staff may create but not edit", async () => {
    const created = await rpc<{ id: number; variants: { id: number; sku: string; size: string }[] }>(
      staff,
      "save_product",
      {
        p_product: { name: "เสื้อครามแขนยาว" },
        p_variants: [
          { size: "S", color: "คราม", price: 590, initial_qty: 5, cost: 999 },
          { size: "M", color: "คราม", price: 590 },
        ],
      },
    );
    expect(created.variants).toHaveLength(2);
    expect(created.variants[0].sku).toMatch(/^KS\d{6}$/);
    [shirtS, shirtM] = created.variants.map((v) => v.id);

    // Staff-supplied cost is ignored.
    const { data: costs } = await service.from("variant_costs").select("*").eq("variant_id", shirtS);
    expect(costs).toEqual([]);

    await expect(
      rpc(staff, "save_product", { p_product: { id: created.id, name: "แก้ชื่อ" }, p_variants: [{ id: shirtS, price: 1 }] }),
    ).rejects.toThrow("เฉพาะผู้ดูแลระบบ");

    const scarfProduct = await rpc<{ variants: { id: number }[] }>(admin, "save_product", {
      p_product: { name: "ผ้าพันคอมัดหมี่", is_unique: true },
      p_variants: [{ sku: "ks-scarf-1", price: 1200, cost: 500, initial_qty: 1 }],
    });
    scarf = scarfProduct.variants[0].id;
    const { data: v } = await admin.from("variants").select("sku, stock_qty").eq("id", scarf).single();
    expect(v).toEqual({ sku: "KS-SCARF-1", stock_qty: 1 });

    await expect(
      rpc(admin, "save_product", { p_product: { name: "ซ้ำ" }, p_variants: [{ sku: "KS-SCARF-1", price: 1 }] }),
    ).rejects.toThrow("ซ้ำ");
  });

  it("hides cost and sale lines from staff", async () => {
    const costs = await staff.from("variant_costs").select("*");
    expect(costs.data).toEqual([]);
    const adminCosts = await admin.from("variant_costs").select("*");
    expect(adminCosts.data!.length).toBe(1);
  });

  it("receives stock and keeps a weighted-average cost", async () => {
    await rpc(admin, "save_product", {
      p_product: { id: (await admin.from("variants").select("product_id").eq("id", shirtS).single()).data!.product_id, name: "เสื้อครามแขนยาว" },
      p_variants: [
        { id: shirtS, size: "S", color: "คราม", price: 590, cost: 200 },
        { id: shirtM, size: "M", color: "คราม", price: 590 },
      ],
    });
    // 5 in stock @200, receive 5 @300 → average 250
    await rpc(admin, "receive_stock", { p_items: [{ variant_id: shirtS, qty: 5, unit_cost: 300 }] });
    await rpc(staff, "receive_stock", { p_items: [{ variant_id: shirtM, qty: 3, unit_cost: 1 }] });
    const { data } = await admin.from("variants").select("id, stock_qty, variant_costs(cost)").in("id", [shirtS, shirtM]).order("id");
    expect(data).toEqual([
      { id: shirtS, stock_qty: 10, variant_costs: { cost: 250 } },
      { id: shirtM, stock_qty: 3, variant_costs: null },
    ]);
  });

  let saleId: string;
  let saleItems: { id: number; variant_id: number; qty: number; line_total: number; refundable_qty: number }[];

  it("refuses to sell without an open shift", async () => {
    await expect(
      rpc(staff, "create_sale", { p_items: [{ variant_id: shirtS, qty: 1 }], p_payment_method: "card" }),
    ).rejects.toThrow("เปิดกะ");
  });

  it("records a sale with discounts, VAT and stock", async () => {
    await rpc(staff, "open_shift", { p_opening_cash: 1000 });
    await expect(rpc(staff, "open_shift", { p_opening_cash: 0 })).rejects.toThrow("เปิดอยู่แล้ว");

    // 3×590 − 70 = 1700, + 1200 = 2900, bill discount 100 → 2800
    const items = [
      { variant_id: shirtS, qty: 3, discount: 70 },
      { variant_id: scarf, qty: 1 },
    ];
    await expect(
      rpc(staff, "create_sale", { p_items: items, p_payment_method: "cash", p_bill_discount: 100, p_cash_received: 2799, p_expected_total: 2800 }),
    ).rejects.toThrow("ไม่พอ");
    await expect(
      rpc(staff, "create_sale", { p_items: items, p_payment_method: "cash", p_bill_discount: 100, p_cash_received: 3000, p_expected_total: 2700 }),
    ).rejects.toThrow("2800");

    const sale = await rpc<{ id: string; receipt_no: string; total: number; change: number }>(staff, "create_sale", {
      p_items: items,
      p_payment_method: "cash",
      p_bill_discount: 100,
      p_cash_received: 3000,
      p_expected_total: 2800,
    });
    expect(sale.receipt_no).toBe(`S${bkkMonth()}-0001`);
    expect(sale.total).toBe(2800);
    expect(sale.change).toBe(200);
    saleId = sale.id;

    const receipt = await rpc<{ total: number; vat_amount: number; items: typeof saleItems }>(staff, "get_receipt", { p_sale_id: saleId });
    expect(receipt.vat_amount).toBe(183.18); // 2800 × 7/107
    expect(receipt.items.reduce((s, i) => s + i.line_total, 0)).toBeCloseTo(2800, 2);
    expect(JSON.stringify(receipt)).not.toContain("unit_cost");
    saleItems = receipt.items;

    const { data } = await admin.from("variants").select("id, stock_qty").in("id", [shirtS, scarf]).order("id");
    expect(data).toEqual([
      { id: shirtS, stock_qty: 7 },
      { id: scarf, stock_qty: 0 },
    ]);

    const lines = await staff.from("sale_items").select("*");
    expect(lines.data).toEqual([]);
  });

  it("refunds partially, then the rest exactly, and never more than sold", async () => {
    const shirtLine = saleItems.find((i) => i.variant_id === shirtS)!;
    const r1 = await rpc<{ receipt_no: string; total: number }>(staff, "refund_sale", {
      p_sale_id: saleId,
      p_items: [{ sale_item_id: shirtLine.id, qty: 1 }],
      p_reason: "เปลี่ยนไซซ์",
    });
    expect(r1.receipt_no).toBe(`CN${bkkMonth()}-0001`);
    await expect(
      rpc(staff, "refund_sale", { p_sale_id: saleId, p_items: [{ sale_item_id: shirtLine.id, qty: 3 }], p_reason: "x" }),
    ).rejects.toThrow("ไม่เกิน 2");
    const r2 = await rpc<{ total: number }>(staff, "refund_sale", {
      p_sale_id: saleId,
      p_items: [{ sale_item_id: shirtLine.id, qty: 2 }],
      p_reason: "ลูกค้าไม่ชอบสี",
    });
    expect(r1.total + r2.total).toBeCloseTo(-shirtLine.line_total, 2);

    const { data } = await admin.from("variants").select("stock_qty").eq("id", shirtS).single();
    expect(data!.stock_qty).toBe(10);
  });

  it("only lets admins void, and not while refunds exist", async () => {
    await expect(rpc(staff, "void_sale", { p_sale_id: saleId, p_reason: "x" })).rejects.toThrow("เฉพาะผู้ดูแลระบบ");
    await expect(rpc(admin, "void_sale", { p_sale_id: saleId, p_reason: "คีย์ผิด" })).rejects.toThrow("คืนสินค้าแล้ว");

    const { data: refunds } = await admin.from("sales").select("id").eq("refund_of", saleId);
    for (const r of refunds!) await rpc(admin, "void_sale", { p_sale_id: r.id, p_reason: "คีย์ผิด" });
    await rpc(admin, "void_sale", { p_sale_id: saleId, p_reason: "คีย์ผิด" });

    const { data } = await admin.from("variants").select("id, stock_qty").in("id", [shirtS, scarf]).order("id");
    expect(data).toEqual([
      { id: shirtS, stock_qty: 10 },
      { id: scarf, stock_qty: 1 },
    ]);
  });

  it("tracks cash in the shift and reports profit", async () => {
    // 2 × 590 by transfer, 1 × 1200 by cash, pay out 50 for supplies
    await rpc(staff, "create_sale", { p_items: [{ variant_id: shirtS, qty: 2 }], p_payment_method: "transfer" });
    await rpc(staff, "create_sale", { p_items: [{ variant_id: scarf, qty: 1 }], p_payment_method: "cash", p_cash_received: 1200 });
    await expect(rpc(staff, "add_cash_movement", { p_kind: "pay_out", p_amount: 50 })).rejects.toThrow("เหตุผล");
    await rpc(staff, "add_cash_movement", { p_kind: "pay_out", p_amount: 50, p_note: "ซื้อถุง" });

    const summary = await rpc<{ expected_cash: number; net_sales: number; receipts: number }>(staff, "shift_summary");
    expect(summary.expected_cash).toBe(1000 + 1200 - 50);
    expect(summary.net_sales).toBe(2380);

    await expect(rpc(staff, "report_summary", { p_from: bkkToday(), p_to: bkkToday() })).rejects.toThrow("เฉพาะผู้ดูแลระบบ");

    await admin.from("expenses").insert({ category: "rent", amount: 1070, vat_amount: 70, description: "ค่าเช่า" });
    await admin.from("expenses").insert({ category: "inventory", amount: 5000, description: "ซื้อผ้า" });

    const r = await rpc<Record<string, number>>(admin, "report_summary", { p_from: bkkToday(), p_to: bkkToday() });
    expect(r.net_sales).toBe(2380);
    expect(r.vat).toBeCloseTo(77.2 + 78.5, 2); // 1180×7/107 + 1200×7/107
    expect(r.cogs).toBe(2 * 250 + 500);
    expect(r.gross_profit).toBeCloseTo(2380 - 155.7 - 1000, 2);
    expect(r.expenses).toBe(1000); // rent ex-VAT; inventory purchases excluded
    expect(r.receipts).toBe(2);

    const closed = await rpc<{ expected_cash: number; counted_cash: number; closed_at: string }>(staff, "close_shift", {
      p_counted_cash: 2140,
    });
    expect(closed.counted_cash).toBe(2140);
    expect(closed.expected_cash).toBe(2150);
    expect(closed.closed_at).not.toBeNull();
  });

  it("restricts stock counts, settings and the dashboard to admins", async () => {
    await expect(rpc(staff, "count_stock", { p_items: [{ variant_id: shirtS, counted: 0 }] })).rejects.toThrow("เฉพาะผู้ดูแลระบบ");
    await staff.from("settings").update({ shop_name: "hacked" }).eq("id", true);
    const { data: s } = await admin.from("settings").select("shop_name").single();
    expect(s!.shop_name).not.toBe("hacked");

    const changed = await rpc<number>(admin, "count_stock", { p_items: [{ variant_id: shirtS, counted: 7 }, { variant_id: shirtM, counted: 3 }] });
    expect(changed).toBe(1);

    const dash = await rpc<{ inventory: { units: number } }>(admin, "dashboard");
    expect(dash.inventory.units).toBe(7 + 3 + 0);
  });
});
