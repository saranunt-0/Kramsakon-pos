import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase now calls the browser key the "publishable" key; older projects
// call it the "anon" key. Either works.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/** The one Supabase client used by every page in the browser. */
export function supabase(): SupabaseClient {
  if (!client) {
    if (!url || !key) {
      throw new Error(
        "ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ดู docs/DEPLOY.md)",
      );
    }
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "kramsakon-pos-auth" },
    });
  }
  return client;
}

/** Call a database function and return its data, throwing a readable error. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * Supabase returns at most 1000 rows per request. This keeps asking for the
 * next page until everything is loaded. `build(from, to)` must return a query
 * with `.range(from, to)` applied.
 */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

/** Calls one of our own API routes with the current login token. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `เกิดข้อผิดพลาด (${res.status})`);
  return json as T;
}
