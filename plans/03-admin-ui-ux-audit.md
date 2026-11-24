# 03 — Admin portal UI/UX audit implementation

Source audit: `../Website-Audit-Images/En-En-Garments-Admin-Portal-UX-Audit.md` (screenshots in the same folder).
Requested 2026-11-24. Decisions confirmed with user:

- **Scope per page:** all *Minor* items + *Major* items that only need data we already store. Majors that need new tables, columns or migrations go to the **Deferred backlog** at the bottom, not built in the page session.
- **Typography:** admin portal headings switch from Playfair Display to Inter. Public site and client portal keep Playfair. Serif stays on the logo/wordmark only.
- **Session 0 first:** one shared-foundation session before any page. Page sessions reuse its pieces instead of inventing their own.
- **Order:** audit's delivery order — Ops pages → Finance pages → Employees / Clients / Inbox → final validation.

## How sessions run

- **One page = one session.** Finish the whole page in that session when possible.
- If a session gets long, stop at a clean point: commit + push, write a `Left off:` line in the status table below and in `progress.md`, then open a new session that continues **the same page** before moving on.
- Each page session:
  1. Read that page's section in the audit + its screenshot, then the page code.
  2. Use Session 0 pieces (badges, empty state, table toolbar, icon-button, confirm dialog). Don't restyle by hand.
  3. Ask the user on any ambiguity (CLAUDE.md rule) — especially copy, which actions to hide in a "More" menu, and anything that looks like it needs a migration.
  4. Verify in the browser on the **test** Supabase project: desktop width + ~375px width, keyboard tab through the page, no console errors.
  5. `npx tsc --noEmit` + `npx vitest run` clean. Add one small test only for new non-trivial logic (filters, aging, grouping).
  6. Update `progress.md` (timestamped), tick the status table here, commit + push.
- **Out of scope everywhere:** the "TEST BUG" / "SECRET …" strings in the screenshots are test-project data, not code. Fix in seed data only if the seed script produces them.

## Status

| # | Session | Main files | Status |
|---|---|---|---|
| 0 | Shared foundation | `index.css`, `AdminLayout.tsx`, `RequestAlertBanner.tsx`, `StaffAssistant.tsx`, new `components/admin/*` | ☑ 24-Nov-2026 |
| 1 | Dashboard | `AdminDashboard.tsx`, `AnalyticsWidget.tsx` | ☐ |
| 2 | RFQ Inbox | `RfqInbox.tsx` | ☐ |
| 3 | Orders | `OrdersAdminPage.tsx`, `KanbanBoard.tsx` | ☐ |
| 4 | Production Batches | `BatchManagementPage.tsx` | ☐ |
| 5 | Pipeline Status | `BatchPipelineStatusPage.tsx` | ☐ |
| 6 | Inventory | `InventoryPage.tsx` | ☐ |
| 7 | Dispatch | `DispatchPage.tsx` | ☐ |
| 8 | Finance Overview | `finance/FinanceDashboard.tsx`, `finance/ApprovalsAndPeriods.tsx` | ☐ |
| 9 | Vendors | `finance/VendorsPage.tsx`, `finance/VendorLedgerPage.tsx` | ☐ |
| 10 | Purchases | `finance/PurchasesPage.tsx` | ☐ |
| 11 | Receivables | `finance/ReceivablesPage.tsx` | ☐ |
| 12 | Expenses | `finance/ExpensesPage.tsx` | ☐ |
| 13 | Finance Reports | `finance/ReportsPage.tsx` | ☐ |
| 14 | Employees | `EmployeesPage.tsx` (+ `WorkerDetailPage.tsx` links) | ☐ |
| 15 | Clients | `ClientsPage.tsx` | ☐ |
| 16 | Inbox | `InboxPage.tsx` | ☐ |
| 17 | Final validation pass | all admin pages | ☐ |

Large files likely to need two sessions: Batches (845 lines), Employees (792), Inventory (567).

---

## Session 0 — Shared foundation

Goal: every later page gets consistent look and behaviour by reusing these, with no workflow changes.

