"use client";

import { useState } from "react";
import { baht, money } from "@/lib/format";

/** Daily sales bars. Days with no sales are shown as empty slots. */
export function DailyBars({ data, from, to }: { data: { date: string; net_sales: number }[]; from: string; to: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const byDate = new Map(data.map((d) => [d.date, Number(d.net_sales)]));
  const days: { date: string; value: number }[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, value: byDate.get(key) ?? 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.value));
  const shown = hover !== null ? days[hover] : null;

  return (
    <div>
      <div className="mb-2 h-5 text-sm text-slate-600">
        {shown ? `${new Date(shown.date).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" })}: ฿${money(shown.value)}` : " "}
      </div>
      <div className="flex h-40 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => (
          <div
            key={d.date}
            className="flex h-full flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            onClick={() => setHover(i)}
            title={`${d.date}: ${money(d.value)}`}
          >
            <div
              className={`w-full rounded-t-sm ${hover === i ? "bg-kram-500" : "bg-kram-300"}`}
              style={{ height: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{new Date(from).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
        <span>{new Date(to).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
      </div>
    </div>
  );
}

/** Horizontal bars for a ranked list (e.g. sales by category). */
export function RankBars({ rows }: { rows: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums">
              {baht(r.value)}
              {r.sub && <span className="text-slate-500"> · {r.sub}</span>}
            </span>
          </div>
          <div className="mt-0.5 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-kram-400" style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
