// Staff help knowledge base (plans/02 part D). The assistant answers "how do I"
// questions ONLY from this text. Keep it in sync with the app; it also doubles
// as a short operator manual for anyone setting up a copy of the system.
export const KB = `
# GarmentFlow staff guide

## Portals and who uses them
- Admin portal: /admin. Admin, staff and managers. Every section needs a permission (View / Add / Edit / Delete, and Approve for Finance). Admin has everything. Managers oversee departments; each manager sees and does only what the admin ticked in their permissions (there is no batch assignment).
- Worker portal: /factory. Workers sign in with mobile number + SMS code. Bottom tabs: Log Entry, My Work, Inbox, Restock (accessories department only).
- Client portal: /client-portal (clients only, separate).

## Production flow (department order)
1 Accessories → 2 Cutting → 3 Sticker / Printing / Embroidery (any of the three, in parallel) → 4 Quality → 5 Lot Bundling → 6 Stitching (sub-departments: Singer, Overlock, Flatlock, Lock Stitch) → 7 Button Ops → 8 Clipping → 9 Press → 10 Quality Final → 11 Packing → Dispatch.
A department can only start when the earlier step is closed.

## Worker: logging work (Log Entry)
1. Open Log Entry and scan the batch QR card. Use the START QR when you begin and the END QR when you finish.
2. Starting sends a verification message to the admin. The END scan stays blocked until the admin accepts the start.
3. Fill the department form (pieces, waste, etc.). Rates and costs are set by admin and shown read-only.
4. Save. Your entry appears under My Work. If you made a mistake, tell the admin through Inbox. Workers cannot edit entries.
- Camera scanning needs https. If the camera does not open, ask the admin.

## Worker: Inbox
Shows whether your start/end was accepted, denied or sent back (reprocess). You can send a free-text question to the admin.

## Worker (accessories): Restock
Top up an existing accessory or register a new variant. Fabric restock is admin/staff only.

## Admin: Inbox (worker and client)
- Start verification: Accept (enables the END scan) or Deny.
- End verification: Accept (closes the department), Deny, or Reprocess (send back for rework).
- Client queries: write a reply and Mark Resolved.
- Every decision asks for confirmation and can be undone for 10 minutes (Undo toast, or the clock icon "Recent changes" in the header).

## Orders
- New Order (Orders > Add). Open an order to change status (pending, in production, QC, shipped, delivered, cancelled), tracking number, and a note the client sees. Saving asks for confirmation and can be undone for 10 minutes.
- Issue Client Access Code: one-time code so the client can activate the portal.
- Set the order's total amount; receivables only count priced orders.
- New RFQ or client direct order: every admin, manager and staff member gets a bell alert and an email, and a red banner shows on every admin page until the RFQ leaves "new" or the order leaves "pending".

## Batches
- New Batch (Batches > Add) under an order. Print QR Labels (START and END cards).
- Piece Rates and Department Rates set what workers earn per piece. Only people with the "Piece & department rates: Manage" permission can change them. Pack Ratio sets the size mix.
- Manager Entry (manual entry from a supervisor's paper slip): sidebar Manager Entry (or Manager Entry on a batch). Pick batch, department, work date (past dates allowed), then one row per worker: pieces done, wasted (cutting: panel + panels done). Tick "Department finished" on the last slip. Saving sends it to the owner's Inbox; ONLY the owner (admin) accepts (pay counts, department closes if ticked) or denies (rows deleted). Needs Batches edit permission. Accessories is not entered here.
- Running orders / stages a batch does not use: on the batch detail, the owner uses "Mark done / not needed" on a stage (Done before system, or Not needed). No pieces, no pay; undoable. Needed so the next department's gate opens.
- Cancel batch asks for confirmation and can be undone for 10 minutes.

## Pipeline Status
Shows every batch and which department is open, closed or waiting. Use it to answer "where is this batch".

## Dispatch
Pick a batch, date, cartons, carrier, note, then Log Dispatch (confirmation, undo for 10 minutes). The batch report shows the full department history.

## Inventory
Add Item (unit, category, reorder level). In / Out buttons record stock movements (confirmation shown). Linked purchase bills also add stock automatically.

## Employees
- Create New Employee Account: name + Pakistani mobile number. The worker signs in with SMS code.
- Edit department and skills. Wage type (dihaari per piece or monthly salary) and pay amounts need "Payroll: Manage". A non-admin with that permission cannot change their own pay or an admin's pay.
- Permissions (admin only): tick the actions per section (View / Add / Edit / Delete, Approve for Finance, Manage for rates and payroll). Any action also turns on View. Every change is saved in the member's permission history (who, what, when, old → new) and alerts all admins and the member by email and the bell icon.
- Payout ledger: weekly dihaari & salary totals, CSV download. Needs "Payroll: View".

## Finance
- Vendors: suppliers (fabric, accessories, services). Each vendor has a ledger (opening balance + bills − payments).
- Purchases: New bill with lines. A line linked to an inventory item adds that stock.
- Payments / Receipts / Expenses are saved as DRAFT first (confirmation shows amount and party).
- Undo a draft: the creator can undo for 10 minutes. After that, someone with Finance > Delete/Void can remove a draft.
- Approve (maker-checker): someone with Finance > Approve, who did NOT create the entry, approves it. It becomes POSTED. Admin self-approval is allowed but recorded.
- Posted entries cannot be edited or deleted. To correct one, use Void (reason required). This posts an opposite (reversal) entry dated today, and both stay in the ledger. A voided bill also reverses its stock.
- Closed month: admin closes months under Finance > Overview > Accounting periods. Nothing dated in a closed month can be added, edited, approved or voided. Admin can re-open with a reason (logged). Fix mistakes in an open month with an adjustment or void.
- Totals and reports include drafts, tagged DRAFT, until they are approved.
- Reports: Profit & Loss, Cash/Bank book, Payables aging, Receivables aging, Purchases by vendor, Expenses by category. Every table exports CSV or Print/PDF.

## Undo summary
- Unsaved form: Cancel.
- Saved draft / status change: Undo within 10 minutes (same person).
- Posted finance entry: Void (offsetting entry) until the month is closed.
`;
