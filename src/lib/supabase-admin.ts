// Server-only Supabase client using the secret (service role) key.
// Only import this from files under src/app/api — never from a page.
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("ยังไม่ได้ตั้งค่า SUPABASE_SECRET_KEY บนเซิร์ฟเวอร์ (ดู docs/DEPLOY.md)");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Checks the caller's login token and that they are an active admin. */
export async function requireAdmin(request: Request, admin: SupabaseClient): Promise<User> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "กรุณาเข้าสู่ระบบใหม่");
  const { data: profile } = await admin.from("profiles").select("role, active").eq("id", data.user.id).single();
  if (!profile || profile.role !== "admin" || !profile.active) {
    throw new HttpError(403, "เฉพาะผู้ดูแลระบบเท่านั้น");
  }
  return data.user;
}

export function errorResponse(e: unknown): Response {
  const status = e instanceof HttpError ? e.status : 500;
  const message = e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
  return Response.json({ error: message }, { status });
}
