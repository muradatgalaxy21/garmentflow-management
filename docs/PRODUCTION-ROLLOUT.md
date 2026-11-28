# GarmentFlow: Production Rollout Plan

Status: DRAFT v3, 28-Nov-2026, 27-Nov-2026. Open questions are marked **Q**. Answer them and this file becomes the working plan.

## 1. The idea in one paragraph

For the first 2 to 3 months only the owner and one manager use the system. No supervisor or worker logs in. Supervisors keep paper exactly as today (daily slips, registers) and the owner or manager types the same numbers into the system. Paper and system run side by side. Each week the two are compared. When a department's numbers have matched for 4 weeks in a row, that department is handed to its workers (QR scan on the floor), one department at a time. Paper is dropped for a department only after its workers have run cleanly for another 2 to 4 weeks.

## Decisions so far

| Date | Decision |
|---|---|
| 27-Nov-2026 | Office-only entry for 2 to 3 months: owner + one manager. Supervisors hand in daily paper slips. Workers phase 3 onward |
| 27-Nov-2026 | Material blocks warn on the batch; worker form shows a red notice but still allows submit |
| 27-Nov-2026 | Garments produced = Packing END (fallback Quality Final END). Cutting stays panel-wise |
| 27-Nov-2026 | Material usage linked in the database (movement -> batch, department, entry) |
| 28-Nov-2026 | Running orders: opening position (departments already done marked "done before system", no pay) |
| 28-Nov-2026 | Manager enters; ONLY the owner accepts entries and closes departments (for now) |
| 28-Nov-2026 | Dihaari pay mostly weekly but varies: do not fix a pay period in the system yet |
| 28-Nov-2026 | Materials list per style: yes |
| 28-Nov-2026 | Advances (peshgi) must be recordable and deducted from later pay, even if rare |
| 28-Nov-2026 | Unknown until Monday: batches running at once, running orders by stage, worker list format (paper or Excel) |

## Build order

1. **Before Monday:** Manager Entry (6.1) + "done before system" for running batches. Without these nothing can be entered properly.
2. **Before the first payday run in the system:** wages paid + advances record (6.4).
3. **After Monday:** store issues linked to batch and department (6.2), materials list per style + blocks (6.3), counting fix (6.5).
4. **If the worker list is in Excel:** bulk worker import. Otherwise workers are added one by one on the Employees page.


## 2. Who does what

Only two people type into the system: the owner and one manager. Department supervisors never touch it in phases 1 and 2. They hand in paper.

| Role | Who | Does | 
|---|---|---|
| Owner (admin) | Owner | Orders, batches, rates, approvals, closing departments, finance entries, weekly check |
| Manager (helper) | 1 manager | Work entries from supervisor slips, store issues, dispatch. Owner reviews |
| Supervisors | 1 per department | Fill a **daily slip** on paper (see below) and hand it in at shift end. No system use |
| Store keeper (accessory guy) | | Keeps the store issue register on paper. Manager types it in |
| Workers | | Nothing until phase 3 |

### Supervisor daily slip (one per department per day)

Same layout every day so typing it in is fast:

```
Date: ____  Department: ________  Supervisor: ________
Batch / style | Worker | Pieces done | Wasted | Panel (cutting only) | Material taken from store
```

### Keeping the load manageable for two people

- Enter work **per batch per department when that department finishes the batch** (one sitting per batch), not every day. Daily slips are kept and stapled per batch until then. Daily entry only for batches running longer than a week, so the weekly payout stays right.
- Store issues: enter twice a week from the store register.
- Finance: once a week (bills, payments, expenses), client payments when they arrive.
- Rough load: 1 to 1.5 hours a day split between owner and manager. **Q1** Check this against how many batches run at once.

## 3. What goes into the system, and when

| Data | Entered by | When | Screen |
|---|---|---|---|
| Client, order (qty, price, delivery date) | Admin | When the order is confirmed | Orders |
| Batch (style, qty, fabric) | Admin | When cutting is planned | Batches |
| Department rates (per piece, per panel for cutting) | Admin | Before the batch starts | Batches → Rates |
| Work: department, batch, worker, pieces done, wasted | Manager (from supervisor slips) | When a department finishes a batch (weekly for long batches) | Manager entry (see 6.1) |
| Material issued to department for batch | Manager (from store register) | Twice a week | Inventory → Issue (see 6.2) |
| Purchases (kapra, accessories) | Owner | When the bill arrives | Finance → Purchases (adds stock automatically) |
| Vendor payment | Owner | When paid | Finance → Purchases |
| Client payment | Owner | When received | Finance → Receivables |
| Expenses (rent, bijli, gas, transport) | Owner | Weekly | Finance → Expenses |
| Wages | Automatic for dihaari (pieces × rate). Monthly salary from the employee's pay record | Weekly / monthly | Employees → Payout ledger |
| Wages actually paid, advances (peshgi) | Owner | When paid | **Not in the system yet** (see 6.4) |
| Dispatch (cartons, carrier) | Manager | On shipment | Dispatch |

## 4. Orders already running

Do not re-enter history. Pick one of three by where the order is:

