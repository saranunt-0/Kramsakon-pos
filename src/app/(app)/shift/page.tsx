"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth";
import { OpenShiftModal } from "@/components/shift";
import { ErrorBox, Field, Modal, PageHeader, PageLoading, Spinner, errorText, toast } from "@/components/ui";
import { money, thaiDateTime, thaiTime } from "@/lib/format";
import { paymentLabel } from "@/lib/labels";
import { rpc, supabase } from "@/lib/supabase";
import type { ShiftSummary } from "@/lib/types";

export default function ShiftPage() {
  const { isAdmin } = useAuth();
  const [summary, setSummary] = useState<ShiftSummary | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"open" | "pay_in" | "pay_out" | "close" | null>(null);
  const [closed, setClosed] = useState<ShiftSummary | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(() => {
    rpc<ShiftSummary | null>("shift_summary")
      .then(setSummary)
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  if (summary === undefined) return <PageLoading />;

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="กะและเงินสด">
        {summary ? (
          <>
            <button className="btn btn-secondary" onClick={() => setModal("pay_in")}>
              นำเงินเข้า
            </button>
            <button className="btn btn-secondary" onClick={() => setModal("pay_out")}>
              นำเงินออก
            </button>
            <button className="btn btn-primary" onClick={() => setModal("close")}>
              ปิดกะ
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => setModal("open")}>
            เปิดกะ
          </button>
        )}
      </PageHeader>
      <ErrorBox error={error} />

      {closed && <ClosedResult summary={closed} onDismiss={() => setClosed(null)} />}

      {summary ? (
        <ShiftDetails summary={summary} />
      ) : (
        !closed && <div className="card p-6 text-center text-slate-600">ยังไม่มีกะที่เปิดอยู่ — กด “เปิดกะ” เพื่อเริ่มขาย</div>
      )}

      {isAdmin && <ShiftHistory key={historyKey} />}

      {modal === "open" && (
        <OpenShiftModal
          onClose={() => setModal(null)}
          onOpened={() => {
            setModal(null);
            setClosed(null);
            load();
          }}
        />
      )}
      {(modal === "pay_in" || modal === "pay_out") && (
        <CashMovementModal
          kind={modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === "close" && (
        <CloseShiftModal
          onClose={() => setModal(null)}
          onClosed={(result) => {
            setModal(null);
            setClosed(result);
            setSummary(null);
            setHistoryKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function ShiftDetails({ summary: s }: { summary: ShiftSummary }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-2 p-4 text-sm">
        <div className="text-slate-500">
          เปิดกะโดย {s.opened_by} · {thaiDateTime(s.opened_at)}
          {s.closed_at && (
            <>
              <br />
              ปิดกะโดย {s.closed_by} · {thaiDateTime(s.closed_at)}
            </>
          )}
        </div>
        <Line label="เงินสดตั้งต้น" value={s.opening_cash} />
        <Line label="ขายเงินสด" value={s.cash_sales} />
        {Number(s.cash_refunds) !== 0 && <Line label="คืนเงินสด" value={s.cash_refunds} />}
        {Number(s.pay_in) !== 0 && <Line label="นำเงินเข้า" value={s.pay_in} />}
        {Number(s.pay_out) !== 0 && <Line label="นำเงินออก" value={-Number(s.pay_out)} />}
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
          <span>เงินสดที่ควรมีในลิ้นชัก</span>
          <span className="tabular-nums">฿{money(s.expected_cash)}</span>
        </div>
        {s.counted_cash !== null && (
          <>
            <Line label="นับได้จริง" value={s.counted_cash} />
            <Difference expected={s.expected_cash} counted={s.counted_cash} />
          </>
        )}
      </div>
      <div className="card space-y-2 p-4 text-sm">
        <div className="flex justify-between text-base font-semibold">
          <span>ยอดขายสุทธิในกะ</span>
          <span className="tabular-nums">฿{money(s.net_sales)}</span>
        </div>
        <div className="text-slate-500">
          {s.receipts} บิล{s.refunds > 0 && ` · คืนสินค้า ${s.refunds} บิล`}
        </div>
        {s.by_method.map((m) => (
          <Line key={m.method} label={`${paymentLabel(m.method)} (${m.count})`} value={m.total} />
        ))}
        {s.cash_movements.length > 0 && (
          <div className="border-t border-slate-200 pt-2">
            <div className="mb-1 font-medium">นำเงินเข้า/ออก</div>
            {s.cash_movements.map((m) => (
              <div key={m.id} className="flex justify-between text-xs">
                <span>
                  {thaiTime(m.created_at)} {m.kind === "pay_in" ? "เข้า" : "ออก"} · {m.note} ({m.created_by})
                </span>
                <span className="tabular-nums">{money(m.kind === "pay_in" ? m.amount : -m.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums">{money(value)}</span>
    </div>
  );
}

function Difference({ expected, counted }: { expected: number; counted: number }) {
  const diff = Number(counted) - Number(expected);
  const tone = Math.abs(diff) < 0.005 ? "text-emerald-700" : diff < 0 ? "text-red-600" : "text-amber-700";
  return (
    <div className={`flex justify-between font-semibold ${tone}`}>
      <span>{Math.abs(diff) < 0.005 ? "เงินตรง" : diff < 0 ? "เงินขาด" : "เงินเกิน"}</span>
      <span className="tabular-nums">{money(diff)}</span>
    </div>
  );
}

function ClosedResult({ summary, onDismiss }: { summary: ShiftSummary; onDismiss: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 text-emerald-900">
        <span>ปิดกะเรียบร้อย</span>
        <button className="text-sm underline" onClick={onDismiss}>
          ซ่อน
        </button>
      </div>
      <ShiftDetails summary={summary} />
    </div>
  );
}

function CashMovementModal({ kind, onClose, onSaved }: { kind: "pay_in" | "pay_out"; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await rpc("add_cash_movement", { p_kind: kind, p_amount: Number(amount), p_note: note });
      toast("บันทึกแล้ว");
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={kind === "pay_in" ? "นำเงินเข้าลิ้นชัก" : "นำเงินออกจากลิ้นชัก"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="จำนวนเงิน (บาท)">
          <input className="input text-lg" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="เหตุผล" hint={kind === "pay_out" ? "เช่น ซื้อถุง จ่ายค่าส่งของ นำเงินฝากธนาคาร" : "เช่น เพิ่มเงินทอน"}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorBox error={error} />
        <button className="btn btn-primary w-full" disabled={busy || !(Number(amount) > 0)} onClick={save}>
          {busy && <Spinner />} บันทึก
        </button>
      </div>
    </Modal>
  );
}

function CloseShiftModal({ onClose, onClosed }: { onClose: () => void; onClosed: (s: ShiftSummary) => void }) {
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setBusy(true);
    setError(null);
    try {
      const result = await rpc<ShiftSummary>("close_shift", { p_counted_cash: Number(counted), p_note: note });
      toast("ปิดกะแล้ว");
      onClosed(result);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="ปิดกะ" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">นับเงินสดทั้งหมดในลิ้นชัก (รวมเงินทอนตั้งต้น) แล้วกรอกยอดที่นับได้</p>
        <Field label="เงินสดที่นับได้ (บาท)">
          <input className="input text-lg" inputMode="decimal" autoFocus value={counted} onChange={(e) => setCounted(e.target.value)} />
        </Field>
        <Field label="หมายเหตุ (ถ้ามี)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorBox error={error} />
        <button className="btn btn-primary w-full" disabled={busy || counted === "" || Number(counted) < 0} onClick={close}>
          {busy && <Spinner />} ยืนยันปิดกะ
        </button>
      </div>
    </Modal>
  );
}

interface ShiftRow {
  id: number;
  opened_at: string;
  closed_at: string | null;
  expected_cash: number | null;
  counted_cash: number | null;
}

function ShiftHistory() {
  const [rows, setRows] = useState<ShiftRow[] | null>(null);
  const [open, setOpen] = useState<ShiftSummary | null>(null);

  useEffect(() => {
    supabase()
      .from("shifts")
      .select("id, opened_at, closed_at, expected_cash, counted_cash")
      .not("closed_at", "is", null)
      .order("opened_at", { ascending: false })
      .limit(30)
      .then(({ data }) => setRows((data ?? []) as ShiftRow[]));
  }, []);

  if (!rows?.length) return null;
  return (
    <div className="card overflow-x-auto">
      <h2 className="px-4 pt-4 font-semibold">กะที่ปิดแล้ว (30 กะล่าสุด)</h2>
      <table className="table mt-2">
        <thead>
          <tr>
            <th>เปิด</th>
            <th>ปิด</th>
            <th className="num">ควรมี</th>
            <th className="num">นับได้</th>
            <th className="num">ขาด/เกิน</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const diff = Number(r.counted_cash) - Number(r.expected_cash);
            return (
              <tr
                key={r.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => rpc<ShiftSummary>("shift_summary", { p_shift_id: r.id }).then(setOpen)}
              >
                <td className="whitespace-nowrap">{thaiDateTime(r.opened_at)}</td>
                <td className="whitespace-nowrap">{r.closed_at && thaiDateTime(r.closed_at)}</td>
                <td className="num">{money(r.expected_cash)}</td>
                <td className="num">{money(r.counted_cash)}</td>
                <td className={`num ${Math.abs(diff) < 0.005 ? "" : diff < 0 ? "text-red-600" : "text-amber-700"}`}>{money(diff)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {open && (
        <Modal title="รายละเอียดกะ" onClose={() => setOpen(null)} wide>
          <ShiftDetails summary={open} />
        </Modal>
      )}
    </div>
  );
}
