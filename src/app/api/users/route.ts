// Staff account management (admin only). Needs the secret key because
// creating logins and resetting passwords are Supabase Auth admin actions.
import { adminClient, errorResponse, HttpError, requireAdmin } from "@/lib/supabase-admin";
import { USERNAME_PATTERN, usernameToEmail } from "@/lib/auth-email";

const BAN_FOREVER = "876000h"; // 100 years

export async function POST(request: Request) {
  try {
    const admin = adminClient();
    await requireAdmin(request, admin);
    const body = await request.json();
    const username = String(body.username ?? "").trim().toLowerCase();
    const displayName = String(body.display_name ?? "").trim() || username;
    const password = String(body.password ?? "");
    const role = body.role === "admin" ? "admin" : "staff";
    if (!USERNAME_PATTERN.test(username)) {
      throw new HttpError(400, "ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - (2-31 ตัว)");
    }
    if (password.length < 6) throw new HttpError(400, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");

    const { data: existing } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (existing) throw new HttpError(400, "ชื่อผู้ใช้นี้มีอยู่แล้ว");

    const { data, error } = await admin.auth.admin.createUser({
      email: usernameToEmail(username),
      password,
      email_confirm: true,
      user_metadata: { username, display_name: displayName },
    });
    if (error) throw new HttpError(400, error.message);

    // New logins start inactive (see handle_new_user); activate this one.
    const { error: profileError } = await admin
      .from("profiles")
      .update({ role, active: true, display_name: displayName })
      .eq("id", data.user.id);
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw new HttpError(400, profileError.message);
    }
    return Response.json({ id: data.user.id });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = adminClient();
    await requireAdmin(request, admin);
    const body = await request.json();
    const id = String(body.id ?? "");
    if (!id) throw new HttpError(400, "ไม่พบผู้ใช้");

    const changes: Record<string, unknown> = {};
    if (typeof body.display_name === "string") changes.display_name = body.display_name.trim();
    if (body.role === "admin" || body.role === "staff") changes.role = body.role;
    if (typeof body.active === "boolean") changes.active = body.active;
    if (Object.keys(changes).length) {
      const { error } = await admin.from("profiles").update(changes).eq("id", id);
      if (error) throw new HttpError(400, error.message);
    }

    const authChanges: { password?: string; ban_duration?: string } = {};
    if (typeof body.password === "string" && body.password) {
      if (body.password.length < 6) throw new HttpError(400, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      authChanges.password = body.password;
    }
    if (typeof body.active === "boolean") authChanges.ban_duration = body.active ? "none" : BAN_FOREVER;
    if (Object.keys(authChanges).length) {
      const { error } = await admin.auth.admin.updateUserById(id, authChanges);
      if (error) throw new HttpError(400, error.message);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
