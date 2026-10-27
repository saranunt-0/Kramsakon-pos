// Thai labels for the codes stored in the database.
import type { PaymentMethod, Variant } from "./types";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "เงินสด" },
  { value: "promptpay", label: "พร้อมเพย์ (QR)" },
  { value: "transfer", label: "โอนเงิน" },
  { value: "card", label: "บัตรเครดิต/เดบิต" },
  { value: "other", label: "อื่นๆ" },
];

export function paymentLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

export const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: "inventory", label: "ซื้อสินค้า/ผ้ามาขาย" },
  { value: "rent", label: "ค่าเช่า" },
  { value: "salary", label: "เงินเดือน/ค่าแรง" },
  { value: "utilities", label: "ค่าน้ำ ค่าไฟ ค่าอินเทอร์เน็ต" },
  { value: "marketing", label: "การตลาด/โฆษณา" },
  { value: "supplies", label: "วัสดุสิ้นเปลือง (ถุง ป้าย ฯลฯ)" },
  { value: "transport", label: "ค่าขนส่ง" },
  { value: "fees", label: "ค่าธรรมเนียม/ภาษี" },
  { value: "other", label: "อื่นๆ" },
];

export function expenseCategoryLabel(code: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === code)?.label ?? code;
}

export const MOVEMENT_REASONS: Record<string, string> = {
  receive: "รับเข้า",
  sale: "ขาย",
  refund: "คืนสินค้า",
  void: "ยกเลิกบิล",
  adjust: "ปรับสต็อก",
  count: "ตรวจนับ",
};

/** "S / คราม" */
export function variantLabel(v: Pick<Variant, "size" | "color">): string {
  return [v.size, v.color].filter(Boolean).join(" / ");
}
