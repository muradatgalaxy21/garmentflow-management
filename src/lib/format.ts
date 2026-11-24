// One date format for the admin portal: "24 Nov 2026" / "24 Nov 2026, 3:42 PM".
// Money: use pkr() from "@/lib/finance".

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  // Bare 'YYYY-MM-DD' is a calendar date: read it as local, not UTC midnight.
  const m = typeof d === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  const date = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
  return isNaN(date.getTime()) ? null : date;
}

export function fmtDate(d: string | Date | null | undefined): string {
  const date = toDate(d);
  return date ? `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}` : "—";
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  const date = toDate(d);
  if (!date) return "—";
  const h = date.getHours();
  return `${fmtDate(date)}, ${h % 12 || 12}:${String(date.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
