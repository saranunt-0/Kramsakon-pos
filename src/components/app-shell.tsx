"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  ChartColumn,
  ClipboardCheck,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  Receipt,
  Settings,
  Shirt,
  ShoppingCart,
  Tag,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "./auth";
import { ErrorBox, Modal, toast, errorText } from "./ui";
import { supabase } from "@/lib/supabase";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "หน้าร้าน",
    items: [
      { href: "/pos", label: "ขายสินค้า", icon: ShoppingCart },
      { href: "/receipts", label: "ใบเสร็จ / คืนสินค้า", icon: Receipt },
      { href: "/shift", label: "กะและเงินสด", icon: Wallet },
    ],
  },
  {
    title: "สินค้า",
    items: [
      { href: "/products", label: "รายการสินค้า", icon: Shirt },
      { href: "/stock/receive", label: "รับสินค้าเข้า", icon: PackagePlus },
      { href: "/labels", label: "พิมพ์บาร์โค้ด", icon: Tag },
      { href: "/stock/count", label: "ตรวจนับ / ปรับสต็อก", icon: ClipboardCheck, adminOnly: true },
      { href: "/stock/history", label: "ประวัติสต็อก", icon: History, adminOnly: true },
    ],
  },
  {
    title: "บัญชี",
    items: [
      { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard, adminOnly: true },
      { href: "/reports", label: "รายงาน", icon: ChartColumn, adminOnly: true },
      { href: "/expenses", label: "ค่าใช้จ่าย", icon: Banknote, adminOnly: true },
    ],
  },
  {
    title: "ระบบ",
    items: [
      { href: "/users", label: "พนักงาน", icon: Users, adminOnly: true },
      { href: "/settings", label: "ตั้งค่าร้าน", icon: Settings, adminOnly: true },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile, settings, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-4 p-3">
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.adminOnly || isAdmin);
        if (!items.length) return null;
        return (
          <div key={group.title}>
            <div className="px-3 pb-1 text-xs font-medium tracking-wide text-kram-300 uppercase">{group.title}</div>
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                    active ? "bg-white/15 font-medium text-white" : "text-kram-100 hover:bg-white/10"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const userBox = (
    <div className="border-t border-white/10 p-3 text-sm text-kram-100">
      <div className="px-3 pb-2">
        <div className="font-medium text-white">{profile?.display_name}</div>
        <div className="text-xs text-kram-300">{isAdmin ? "ผู้ดูแลระบบ" : "พนักงาน"} · {profile?.username}</div>
      </div>
      <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/10" onClick={() => setChangingPassword(true)}>
        <KeyRound size={18} /> เปลี่ยนรหัสผ่าน
      </button>
      <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/10" onClick={signOut}>
        <LogOut size={18} /> ออกจากระบบ
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-kram-800 lg:flex">
        <div className="px-6 py-5 text-lg font-bold text-white">{settings?.shop_name || "Kramsakon"}</div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        {userBox}
      </aside>

      {/* Drawer (phone / tablet) */}
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-kram-800">
            <div className="flex items-center justify-between px-6 py-4 text-lg font-bold text-white">
              {settings?.shop_name || "Kramsakon"}
              <button onClick={() => setOpen(false)} aria-label="ปิดเมนู">
                <X size={22} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            {userBox}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 bg-kram-800 px-4 py-3 text-white lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="เปิดเมนู">
            <Menu size={24} />
          </button>
          <span className="font-semibold">{settings?.shop_name || "Kramsakon"}</span>
        </header>
        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>

      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (password.length < 6) return setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
    if (password !== confirm) return setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
    setBusy(true);
    const { error } = await supabase().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(errorText(error));
    toast("เปลี่ยนรหัสผ่านแล้ว");
    onClose();
  }

  return (
    <Modal title="เปลี่ยนรหัสผ่าน" onClose={onClose}>
      <div className="space-y-3">
        <input className="input" type="password" placeholder="รหัสผ่านใหม่" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input className="input" type="password" placeholder="ยืนยันรหัสผ่านใหม่" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <ErrorBox error={error} />
        <button className="btn btn-primary w-full" disabled={busy} onClick={save}>
          บันทึก
        </button>
      </div>
    </Modal>
  );
}

/** Wrap admin-only page content with this. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return <div className="card p-8 text-center text-slate-600">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</div>;
  }
  return <>{children}</>;
}
