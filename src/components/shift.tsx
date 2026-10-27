"use client";

import { useCallback, useEffect, useState } from "react";
import { rpc, supabase } from "@/lib/supabase";
import { ErrorBox, Field, Modal, errorText, toast } from "./ui";

export interface OpenShift {
  id: number;
  opened_at: string;
}

/** The shop's currently open shift (cash drawer session), if any. */
export function useOpenShift() {
  const [shift, setShift] = useState<OpenShift | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase().from("shifts").select("id, opened_at").is("closed_at", null).maybeSingle();
    setShift(data as OpenShift | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { shift, loading, refresh };
}

export function OpenShiftModal({ onClose, onOpened }: { onClose: () => void; onOpened: () => void }) {
  const [cash, setCash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      await rpc("open_shift", { p_opening_cash: Number(cash || 0) });
      toast("เปิดกะแล้ว");
      onOpened();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="เปิดกะ" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">นับเงินทอนในลิ้นชักก่อนเริ่มขาย แล้วกรอกยอดด้านล่าง</p>
        <Field label="เงินสดตั้งต้นในลิ้นชัก (บาท)">
          <input
            className="input text-lg"
            inputMode="decimal"
            autoFocus
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && open()}
            placeholder="0"
          />
        </Field>
        <ErrorBox error={error} />
        <button className="btn btn-primary btn-lg w-full" disabled={busy} onClick={open}>
          เปิดกะ
        </button>
      </div>
    </Modal>
  );
}
