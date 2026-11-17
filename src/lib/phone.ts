// Pakistani mobile -> E.164 (+923XXXXXXXXX). Accepts 03xx..., 3xx..., 923xx..., +923xx... with spaces/dashes.
export function normalizePkPhone(raw: string): string | null {
  const local = raw.replace(/[\s-]/g, "").replace(/^\+?92/, "").replace(/^0/, "");
  return /^3\d{9}$/.test(local) ? `+92${local}` : null;
}