| Where the order is today | What to do |
|---|---|
| Not cut yet | Enter as a normal new order and batch. Track fully. |
| In production (cut, stitching, finishing) | Enter order and batch with an **opening position**: mark the departments already finished as "done before system" (no pieces, no pay). Track from the current department onward. Pay for work done before Monday stays on paper. |
| Packed / about to ship | Do not enter in production. Enter only the order and client payments in Finance so receivables are right. |

**Opening stock:** on the first day, count stock (fabric, accessories) and enter it once as an opening balance per item. From then on stock only moves through purchases, issues and returns.

**Q2.** How many orders are running now, and roughly how many in each of the three rows above?

## 5. Timeline

| Phase | Weeks | What | Done when |
|---|---|---|---|
| 0. Setup | before Monday | Users for office staff; worker list (profiles, no login); departments; rates; opening stock; running orders entered (section 4) | Every running batch visible on Pipeline Status |
| 1. Parallel run, office only | weeks 1 to 4 | Supervisor slips typed in per batch, store issues, finance entries. Weekly compare with registers | Owner trusts the weekly totals |
| 2. Parallel run continues | weeks 5 to 12 | Same, plus monthly close in Finance. Fix mismatches at the source | 4 weeks in a row with matching totals per department |
| 3. Hand over one department | from month 3 | Workers of one department scan QR at START / END. Manager approves. Paper continues for that department | 2 to 4 clean weeks |
| 4. Next departments | one every 2 to 4 weeks | Repeat phase 3 | |
| 5. Paper off | per department | Stop the register for a department that passed phase 3 | |

Suggested hand-over order: Packing, then Press and Clipping (simple counts, few workers), then Cutting (panel rates, fabric), then Quality, Stitching last (most workers, most entries).

**Q3.** Agree with this order, or do you want to start with a department whose manager is most comfortable with phones?

## 6. Gaps to build before or during phase 1

These came out of checking the code on 27-Nov-2026. They matter because the plan is office-only entry.

### 6.1 Manager entry must feed the real pipeline (MUST, before Monday if possible)

Today the manager "log on behalf" screen writes to an old table (`batch_tracking`). The new pipeline (Batches, Pipeline Status, approvals, END pay, garments produced, blocks) reads a different table (`department_entries`). So entries a manager types today do not move the batch forward on Pipeline Status.

Fix: one **Manager Entry** screen: pick batch, department, date (allow yesterday and earlier for register catch-up), then one row per worker (pieces done, wasted; panel type for cutting). Saving writes START + END for those workers, prices them with the department rate, and lets the manager close the department. Same data as when workers do it themselves later, so nothing changes at hand-over.

### 6.2 Material issue linked to batch and department (MUST for traceability)

Store keeper issues material from the store to a department for a batch, like the store issue register: item, quantity, department, batch, optional worker, date. Returns (unused) go back the same way. Stock moves automatically. This answers "which items, how much, which department, which batch, which order" without asking every worker to log materials. Used = issued minus returned. Wasted recorded where known (cutting).

Database: add `batch_id`, `department`, `entry_id`, `worker_id` (optional) to `inventory_movements`, with foreign keys, plus a view per batch / order / item.

### 6.3 Material blocks (SHOULD, phase 1)

A batch is blocked by an item only if the batch needs that item. The connection comes from a **materials needed list per batch** (item, quantity per garment), entered with the batch. When stock of a listed item is at or below reorder level, or out, the batch shows the block with the item name and cause, and clicking opens Inventory on that item. Clears itself when stock is restocked. Kept as history.

**Q4.** Can managers give a materials list per style (buttons per shirt, zips, labels, thread)? If not, blocks can only come from issues that failed (store had too little).

### 6.4 Wages paid and advances (SHOULD, before first payday)

The ledger calculates what is owed (pieces × rate, salaries). It does not record what was actually paid or advances (peshgi) and their recovery. Without it the system cannot replace the wage register.

**Q5.** Is pay weekly or monthly for dihaari? Do you give advances, and how are they recovered?

### 6.5 Counting fix (SHOULD)

Payout ledger headline adds every department's pieces together, so one garment through 10 departments shows as 10. Change: "Work units paid" per worker (for pay), "Garments produced" per batch from Packing END (fallback Quality Final END), department counts always labelled with the department. Cutting stays panel-wise.

## 7. Weekly check (every Saturday, 30 minutes)

1. Per department: system pieces vs register pieces for the week. Difference over 2%: find the day and fix.
2. Payout ledger vs wage register.
3. Stock count of 5 random items vs system.
4. Purchases and payments vs cash book.
5. Write the result in a one-line log (date, department, match yes/no).

## 8. Training (when a department is handed over)

- 30 minutes with the department supervisor first; supervisor trains the workers.
- One printed card per department in Roman Urdu: scan QR, START, END, what to enter.
- First week: supervisor stands at the scan point at shift end. Owner or manager approves.

## 9. Open questions

- **Q1** How many batches run at the same time (to size the daily entry load)?
- **Q2** Running orders: how many, in which stage.
- **Q3** Department hand-over order.
- **Q4** Materials list per style possible?
- **Q5** Wage period and advances.
- **Q6** Do workers need any login during phases 1 and 2 (for example to see their own pieces)? Suggested: no.
- **Q7** Should the manager be able to close departments and accept entries, or only the owner? Suggested: manager enters, owner approves.
