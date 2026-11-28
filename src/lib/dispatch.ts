export interface DispatchAvailability { batch_id: string; packed_pcs: number; dispatched_pcs: number }

/** Pieces still dispatchable; 0 when over or unknown. Mirrors the guard_dispatch DB trigger. */
export const remainingPcs = (a: Pick<DispatchAvailability, "packed_pcs" | "dispatched_pcs">) =>
  Math.max(a.packed_pcs - a.dispatched_pcs, 0);

/** Batches shown in the picker: completed (dispatch_availability only returns those) with pieces left. */
export const dispatchableBatches = <T extends { id: string }>(batches: T[], avail: DispatchAvailability[]) => {
  const byId = new Map(avail.map((a) => [a.batch_id, a]));
  return batches.flatMap((b) => {
    const a = byId.get(b.id);
    return a && remainingPcs(a) > 0 ? [{ ...b, packed: a.packed_pcs, dispatched: a.dispatched_pcs, remaining: remainingPcs(a) }] : [];
  });
};
