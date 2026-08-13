import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// plan.md §9.6 — static regression guard: every `public.*` table created by a
// migration must also have `ENABLE ROW LEVEL SECURITY` somewhere in the
// migration history. Catches "added a table, forgot RLS" before it ships,
// without needing a live Postgres/Supabase instance in CI.
const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf-8"))
    .join("\n");
}

describe("RLS coverage — every table has ENABLE ROW LEVEL SECURITY", () => {
  it("has no public table missing an RLS-enable statement", () => {
    const sql = allMigrationSql();

    const created = new Set(
      [...sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? public\.(\w+)/gi)].map((m) => m[1])
    );
    const rlsEnabled = new Set(
      [...sql.matchAll(/ALTER TABLE public\.(\w+) ENABLE ROW LEVEL SECURITY/gi)].map((m) => m[1])
    );

    const missing = [...created].filter((t) => !rlsEnabled.has(t));
    expect(missing).toEqual([]);
  });

  it("sanity: the migration scan actually found tables (fixture didn't break)", () => {
    const sql = allMigrationSql();
    const created = [...sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? public\.(\w+)/gi)];
    expect(created.length).toBeGreaterThan(20);
  });
});
