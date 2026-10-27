// CSV export that opens correctly in Excel (Thai text needs the UTF-8 BOM).

type Cell = string | number | boolean | null | undefined;

function escape(cell: Cell): string {
  const text = cell === null || cell === undefined ? "" : String(cell);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, header: string[], rows: Cell[][]): void {
  const blob = new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
