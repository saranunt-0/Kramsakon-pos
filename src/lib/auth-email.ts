// Supabase logins are email based. Staff don't need a real email address:
// a username like "nok" is stored as "nok@<domain>". No email is ever sent
// to these addresses. Logins that contain "@" are used as-is (e.g. the owner).
export const LOGIN_EMAIL_DOMAIN = process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || "staff.kramsakon.app";

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,30}$/;

export function usernameToEmail(login: string): string {
  const value = login.trim().toLowerCase();
  return value.includes("@") ? value : `${value}@${LOGIN_EMAIL_DOMAIN}`;
}
