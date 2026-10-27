// Label printing jobs are passed to /print/labels in the URL: "12x3,15x1"
// means 3 labels for variant 12 and 1 label for variant 15.

export interface LabelJob {
  id: number;
  copies: number;
}

export function encodeLabelJob(job: LabelJob[]): string {
  return job.filter((j) => j.copies > 0).map((j) => `${j.id}x${j.copies}`).join(",");
}

export function parseLabelJob(param: string | null): LabelJob[] {
  return (param ?? "")
    .split(",")
    .map((part) => part.split("x").map(Number))
    .filter(([id, n]) => Number.isInteger(id) && id > 0 && Number.isInteger(n) && n > 0)
    .map(([id, n]) => ({ id, copies: Math.min(n, 500) }));
}

export function openLabelPrint(job: LabelJob[]): void {
  const items = encodeLabelJob(job);
  if (items) window.open(`/print/labels?items=${items}`, "_blank", "width=700,height=700");
}
