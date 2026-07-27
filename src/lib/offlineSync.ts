import { openDB, type IDBPDatabase } from "idb";
import { supabase } from "@/integrations/supabase/client";

// ------------------------------------------------------------
// Offline Sync Manager
//
// This module provides a reliable offline-first queue for
// batch_tracking submissions. When a worker submits an entry
// on the factory floor:
//   1. If online  -> POST directly to Supabase
//   2. If offline -> Store in IndexedDB and sync later
//
// The sync process is triggered automatically when the
// browser comes back online or gains visibility.
// ------------------------------------------------------------

/** Shape of a queued tracking entry before it is synced */
export interface QueuedEntry {
  /** Auto-incremented local ID for ordering */
  id?: number;
  /** ISO timestamp of when the entry was created locally */
  created_at: string;
  batch_id: string;
  phase_id: string;
  worker_id: string;
  quantity_completed: number;
  quantity_wasted: number;
  notes: string | null;
  /** Number of failed sync attempts (for retry backoff) */
  retry_count: number;
}

const DB_NAME = "enen_factory_offline";
const DB_VERSION = 1;
const STORE_NAME = "pending_tracking";
const MAX_RETRIES = 5;

/**
 * Opens (or creates) the IndexedDB database used for
 * offline queue storage. The schema is versioned so
 * future migrations can add stores without data loss.
 */
async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // 1. Create the object store for pending entries
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    },
  });
}

/**
 * Adds a tracking entry to the offline queue.
 * Called when the device is offline or when a direct
 * Supabase insert fails due to network issues.
 */
export async function enqueueEntry(entry: Omit<QueuedEntry, "id" | "retry_count">): Promise<void> {
  try {
    const db = await getDb();
    await db.add(STORE_NAME, { ...entry, retry_count: 0 });
  } catch (err) {
    console.error("[OfflineSync] Failed to enqueue entry:", err);
    throw err;
  }
}

/**
 * Returns the count of entries currently waiting in the
 * offline queue. Used to display a "pending sync" badge
 * in the factory UI.
 */
export async function getPendingCount(): Promise<number> {
  try {
    const db = await getDb();
    return await db.count(STORE_NAME);
  } catch {
    return 0;
  }
}

/**
 * Returns all pending entries from the offline queue,
 * ordered by their auto-incremented ID (insertion order).
 */
export async function getPendingEntries(): Promise<QueuedEntry[]> {
  try {
    const db = await getDb();
    return await db.getAll(STORE_NAME);
  } catch {
    return [];
  }
}

/**
 * Attempts to sync all pending entries to Supabase.
 * Each entry is sent individually to isolate failures.
 * Successfully synced entries are removed from the queue.
 * Failed entries have their retry_count incremented.
 *
 * Returns the number of successfully synced entries.
 */
export async function syncPendingEntries(): Promise<number> {
  // 1. Only attempt sync when the browser reports online
  if (!navigator.onLine) return 0;

  const db = await getDb();
  const entries = await db.getAll(STORE_NAME);

  if (entries.length === 0) return 0;

  let synced = 0;

  for (const entry of entries) {
    // 2. Skip entries that have exceeded max retries
    if (entry.retry_count >= MAX_RETRIES) {
      console.warn(
        `[OfflineSync] Entry ${entry.id} exceeded max retries, skipping`
      );
      continue;
    }

    try {
      // 3. Attempt to insert the tracking entry into Supabase
      const { error } = await supabase.from("batch_tracking").insert({
        batch_id: entry.batch_id,
        phase_id: entry.phase_id,
        worker_id: entry.worker_id,
        quantity_completed: entry.quantity_completed,
        quantity_wasted: entry.quantity_wasted,
        notes: entry.notes,
      });

      if (error) {
        // 4. If the insert failed, increment retry count
        console.error(`[OfflineSync] Sync failed for entry ${entry.id}:`, error);
        await db.put(STORE_NAME, {
          ...entry,
          retry_count: entry.retry_count + 1,
        });
        continue;
      }

      // 5. On success, remove the entry from the queue
      await db.delete(STORE_NAME, entry.id!);
      synced++;
    } catch (err) {
      // 6. Network error or other failure
      console.error(`[OfflineSync] Network error for entry ${entry.id}:`, err);
      await db.put(STORE_NAME, {
        ...entry,
        retry_count: entry.retry_count + 1,
      });
    }
  }

  return synced;
}

/**
 * Registers global event listeners for automatic sync.
 * Should be called once when the factory module mounts.
 *
 * Listens for:
 *   - 'online' event: triggers sync when network returns
 *   - 'visibilitychange': triggers sync when user returns
 *     to the browser tab (covers mobile app switching)
 */
export function registerSyncListeners(): () => void {
  const handleOnline = () => {
    syncPendingEntries().catch(console.error);
  };

  const handleVisibility = () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      syncPendingEntries().catch(console.error);
    }
  };

  // 1. Attach event listeners
  window.addEventListener("online", handleOnline);
  document.addEventListener("visibilitychange", handleVisibility);

  // 2. Return cleanup function for React useEffect
  return () => {
    window.removeEventListener("online", handleOnline);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}
