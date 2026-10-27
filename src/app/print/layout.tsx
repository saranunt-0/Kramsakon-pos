"use client";

import { useAuth } from "@/components/auth";
import { PageLoading } from "@/components/ui";

// Print pages open in their own window: no menu, just the page to print.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  const { loading, session, profile, settings } = useAuth();
  if (loading) return <PageLoading />;
  if (!session || !profile?.active || !settings) {
    return <p className="p-6 text-center text-slate-600">กรุณาเข้าสู่ระบบก่อนพิมพ์</p>;
  }
  return <div className="min-h-screen bg-white">{children}</div>;
}
