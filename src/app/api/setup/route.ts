// First-run setup: creates the owner (admin) account when the shop has no
// users yet. After that it refuses to do anything.
import { adminClient, errorResponse, HttpError } from "@/lib/supabase-admin";
import { USERNAME_PATTERN, usernameToEmail } from "@/lib/auth-email";

async function hasUsers() {
  const { count, error } = await adminClient().from("profiles").select("id", { count: "exact", head: true });
  if (error) throw new HttpError(500, `เชื่อมต่อฐานข้อมูลไม่ได้: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function GET() {
  try {
    return Response.json({ needsSetup: !(await hasUsers()) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    if (await hasUsers()) throw new HttpError(409, "ตั้งค่าเรียบร้อยแล้ว กรุณาเข้าสู่ระบบ");
    const body = await request.json();
    const login = String(body.login ?? "").trim().toLowerCase();
    const displayName = String(body.display_name ?? "").trim();
    const password = String(body.password ?? "");
    if (!login.includes("@") && !USERNAME_PATTERN.test(login)) {
      throw new HttpError(400, "ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - (2-31 ตัว) หรือใส่เป็นอีเมล");
    }
    if (password.length < 8) throw new HttpError(400, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");

    const username = login.includes("@") ? login.split("@")[0] : login;
    const { error } = await adminClient().auth.admin.createUser({
      email: usernameToEmail(login),
      password,
      email_confirm: true,
      user_metadata: { username, display_name: displayName || username },
    });
    if (error) throw new HttpError(400, error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
