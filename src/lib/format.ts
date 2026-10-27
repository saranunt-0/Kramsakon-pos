const TZ = "Asia/Bangkok";

const moneyFmt = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });

/** 1234.5 → "1,234.50" */
export function money(n: number | string | null | undefined): string {
  return moneyFmt.format(Number(n ?? 0));
}

/** 1234 → "1,234" */
export function int(n: number | string | null | undefined): string {
  return intFmt.format(Number(n ?? 0));
}

/** Rounds to satang (2 decimals) without floating point surprises. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** "27 ต.ค. 2569" (Thai Buddhist calendar) */
export function thaiDate(value: string | Date): string {
  return new Intl.DateTimeFormat("th-TH", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

/** "27 ต.ค. 2569 14:05" */
export function thaiDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** "14:05" */
export function thaiTime(value: string | Date): string {
  return new Intl.DateTimeFormat("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

/** Today's date in Bangkok as YYYY-MM-DD (for date inputs and report ranges). */
export function bangkokToday(): string {
  return isoDateInBangkok(new Date());
}

export function isoDateInBangkok(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/** Adds days to a YYYY-MM-DD string. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Start of the given timestamp range for a Bangkok calendar day (for PostgREST filters). */
export function bangkokDayStart(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00+07:00`).toISOString();
}

/** -744.39 → "-฿744.39" */
export function baht(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return `${v < 0 ? "-" : ""}฿${money(Math.abs(v))}`;
}
