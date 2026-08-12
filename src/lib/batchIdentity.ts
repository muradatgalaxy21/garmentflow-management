export function formatBatchIdentity(
  orderNumber?: string | null,
  styleNumber?: string | null,
  partyName?: string | null
): string {
  const parts: string[] = [];
  if (orderNumber) parts.push(`Order #${orderNumber}`);
  if (styleNumber) parts.push(`Batch #${styleNumber}`);
  if (partyName) parts.push(partyName);
  return parts.join(" · ");
}
