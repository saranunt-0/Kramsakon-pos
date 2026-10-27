"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ErrorBox, PageLoading, Spinner } from "@/components/ui";
import { usernameToEmail } from "@/lib/auth-email";
import { api, supabase } from "@/lib/supabase";

export default function SetupPage() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "done" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ login: "", display_name: "", password: "", confirm: "" });

  useEffect(() => {
    api<{ needsSetup: boolean }>("/api/setup")
      .then((r) => setState(r.needsSetup ? "ready" : "done"))
      .catch((e) => {
        setError(e.message);
        setState("error");
      });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/setup", { method: "POST", body: form });
      const { error } = await supabase().auth.signInWithPassword({
        email: usernameToEmail(form.login),
        password: form.password,
      });
      if (error) throw error;
      router.replace("/settings");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-kram-800 to-kram-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="mb-1 text-xl font-bold text-kram-800">ตั้งค่าครั้งแรก</h1>
        {state === "loading" && <PageLoading />}
        {state === "error" && (
          <div className="space-y-3">
            <ErrorBox error={error} />
            <p className="text-sm text-slate-600">ตรวจสอบการตั้งค่า Supabase ใน Vercel ตามคู่มือ docs/DEPLOY.md</p>
          </div>
        )}
        {state === "done" && (
          <p className="text-sm text-slate-600">
            ระบบมีบัญชีผู้ดูแลแล้ว{" "}
            <a className="text-kram-700 underline" href="/login">
              ไปหน้าเข้าสู่ระบบ
            </a>
          </p>
        )}
        {state === "ready" && (
          <form onSubmit={onSubmit} className="space-y-4">
            <p className="text-sm text-slate-600">สร้างบัญชีเจ้าของร้าน (ผู้ดูแลระบบ) — บัญชีแรกจะเป็นผู้ดูแลระบบอัตโนมัติ</p>
            <label className="block">
              <span className="label">ชื่อผู้ใช้ (ภาษาอังกฤษ) หรืออีเมล</span>
              <input className="input" value={form.login} onChange={set("login")} autoCapitalize="none" required />
            </label>
            <label className="block">
              <span className="label">ชื่อที่แสดง</span>
              <input className="input" value={form.display_name} onChange={set("display_name")} placeholder="เช่น คุณปาร์ค" />
            </label>
            <label className="block">
              <span className="label">รหัสผ่าน (อย่างน้อย 8 ตัว)</span>
              <input className="input" type="password" value={form.password} onChange={set("password")} required minLength={8} />
            </label>
            <label className="block">
              <span className="label">ยืนยันรหัสผ่าน</span>
              <input className="input" type="password" value={form.confirm} onChange={set("confirm")} required />
            </label>
            <ErrorBox error={error} />
            <button className="btn btn-primary btn-lg w-full" disabled={busy}>
              {busy && <Spinner />} สร้างบัญชี
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