- **Typography:** scope Inter headings to the admin shell (class on the `AdminLayout` root, e.g. `.admin-ui h1…h6 { font-family: var(--font-body) }`). Define a small admin type scale (page title, section title, label, body, meta) in `index.css`.
- **Semantic color tokens** in `index.css` (light + dark): `--success`, `--warning`, `--info`, `--neutral`; red (`--destructive`) only for errors / overdue / delete. Keep navy + gold as brand.
- **Status badge:** one `StatusBadge` (tone + optional icon + text) mapping every status we use (RFQ, order, batch, bill lifecycle, payment state, expense draft/posted). Text always visible, color never the only cue.
- **Global alert:** rework `RequestAlertBanner` from full-width red strip to compact neutral/info notice that links to the queue (RFQ inbox / orders), wraps on small screens. Red only for real incidents. Ask user: dismissible per session or always shown while pending?
- **Shell:** fix sidebar background ending early on long pages (sticky full-height rail, own scroll). Check `StaffAssistant` floating Help button doesn't cover table actions/pagination — add bottom padding to admin content or move it on small screens. Narrow screens: sidebar becomes a drawer (shadcn `sheet` already installed) if it isn't already.
- **Shared pieces** in `src/components/admin/` (only what ≥2 pages will use):
  - `PageHeader` (title, description, primary action slot).
  - `EmptyState` (icon, message, optional next-step button).
  - `TableToolbar` (search input, filter slots, result count, clear-filters).
  - `IconButton` (icon + required `label` → `aria-label` + tooltip, 36px+ hit area).
  - Row "More" menu pattern (shadcn `dropdown-menu`).
  - Reuse existing `ConfirmDialog` / `DeleteConfirmDialog` for destructive actions — don't add a new one.
- **Buttons:** one primary per area; consistent heights, focus ring, disabled state. Use existing `button.tsx` variants; add a variant only if missing.
- **Formatting:** one date format helper and reuse `pkr()` from `finance/shared.tsx` for money everywhere in admin.
- Done when: Dashboard + one finance page look consistent with no per-page edits beyond the shell, typecheck/tests pass.

