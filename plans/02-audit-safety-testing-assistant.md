# 02 — Audit-safe finance, undo, confirmations, staff assistant, mock data + test checklist

Requested 2026-11-21. Decisions confirmed with user:
- Mock data goes into a **separate Supabase test project** (never live).
- Staff assistant: **read-only**, sees only what the asking user's permissions allow.
- Confirmation popups: money, deletes + status changes, inventory stock changes.
- Undo follows the user's GAAP/IFRS table:

| Record state | User action | Limit | Backend |
|---|---|---|---|
| Unsaved form | Cancel / discard | until Save | form state reset |
| Saved draft | Toast Undo / Revert | 10 min or until approved | soft delete / state rollback |
| Posted ledger | Void / credit note | until accounting period closes | offsetting entry |

- Posting is **maker-checker**: new `finance.approve` permission; the creator can't approve their own entry (admin override is allowed and recorded).
- Balances/reports **include drafts, tagged** as draft.
- **Admin closes months**; closed month = no new/edit/post/void dated in it; admin can re-open (logged).
- Undo scope: finance entries + status changes (order status, batch cancel, dispatch log, inbox decisions).
- Built locally in this session (no cloud session).

## A. Finance lifecycle (migration 20261121030000)
- `vendor_bills`, `vendor_payments`, `client_payments`, `expenses` get: `status` draft|posted|discarded, `posted_at/by`, `self_approved`, `discarded_at/by`, `reverses_id`, `voided_by_id`.
- Draft: editable with finance.update. Creator can **discard** (soft delete) within 10 min; finance.delete can discard any draft.
- Post: `post_finance_entry(table, id)` RPC — needs finance.approve, approver ≠ creator unless admin (flagged `self_approved`).
- Posted rows are immutable (trigger). **Void** = `void_finance_entry(table, id, reason)` creates an offsetting posted row (negative amount, `reverses_id`), dated today, and marks the original. For bills, the credit note copies lines with negative qty, so linked stock goes back out.
- `accounting_periods` + `accounting_period_events`; trigger blocks any write dated in a closed month. Admin-only `close_period` / `reopen_period`.
- Hard DELETE removed for these four tables (bill lines still replaceable while the bill is a draft).

## B. Status-change undo (same migration)
- `change_log(table_name, row_id, op, old_values, new_values, changed_by, changed_at, action_id, label, undone_at)`; triggers on orders, production_batches, batch_dispatches, order_updates, worker_inbox_messages, client_inbox_messages, batch_department_status.
- Client: `server_now()` before an action → after it `tag_my_changes(since, label)` groups my rows into one action → `undo_action(action_id)` (same user, ≤10 min, refuses if the row changed again since).
- UI: Undo toast after the action + "Recent changes" button in the admin header (last 10 min, own actions).

## C. Confirmations
- One `ConfirmProvider` / `useConfirm()` (AlertDialog) replacing `window.confirm` in admin; shows amount/party summary for money; destructive styling for deletes/voids.

## D. Staff assistant
- Edge function `staff-assistant` (Gemini, same key as public `chat`), **auth required**, never used on public pages.
- Tools run with the caller's JWT (RLS): `find_order`, `find_batch` (stage progress), `list_my_open_work`. Help answers come from `kb.md` (procedures per section), shipped with the function.
- Guardrails: scope-locked system prompt, refuses off-topic/prompt-injection, no write tools, answers only from tool/KB data, per-user rate limit, message/history caps.
- UI: help icon in AdminLayout + FactoryLayout (Roman Urdu/Urdu/English replies).

## E. Mock data + manual test checklist
- `scripts/seed-mock-data.ts`: refuses to run against the live project ref; creates admin/staff/managers (with permission sets), workers per department (test phone numbers), clients, inventory, vendors, orders, batches at different pipeline stages, finance drafts/posted. Re-runnable (reuses existing mock rows); to start clean, reset the test project. Writes credentials to `mock-users.out.md` (gitignored).
- `docs/TESTING-CHECKLIST.md`: role-by-role and feature-by-feature checklist with expected results, status column, and bug / improvement log tables.

## Done when
Migrations verified on local replay; tsc/tests/build clean; plan + progress updated; pushed. Live/staging application stays manual.

## Status (2026-11-21 17:36)
- A–E built and pushed; migrations 030000 + 040000 applied live.
- Extra: password recovery flow (`/reset-password`).
- Pending: browser click-through, edge function deploy + Help bot test, test project + seed run + checklist pass.
