// Pure helpers for the admin dashboard (kept out of the page so they can be tested).

const DAY = 86_400_000;

/**
 * "No work in the last 24 hours" for a factory that runs Monday–Saturday:
 * Sundays don't count, so on Monday morning a Saturday log is still fresh.
 * Returns the moment a batch's last log must be newer than to count as active.
 */
export function stallCutoff(now: Date = new Date()): Date {
  let cutoff = now.getTime() - DAY;
  for (;;) {
    // Time of Sundays (local calendar days) inside [cutoff, now]
    let sundayMs = 0;
    const day = new Date(cutoff);
    day.setHours(0, 0, 0, 0);
    for (let t = day.getTime(); t < now.getTime(); ) {
      const d = new Date(t);
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      if (d.getDay() === 0) sundayMs += Math.min(next, now.getTime()) - Math.max(t, cutoff);
      t = next;
    }
    const wanted = now.getTime() - DAY - sundayMs;
    if (wanted >= cutoff) return new Date(cutoff);
    cutoff = wanted;
  }
}

export interface PhaseRef { id: string; name: string; sequence_order: number }
export interface BatchRef { id: string; total_quantity: number }
export interface TrackRow { batch_id: string; phase_id: string; quantity_completed: number; quantity_wasted: number }

/**
 * Pieces waiting in front of each phase, across the given (in-progress) batches.
 * - A phase the batch has logged: waiting = pieces completed by the last logged phase before it,
 *   minus what this phase already completed or wasted.
 * - The first unlogged phase after the furthest logged one: everything the last logged phase
 *   completed is waiting there (not started yet).
 * - Other unlogged phases are skipped (many phases are optional). The first phase is never a queue.
 */
export function phaseQueues(phases: PhaseRef[], batches: BatchRef[], tracking: TrackRow[]) {
  const ordered = [...phases].sort((a, b) => a.sequence_order - b.sequence_order);
  const byBatch = new Map<string, Map<string, { done: number; wasted: number }>>();
  for (const t of tracking) {
    const m = byBatch.get(t.batch_id) ?? new Map();
    const cur = m.get(t.phase_id) ?? { done: 0, wasted: 0 };
    cur.done += t.quantity_completed ?? 0;
    cur.wasted += t.quantity_wasted ?? 0;
    m.set(t.phase_id, cur);
    byBatch.set(t.batch_id, m);
  }
  const waiting = new Map<string, number>(ordered.map((p) => [p.id, 0]));
  const add = (id: string, n: number) => waiting.set(id, (waiting.get(id) ?? 0) + n);
  for (const b of batches) {
    const m = byBatch.get(b.id);
    if (!m) continue;
    const lastLogged = ordered.reduce((acc, p, i) => (m.has(p.id) ? i : acc), -1);
    let prevDone = 0;
    ordered.forEach((p, i) => {
      const cur = m.get(p.id);
      if (cur) {
        if (i > 0) add(p.id, Math.max(0, prevDone - cur.done - cur.wasted));
        prevDone = cur.done;
      } else if (i === lastLogged + 1) {
        add(p.id, prevDone);
      }
    });
  }
  return ordered.map((p) => ({ name: p.name, waiting: waiting.get(p.id) ?? 0 }));
}

/** Phase with the most pieces waiting, or null when nothing is queued. */
export function bottleneckOf(queues: { name: string; waiting: number }[]) {
  const top = queues.reduce<{ name: string; waiting: number } | null>(
    (best, q) => (q.waiting > (best?.waiting ?? 0) ? q : best), null);
  return top;
}