**Built (24-Nov-2026) — use these in page sessions:**
- `@/components/admin/StatusBadge` — `<StatusBadge status="in_production" />` (map in `STATUSES`), or `<StatusBadge tone="warning" icon={Clock}>text</StatusBadge>`. Tones: success / warning / info / neutral / danger (danger = overdue only).
- `@/components/admin/PageHeader` (`title`, `description`, children = actions). Finance `shared.tsx` `PageHeader` now wraps it (`subtitle` → `description`).
- `@/components/admin/EmptyState`, `TableToolbar` (search, filter children, count + noun, clear), `IconButton` (`label` required, 36px), `MoreMenu` (children = `DropdownMenuItem`s; destructive items open `useConfirm` / `DeleteConfirmDialog`).
- `@/lib/format`: `fmtDate` → "24 Nov 2026", `fmtDateTime` → "24 Nov 2026, 3:42 PM", "—" for empty. Money: `pkr()` from `@/lib/finance`.
- Tailwind colors `success`, `warning`, `info`, `neutral` (with `/10` etc.); type classes `admin-title`, `admin-section-title`, `admin-label`, `admin-body`, `admin-meta`. `font-wordmark` keeps Playfair for the logo.
- Inter headings: `AdminLayout` puts `admin-ui` on `<html>` (so portalled dialogs follow), which sets `--font-heading` to Inter.
- Request notice: compact info box, dismissible; dismissal kept in `sessionStorage` (new tab / sign-out / newer request → shows again).
- Shell: desktop sidebar is already fixed full-height (the audit's "ends early" was a full-page-screenshot artifact); below 768px it is already a Sheet drawer (now has an sr-only title). Main has `pb-24` for the Help button; header truncates email and hides "Sign out" text below `sm`.

---

## Session 1 — Dashboard (`AdminDashboard.tsx`, `AnalyticsWidget.tsx`)

Do:
- Reorder: actionable items first — new RFQs/orders, low-stock items, batches needing attention; each links to a filtered page.
- Metric tiles clickable only when they link somewhere useful; otherwise not styled as buttons.
- Empty charts → `EmptyState` ("No production activity recorded in this period") with the period stated. State chart period.
- Quick Tips → collapsible / dismissible (remember in localStorage), not dominating.
- "Current Bottleneck: None" → wording that reads as a result, with period + rule.
- Major (UI-only): exception-led layout; period selector if metrics are time-based; label counts vs snapshots vs period totals.

Deferred: none expected.

## Session 2 — RFQ Inbox (`RfqInbox.tsx`)

Do:
- Search + count per status; clear filter/search.
- Consistent row layout: company, contact, received date, status badge, short summary.
- Explicit "Open" affordance with keyboard focus; Lost etc. in neutral badge.
- Major (UI-only): RFQ detail view (dialog or side sheet) with full request, contact, status change, existing "Convert to Production Order & Batch". Sort by received date / age; default view = needs response.
- Show lifecycle meaning of each status (short legend/help text).

Deferred: internal notes + per-RFQ history (needs table/columns).

## Session 3 — Orders (`OrdersAdminPage.tsx`, `KanbanBoard.tsx`)

Do:
- Search + filters (status, client, date); hide cancelled by default.
- Remove repeated client name from summary line; use space for current stage / batch link.
- Clear List/Kanban active state + focus ring; consistent open affordance.
- Major (UI-only): order detail view pulling existing data (items, qty, pricing, batch links, payments, production progress, dispatches). Kanban: compact cards, stage moves via explicit control (not drag only). Quick filters: blocked, recently changed.

Deferred: due date / overdue filters (orders have no due-date column — confirm in session).

## Session 4 — Production Batches (`BatchManagementPage.tsx`)

Do:
- Per-row: one main action visible; Multi-Worker Log / QR Labels / Piece Rates / Pack Ratio / Delete in "More" menu (ask user which stays visible).
- Show current stage + progress next to status.
- Consistent ID / order / qty order; delete via `DeleteConfirmDialog` explaining linked-history block.
- `EmptyState` when no batches.
- Major (UI-only): batch detail view grouping stage progress, worker logs, rates, pack ratio, QR labels, dispatch. Compact searchable table with order/stage/status filters. Explicit completed/blocked state + next action.

Deferred: due-date filter (check column exists first).
Likely 2 sessions (845 lines).

## Session 5 — Pipeline Status (`BatchPipelineStatusPage.tsx`)

Do:
- Sticky batch/order column during horizontal scroll + visible scroll cue.
- Quieter empty cells + legend (Done / In progress / Not started / N/A).
- Consistent short stage labels with full name on hover/focus.
- Search/filter by order or batch.
- Major (UI-only): per-batch stage timeline alternative for narrow screens; stage grouping; icon + text so color isn't the only cue; click blocked/active cell → batch.

Deferred: none expected.

## Session 6 — Inventory (`InventoryPage.tsx`)

Do:
- Filters: category, stock condition (low / ok / out); sort by name, qty, reorder status.
- Qty vs reorder point easy to compare; keep exact qty + unit; low-stock text label, not color only.
- "In"/"Out" → clear "Stock in / Stock out" labels or one "Adjust stock" action with tooltip.
- Delete via confirm dialog stating effect on movement history.
- Major (UI-only): per-item movement history from existing `inventory_movements` (date, qty, reason, batch ref); item detail view; compact table with one primary row action + More menu; mobile row-detail layout.

Deferred: supplier/usage context if not stored.
Possibly 2 sessions (567 lines).

## Session 7 — Dispatch (`DispatchPage.tsx`)

Do:
- Required-field marks, inline validation, submit disabled until batch + valid carton count.
- Helper text for Carton Count.
- Carry selected batch into report area (no re-select).
- Consistent history row hierarchy.
- Major (UI-only): show batch remaining qty/cartons + destination before commit; success state; guard against double-submit.

Deferred: tracking/shipment refs, dispatch correction/cancel (unless existing undo covers it — check `change_log`).

## Session 8 — Finance Overview (`FinanceDashboard.tsx`, `ApprovalsAndPeriods.tsx`)

Do:
- Reporting period + short KPI definitions on screen; "includes drafts" note next to affected values.
- Empty chart months clearly "no activity"; legend.
- Approvals area visually separate from read-only summaries; toast confirmation for Approve/Undo.
- `pkr()` everywhere; overdue = text + icon, not red only.
- Major (UI-only): layout around decisions (cash position, overdue, approvals, recent movement) with drill-through links; period selector; draft vs posted shown in totals.

Deferred: none expected.

## Session 9 — Vendors (`VendorsPage.tsx`, `VendorLedgerPage.tsx`)

Do:
- Disable/hide Pay on zero balance with reason.
- Filters: category, payable status; clear Show inactive state.
- Due-date context on balances (bills have `due_date`).
- Vendor name opens existing ledger page; pencil gets label/tooltip.
- "No contact added" instead of dash.
- Major (UI-only): ledger page shows contact, bills, payments, terms; Pay opens payment flow listing eligible bills + balance + confirm; aging from existing `agingSummary`.

Deferred: payment terms field if not stored.

## Session 10 — Purchases (`PurchasesPage.tsx`)

Do:
- Split bill lifecycle (Draft/Posted) and payment state (Unpaid/Partial/Paid/Overdue) into two clearly labeled columns.
- Clear Bills/Payments tab + status filter state; search by ref/vendor + result count.
- Aligned action column; reason when Void unavailable; Void via confirm dialog with effect described, not peer to Pay.
- Major (UI-only): bill detail view (lines, due date, payments, balance, posting state, `change_log` history); due-soon/overdue quick view; sortable by due date / vendor / amount / balance.

Deferred: none expected.

## Session 11 — Receivables (`ReceivablesPage.tsx`)

Do:
- "N orders excluded (no total)" → link to those orders + show effect on totals.
- Aging / due info per client (reuse `agingSummary`).
- Receive opens flow showing client + amount due before submit.
- Short explanation of By client / Client ledger / Receipts tabs; search + count.
- Major (UI-only): aging grouped view with drill-through; receipts tied to client + order, partial + remaining balance; totals match Finance Overview + Reports.

Deferred: invoice-level due dates if orders lack one.

## Session 12 — Expenses (`ExpensesPage.tsx`)

Do:
- Headline total says whether drafts included and follows filters.
- Draft vs Posted explained; actions consistent per state.
- "—" / "No notes" explicit for empty notes; search + sortable columns.
- Edit icon via `IconButton`; approval/undo placement consistent.
- Major (UI-only): expense detail/edit with approval history (`change_log`); optional "drafts only" review tab; category trend by period.

Deferred: receipt attachments (needs storage + column).

## Session 13 — Finance Reports (`ReportsPage.tsx`)

Do:
- Selected report type unmistakable; date range shown in output, CSV filename and print header.
- Consistent negative format (parentheses or minus — ask user) + right-aligned amounts.
- Accrual-basis note → short "How this report is calculated" disclosure.
- Same currency/terms across tabs.
- Major (UI-only): every report has title + period + key total + same table shape; empty state per report; report lines link to source records where practical.

Deferred: none expected.

## Session 14 — Employees (`EmployeesPage.tsx`)

Do:
- Row actions: common action visible; Grant Manager / Permissions / Worker Role in More menu.
- Same summary layout for workers and staff; pay type as text badge.
- Filters: role, department/skill, pay type + result count.
- Create-account form → collapsible or dialog (ask user).
- Narrow-width check.
- Major (UI-only): compact table + link to existing `WorkerDetailPage`; pagination for long list; role/permission change shows current → new + confirm (permission history already logged via IMP-13).

Deferred: none expected.
Likely 2 sessions (792 lines).

## Session 15 — Clients (`ClientsPage.tsx`)

Do:
- Search + client count + visible sort.
- "Client Account" pill → plain status label (not button-like).
- Compact table rows.
- Major (UI-only): client detail view from existing data (orders, RFQs, inbox messages, receipts/payments); row action = open detail; active-order count / last activity in list.

Deferred: client status field if not stored (check).

## Session 16 — Inbox (`InboxPage.tsx`)

Do:
- Sender identity + related worker/client/order/batch on each message.
- Visible label on reply field; separate "Send reply" and "Mark resolved" (ask user if resolve should also send).
- Use full width: queue list + selected-message panel; stacked on narrow screens.
- Unread/new + last-updated meta.
- Major (UI-only): queue panel with search + status/age filters; clear selected state; documented reply / resolve / reopen behavior using existing statuses.

Deferred: true conversation threads (multi-message history), assignment, escalation — need schema.

## Session 17 — Final validation pass

- Walk every admin page at desktop, tablet (768px), phone (375px).
- Keyboard-only run, 200% zoom, visible focus, contrast spot-checks.
- Empty / loading / error / success / destructive states on representative pages.
- Fix small leftovers; anything bigger → new item in Deferred backlog.

---

## Deferred backlog (needs schema / migration — not in page sessions)

Collected from page sessions; each item gets its own session later.

- RFQ internal notes + history.
- Order due dates + overdue filters.
- Dispatch tracking refs + correction/cancel flow.
- Vendor payment terms.
- Expense receipt attachments.
- Inbox conversation threads, assignment, escalation.
- (add more as sessions find them)
