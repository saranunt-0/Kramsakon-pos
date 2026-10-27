"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { useAuth } from "@/components/auth";
import { Badge, ErrorBox, Field, Modal, PageHeader, PageLoading, Spinner, errorText, toast } from "@/components/ui";
import { thaiDate } from "@/lib/format";
import { api, supabase } from "@/lib/supabase";
import type { Profile, Role } from "@/lib/types";

export default function UsersPage() {
  const { profile: me } = useAuth();
  const [rows, setRows] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | "new" | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase().from("profiles").select("*").order("created_at");
    if (error) setError(error.message);
    setRows((data ?? []) as Profile[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <AdminOnly>
      <div className="max-w-3xl space-y-4">
        <PageHeader title="พนักงาน">
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            <Plus size={18} /> เพิ่มพนักงาน
          </button>
        </PageHeader>
        <p className="text-sm text-slate-600">
          พนักงานเข้าสู่ระบบด้วย “ชื่อผู้ใช้” และรหัสผ่านที่ตั้งให้ที่นี่ (ไม่ต้องใช้อีเมล) แต่ละคนควรมีบัญชีของตัวเอง เพื่อให้รู้ว่าใครขาย/คืนสินค้า
        </p>
        <ErrorBox error={error} />
        {!rows ? (
          <PageLoading />
        ) : (
          <div className="card divide-y divide-slate-100">
            {rows.map((p) => (
              <button key={p.id} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50" onClick={() => setEditing(p)}>
                <div>
                  <div className="font-medium">
                    {p.display_name} {p.id === me?.id && <span className="text-xs text-slate-500">(คุณ)</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {p.username} · เพิ่มเมื่อ {thaiDate(p.created_at)}
                  </div>
                </div>
                <div className="flex gap-1">
                  {p.role === "admin" ? <Badge tone="kram">ผู้ดูแลระบบ</Badge> : <Badge>พนักงาน</Badge>}
                  {!p.active && <Badge tone="red">ปิดใช้งาน</Badge>}
                </div>
              </button>
            ))}
          </div>
        )}
        {editing && (
          <UserModal
            user={editing === "new" ? null : editing}
            isSelf={editing !== "new" && editing.id === me?.id}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </div>
    </AdminOnly>
  );
}

function UserModal({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: Profile | null;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(user?.username ?? "");
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "staff");
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (user) {
        await api("/api/users", {
          method: "PATCH",
          body: { id: user.id, display_name: displayName, role, active, password: password || undefined },
        });
      } else {
        await api("/api/users", { method: "POST", body: { username, display_name: displayName, role, password } });
      }
      toast("บันทึกแล้ว");
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={user ? `แก้ไข ${user.display_name}` : "เพิ่มพนักงาน"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="ชื่อผู้ใช้ (ภาษาอังกฤษ ใช้ตอนเข้าสู่ระบบ)">
          <input
            className="input"
            value={username}
            disabled={!!user}
            autoCapitalize="none"
            placeholder="เช่น nok"
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
          />
        </Field>
        <Field label="ชื่อที่แสดง">
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="เช่น น้องนก" />
        </Field>
        <Field label="สิทธิ์">
          <select className="input" value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="staff">พนักงาน — ขาย รับสินค้า เปิด/ปิดกะ</option>
            <option value="admin">ผู้ดูแลระบบ — ทุกอย่าง รวมถึงต้นทุน รายงาน ตั้งค่า</option>
          </select>
        </Field>
        <Field label={user ? "ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)" : "รหัสผ่าน (อย่างน้อย 6 ตัว)"}>
          <input className="input" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {user && !isSelf && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            เปิดใช้งาน (ปิดเมื่อพนักงานลาออก — ประวัติการขายยังอยู่ครบ)
          </label>
        )}
        <ErrorBox error={error} />
        <button className="btn btn-primary w-full" disabled={busy || (!user && (!username || password.length < 6))} onClick={save}>
          {busy && <Spinner />} บันทึก
        </button>
      </div>
    </Modal>
  );
}
