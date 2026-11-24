# 01 — Finance Module + Permission-Based Admin Access

Requested 2026-11-21. Decisions confirmed with user the same day:
- Scope: **everything** — vendor payables, client receivables, worker wages in P&L, other expenses.
- Purchase lines **optionally** link to an inventory item; linked lines auto-add stock (`inventory_movements` 'in').
- Access: **permission-based, whole admin portal** (not just roles). Admin assigns specific sections to each manager/staff.
- Finance permissions: **`finance.view` / `finance.edit` split**. Deletes stay admin-only.
- Export: **CSV + print/PDF** (browser print window). No new dependency.

## Part A — Permissions

| Key | Section |
|---|---|
| `rfqs` | RFQ Inbox |
| `inbox` | Worker Inbox |
| `inventory` | Inventory |
| `orders` | Orders |
| `batches` | Batches + Pipeline Status |
| `dispatch` | Dispatch |
| `employees` | Employees |
| `clients` | Clients |
| `finance.view` | Finance dashboard, ledgers, reports (read) |
| `finance.edit` | Add/edit vendors, bills, payments, receipts, expenses (implies view) |

- Table `user_permissions(user_id, permission)` + `has_permission(uid, perm)` SQL fn (admin → always true; `finance.edit` implies `finance.view`).
- Admin = all. Dashboard always visible to anyone in the admin portal.
- **Enforcement:** nav + route guard in UI for every section; **RLS** on all new finance tables. Existing (non-finance) tables keep their current role-based RLS — tightening those per-permission is a later pass (noted in plan.md §11).
- Backfill: existing `staff` users get every non-finance permission (no access lost). Managers start empty — admin grants.
- Fix: `AdminLayout` currently blocks `manager` role (only checks admin/staff). Now: admin/staff/manager enter, then per-permission.
- UI: Employees page → "Permissions" button (admin only) on manager/staff cards → checkbox dialog.

## Part B — Finance data model (one migration)

- `vendors` — name, category, contact, phone, address, opening_balance, active flag.
- `vendor_bills` — vendor, bill_no, bill_date, due_date, notes, `total_amount` (kept in sync by trigger from lines).
- `vendor_bill_items` — description, optional `inventory_item_id`, qty, unit, unit_price, amount (generated). Trigger: linked line insert → stock 'in'; delete → stock 'out' (reversal). Lines are insert/delete only (edit = replace).
- `vendor_payments` — vendor, optional bill (null = on-account/advance), amount, date, method, reference.
- `client_payments` — client (profile), optional order, amount, date, method, reference. Receivable = non-cancelled `orders.total_amount` − receipts.
- `expenses` — category (rent, electricity, gas, transport, maintenance, repairs, office, misc…), amount, date, method, paid_to.
- View `vendor_bill_balances` (security_invoker) — paid, balance, status unpaid/partial/paid/overdue.
- Methods: cash, bank, cheque, jazzcash, easypaisa, other.
- RLS: select = `finance.view`; insert/update = `finance.edit`; delete = admin. Extra SELECT policies on `orders`, `profiles`, `department_entries`, `inventory_items` for `finance.view` (needed for receivables, wages, line linking).

## Part C — UI (`/admin/finance/*`, sidebar group "Finance")

1. **Dashboard** — payable, overdue payable, receivable, this-month purchases/expenses/receipts, net cash flow, 6-month in-vs-out chart, bills due in next 14 days, top vendor dues.
2. **Vendors** — list with balance, add/edit; vendor detail = ledger (opening + bills − payments, running balance, date range) + pay button.
3. **Purchases** — bills list (filter vendor/status), new bill with line items (inventory link optional), record payment against bill, payments history.
4. **Receivables** — per-client due (orders − receipts), record receipt, client ledger.
5. **Expenses** — list/filter, add/edit, category totals.
6. **Reports** (date range) — Profit & Loss, Cash/Bank book (by method), Payables aging (0–30/31–60/61–90/90+), Receivables aging, Purchases by vendor, Expenses by category. Each: CSV + Print.

### P&L definitions (accrual)
- Revenue = `orders.total_amount` of non-cancelled orders, by order date.
- Purchases = vendor bills by bill date.
- Wages = piece-rate `department_entries.total_cost` in wage-bearing depts (same list as Employees payout ledger) + monthly salaries pro-rated by days in range (`base_salary × days / 30`).
- Expenses = expenses by date.
- Net profit = Revenue − Purchases − Wages − Expenses.

## Done when
- Migration + types added, `tsc`/build/tests pass, finance helper self-check test passes.
- plan.md + progress.md updated, pushed.
- Live DB: migration still needs `supabase db push` (manual — not applied by this work).
