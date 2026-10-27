// Row shapes returned by Supabase. Keep in sync with supabase/migrations.

export type Role = "admin" | "staff";
export type PaymentMethod = "cash" | "promptpay" | "transfer" | "card" | "other";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export interface Settings {
  shop_name: string;
  branch_name: string;
  address: string;
  phone: string;
  tax_id: string;
  vat_registered: boolean;
  vat_rate: number;
  pos_reg_no: string;
  receipt_footer: string;
  receipt_width_mm: number;
  promptpay_id: string;
  sku_prefix: string;
  staff_can_refund: boolean;
  label_width_mm: number;
  label_height_mm: number;
  label_columns: number;
  label_gap_mm: number;
  label_show_price: boolean;
}

export interface Category {
  id: number;
  name: string;
  sort_order: number;
}

export interface Product {
  id: number;
  name: string;
  category_id: number | null;
  description: string;
  is_unique: boolean;
  active: boolean;
  created_at: string;
}

export interface Variant {
  id: number;
  product_id: number;
  sku: string;
  size: string;
  color: string;
  price: number;
  stock_qty: number;
  low_stock_at: number;
  active: boolean;
}

/** A variant joined with its product — what the POS and stock screens work with. */
export interface Item extends Variant {
  products: Pick<Product, "id" | "name" | "category_id" | "is_unique" | "active">;
}

export interface Sale {
  id: string;
  receipt_no: string;
  kind: "sale" | "refund";
  refund_of: string | null;
  status: "completed" | "voided";
  shift_id: number | null;
  cashier_id: string;
  subtotal: number;
  bill_discount: number;
  total: number;
  vat_amount: number;
  payment_method: PaymentMethod;
  cash_received: number | null;
  change_amount: number | null;
  customer_name: string;
  customer_tax_id: string;
  customer_address: string;
  customer_branch: string;
  note: string;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface ReceiptItem {
  id: number;
  variant_id: number | null;
  product_name: string;
  variant_label: string;
  sku: string;
  qty: number;
  unit_price: number;
  line_discount: number;
  bill_discount_share: number;
  line_total: number;
  refundable_qty: number;
}

export interface Receipt extends Sale {
  cashier_name: string | null;
  voided_by_name: string | null;
  original_receipt_no: string | null;
  items: ReceiptItem[];
  refunds: { id: string; receipt_no: string; total: number; status: string; created_at: string }[];
}

export interface ShiftSummary {
  id: number;
  opened_at: string;
  opened_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  opening_cash: number;
  cash_sales: number;
  cash_refunds: number;
  pay_in: number;
  pay_out: number;
  expected_cash: number;
  counted_cash: number | null;
  net_sales: number;
  receipts: number;
  refunds: number;
  note: string;
  by_method: { method: PaymentMethod; total: number; count: number }[];
  cash_movements: { id: number; kind: "pay_in" | "pay_out"; amount: number; note: string; created_at: string; created_by: string }[];
}

export interface ReportSummary {
  from: string;
  to: string;
  gross_sales: number;
  discounts: number;
  refunds: number;
  net_sales: number;
  vat: number;
  net_sales_ex_vat: number;
  cogs: number;
  gross_profit: number;
  expenses: number;
  net_profit: number;
  inventory_purchases: number;
  input_vat: number;
  receipts: number;
  refund_receipts: number;
  items_sold: number;
  by_payment: { method: PaymentMethod; total: number; count: number }[];
  daily: { date: string; net_sales: number; receipts: number }[];
  by_category: { category: string; qty: number; net_sales: number }[];
  by_cashier: { cashier: string; net_sales: number; receipts: number; refunds: number }[];
}

export interface ReportItem {
  variant_id: number | null;
  sku: string;
  product_name: string;
  variant_label: string;
  category: string | null;
  qty: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
  stock_qty: number | null;
}

export interface Expense {
  id: number;
  expense_date: string;
  category: string;
  description: string;
  vendor: string;
  vendor_tax_id: string;
  tax_invoice_no: string;
  amount: number;
  vat_amount: number;
  payment_method: PaymentMethod;
  created_at: string;
}
