"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth";
import { ErrorBox, Spinner } from "@/components/ui";
import { usernameToEmail } from "@/lib/auth-email";
import { api, supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const { session, profile, loading } = useAuth();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    if (!loading && session && profile?.active) router.replace("/pos");
  }, [loading, session, profile, router]);

  useEffect(() => {
    api<{ needsSetup: boolean }>("/api/setup")
      .then((r) => setNeedsSetup(r.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email: usernameToEmail(login), password });
    setBusy(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" : error.message);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-kram-800 to-kram-900 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-kram-800">Kramsakon POS</div>
          <div className="text-sm text-slate-500">ระบบขายหน้าร้าน ครามสกล</div>
        </div>

        {session && profile && !profile.active && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            บัญชีนี้ยังไม่ได้เปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ
            <button type="button" className="ml-2 underline" onClick={() => supabase().auth.signOut()}>
              ออกจากระบบ
            </button>
          </div>
        )}

        <div className="space-y-4">
          <label className="block">
            <span className="label">ชื่อผู้ใช้</span>
            <input
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="label">รหัสผ่าน</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <ErrorBox error={error} />
          <button className="btn btn-primary btn-lg w-full" disabled={busy}>
            {busy && <Spinner />} เข้าสู่ระบบ
          </button>
        </div>

        {needsSetup && (
          <p className="mt-6 rounded-lg bg-kram-50 p-3 text-center text-sm text-kram-800">
            ยังไม่มีบัญชีผู้ใช้ในระบบ —{" "}
            <Link href="/setup" className="font-medium underline">
              สร้างบัญชีเจ้าของร้าน
            </Link>
          </p>
        )}
      </form>
    </main>
  );
}
