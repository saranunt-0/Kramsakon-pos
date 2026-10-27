"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} size={18} aria-label="กำลังโหลด" />;
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-slate-500">
      <Spinner /> กำลังโหลด...
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[95vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-md"}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="btn btn-ghost -mr-2 px-2" onClick={onClose} aria-label="ปิด">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ tone = "slate", children }: { tone?: "slate" | "green" | "red" | "amber" | "kram"; children: ReactNode }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-800",
    kram: "bg-kram-100 text-kram-800",
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts: toast("บันทึกแล้ว") from anywhere.
// ---------------------------------------------------------------------------

type ToastItem = { id: number; text: string; tone: "ok" | "error" };
let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, tone: "ok" | "error" = "ok") {
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, text, tone }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, tone === "error" ? 6000 : 3000);
}

export function Toaster() {
  const items = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto rounded-lg px-4 py-2 text-sm text-white shadow-lg ${t.tone === "ok" ? "bg-slate-900" : "bg-red-600"}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Message from anything thrown. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return "เกิดข้อผิดพลาด";
}
