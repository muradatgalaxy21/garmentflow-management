import { useEffect, useState } from "react";
import { Plus, Loader2, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, AlertTriangle, PackageX, CheckCircle2, PackageSearch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/admin/PageHeader";
import { TableToolbar } from "@/components/admin/TableToolbar";
import { StatusBadge, type Tone } from "@/components/admin/StatusBadge";
import { EmptyState } from "@/components/admin/EmptyState";
import { MoreMenu } from "@/components/admin/MoreMenu";
import { fmtDateTime } from "@/lib/format";
import {
  filterAndSortItems, stockCondition, fmtQty, NO_CATEGORY,
  type InventorySort, type StockCondition, type StockFilter,
} from "@/lib/inventoryView";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { UNITS, UNIT_LABELS } from "@/lib/units";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";

const CATEGORY_SUGGESTIONS = ["fabric", "accessory", "sticker", "trim", "packaging", "finished_good"];

interface OngoingBatch {
  id: string;
  style_number: string;
  status: string;
  order_number: string | null;
  party_name: string | null;
}

interface Movement {
  id: string;
  type: "in" | "out" | "adjust";
  quantity: number;
  reason: string | null;
  created_at: string;
}

const CONDITION_UI: Record<StockCondition, { tone: Tone; label: string; icon: typeof AlertTriangle }> = {
  out: { tone: "danger", label: "Out of stock", icon: PackageX },
  low: { tone: "warning", label: "Low stock", icon: AlertTriangle },
  ok: { tone: "success", label: "In stock", icon: CheckCircle2 },
};

// Auto-deducted reasons carry a full batch UUID; show the short form.
const shortReason = (r: string) => r.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => m.slice(0, 8));

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  unit_cost: number | null;
  notes: string | null;
  attributes: Record<string, unknown> | null;
}

// Validation schema for adding or editing an inventory item
const itemSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required").max(50),
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.string().trim().max(100).optional(),
  unit: z.string().trim().min(1).max(20),
  reorder_level: z.coerce.number().min(0),
  unit_cost: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const movementSchema = z.object({
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  reason: z.string().trim().max(200).optional(),
});

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sort, setSort] = useState<InventorySort>("name-asc");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [movement, setMovement] = useState<{ item: InventoryItem; type: "in" | "out" } | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [reasonPopoverOpen, setReasonPopoverOpen] = useState(false);
  const [ongoingBatches, setOngoingBatches] = useState<OngoingBatch[]>([]);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [skuDraft, setSkuDraft] = useState("");
  const [stickerAttrs, setStickerAttrs] = useState({ size: "", type: "", color: "", design: "" });
  const { toast } = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();

  const nextSku = () => {
    const numeric = items
      .map((i) => parseInt(i.sku, 10))
      .filter((n) => !isNaN(n));
    const next = (numeric.length ? Math.max(...numeric) : 0) + 1;
    return String(next).padStart(6, "0");
  };

  useEffect(() => {
    if (!movement) return;
    setReasonDraft("");
    const loadBatches = async () => {
      const { data } = await supabase
        .from("production_batches")
        .select("id, style_number, status, orders(order_number, party_name)")
        .neq("status", "completed")
        .order("created_at", { ascending: false });
      setOngoingBatches(
        (data ?? []).map((b: any) => ({
          id: b.id,
          style_number: b.style_number,
          status: b.status,
          order_number: b.orders?.order_number ?? null,
          party_name: b.orders?.party_name ?? null,
        })),
      );
    };
    loadBatches();
  }, [movement]);

  useEffect(() => {
    if (adding) {
      setCategoryDraft("");
      setSkuDraft(nextSku());
      setStickerAttrs({ size: "", type: "", color: "", design: "" });
    } else if (editing) {
      setSkuDraft(editing.sku);
      setCategoryDraft(editing.category ?? "");
      const a = (editing.attributes ?? {}) as Record<string, unknown>;
      setStickerAttrs({
        size: String(a.size ?? ""), type: String(a.type ?? ""),
        color: String(a.color ?? ""), design: String(a.design ?? ""),
      });
    }
  }, [adding, editing]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .order("name");
    if (error) toast({ title: "Failed to load inventory", description: error.message, variant: "destructive" });
    else setItems((data ?? []) as InventoryItem[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = filterAndSortItems(items, { search, category: categoryFilter, stock: stockFilter, sort });
  const categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean) as string[])).sort();
  const hasUncategorized = items.some((i) => !i.category);
  const detail = items.find((i) => i.id === detailId) ?? null;
  const clearFilters = () => { setSearch(""); setCategoryFilter("all"); setStockFilter("all"); };

  const loadMovements = async (itemId: string) => {
    setMovementsLoading(true);
    const { data, error } = await supabase
      .from("inventory_movements")
      .select("id, type, quantity, reason, created_at")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast({ title: "Failed to load movements", description: error.message, variant: "destructive" });
    else setMovements((data ?? []) as Movement[]);
    setMovementsLoading(false);
  };

  useEffect(() => {
    setMovements([]);
    if (detailId) loadMovements(detailId);
  }, [detailId]);

  const handleSave = async (form: HTMLFormElement, existing?: InventoryItem) => {
    const fd = new FormData(form);
    const parsed = itemSchema.safeParse({
      sku: String(fd.get("sku") ?? ""),
      name: String(fd.get("name") ?? ""),
      category: String(fd.get("category") ?? "") || undefined,
      unit: String(fd.get("unit") ?? "pcs"),
      reorder_level: fd.get("reorder_level"),
      unit_cost: fd.get("unit_cost") || undefined,
      notes: String(fd.get("notes") ?? "") || undefined,
    });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }

    const attributes =
      parsed.data.category === "sticker"
        ? { size: stickerAttrs.size, type: stickerAttrs.type, color: stickerAttrs.color, design: stickerAttrs.design }
        : parsed.data.category === "accessory"
        ? { type: stickerAttrs.type }
        : {};

    const payload = {
      sku: parsed.data.sku,
      name: parsed.data.name,
      category: parsed.data.category ?? null,
      unit: parsed.data.unit,
      reorder_level: parsed.data.reorder_level,
      unit_cost: parsed.data.unit_cost ?? null,
      notes: parsed.data.notes ?? null,
      attributes,
    };

    const { error } = existing
      ? await supabase.from("inventory_items").update(payload).eq("id", existing.id)
      : await supabase.from("inventory_items").insert(payload);

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: existing ? "Item updated" : "Item added" });
    setEditing(null);
    setAdding(false);
    load();
  };

  const deleteItem = async (item: InventoryItem) => {
    // Movement history is the audit trail for stock, so an item with history is never deleted.
    const { count, error: countError } = await supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("item_id", item.id);
    if (countError) {
      toast({ title: "Couldn't check movement history", description: countError.message, variant: "destructive" });
      return;
    }
    if (count) {
      toast({
        title: "Can't delete this item",
        description: `${item.name} has ${count} recorded stock movement${count === 1 ? "" : "s"}. Deleting would erase that history, so the item is kept.`,
        variant: "destructive",
      });
      return;
    }
    if (!(await confirm({
      title: `Delete "${item.name}" (${item.sku})?`,
      description: "This item has no stock movements, so no history is lost. It cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    }))) return;
    const { error } = await supabase.from("inventory_items").delete().eq("id", item.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Item deleted" });
    if (detailId === item.id) setDetailId(null);
    load();
  };

  const handleMovement = async (form: HTMLFormElement) => {
    if (!movement) return;
    const fd = new FormData(form);
    const parsed = movementSchema.safeParse({
      quantity: fd.get("quantity"),
      reason: String(fd.get("reason") ?? "") || undefined,
    });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    const ok = await confirm({
      title: `Record stock ${movement.type === "in" ? "in" : "out"}?`,
      details: [
        ["Item", `${movement.item.name} (${movement.item.sku})`],
        ["Quantity", `${parsed.data.quantity} ${movement.item.unit}`],
        ["On hand now", `${fmtQty(movement.item.quantity_on_hand)} ${movement.item.unit}`],
        ["On hand after", `${fmtQty(Number(movement.item.quantity_on_hand) + (movement.type === "in" ? 1 : -1) * parsed.data.quantity)} ${movement.item.unit}`],
        ["Reason", parsed.data.reason ?? "—"],
      ],
    });
    if (!ok) return;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("inventory_movements").insert({
      item_id: movement.item.id,
      type: movement.type,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason ?? null,
      performed_by: userData.user?.id ?? null,
    });
    if (error) {
      toast({ title: "Movement failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Stock ${movement.type === "in" ? "increased" : "decreased"}` });
    setMovement(null);
    if (detailId === movement.item.id) loadMovements(movement.item.id);
    load();
  };

  const rowActions = (item: InventoryItem) => (
    <div className="flex items-center justify-end gap-1">
      {can("inventory.update") && (
        <Button size="sm" variant="outline" onClick={() => setMovement({ item, type: "in" })}>
          <SlidersHorizontal className="w-4 h-4 mr-1" /> Adjust stock
        </Button>
      )}
      <MoreMenu label={`More actions for ${item.name}`}>
        <DropdownMenuItem onSelect={() => setDetailId(item.id)}>View details</DropdownMenuItem>
        {can("inventory.update") && <DropdownMenuItem onSelect={() => setEditing(item)}>Edit item</DropdownMenuItem>}
        {can("inventory.delete") && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => deleteItem(item)}>
              Delete item
            </DropdownMenuItem>
          </>
        )}
      </MoreMenu>
    </div>
  );

  const conditionBadge = (item: InventoryItem) => {
    const c = CONDITION_UI[stockCondition(item)];
    return <StatusBadge tone={c.tone} icon={c.icon}>{c.label}</StatusBadge>;
  };

  // Plain-text comparison of on-hand vs reorder point (never color only).
  const reorderGap = (item: InventoryItem) => {
    const gap = Number(item.quantity_on_hand) - Number(item.reorder_level);
    if (gap === 0) return "At reorder point";
    return `${fmtQty(Math.abs(gap))} ${item.unit} ${gap > 0 ? "above" : "below"} reorder point`;
  };

  return (
    <div>
      <PageHeader title="Inventory" description="Track raw materials and finished goods.">
        {can("inventory.create") && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Item
          </Button>
        )}
      </PageHeader>

      <TableToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search by name or SKU…"
        count={filtered.length}
        noun="item"
        filtersActive={categoryFilter !== "all" || stockFilter !== "all"}
        onClear={clearFilters}
      >
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[9.5rem]" aria-label="Filter by category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            {hasUncategorized && <SelectItem value={NO_CATEGORY}>Uncategorized</SelectItem>}
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as StockFilter)}>
          <SelectTrigger className="w-[9.5rem]" aria-label="Filter by stock level"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock levels</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
            <SelectItem value="ok">In stock</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as InventorySort)}>
          <SelectTrigger className="w-[11rem]" aria-label="Sort items"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name-asc">Name A–Z</SelectItem>
            <SelectItem value="name-desc">Name Z–A</SelectItem>
            <SelectItem value="qty-asc">Quantity: low to high</SelectItem>
            <SelectItem value="qty-desc">Quantity: high to low</SelectItem>
            <SelectItem value="status">Reorder status: needs attention first</SelectItem>
          </SelectContent>
        </Select>
      </TableToolbar>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={items.length === 0 ? "No inventory items yet" : "No items match"}
          description={items.length === 0 ? "Add your first item to start tracking stock." : "Try a different search or clear the filters."}
          action={items.length === 0
            ? can("inventory.create") && <Button onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-2" /> Add Item</Button>
            : <Button variant="outline" onClick={clearFilters}>Clear filters</Button>}
        />
      ) : (
        <>
          {/* Desktop: compact table */}
          <div className="hidden md:block rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Reorder at</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <button type="button" onClick={() => setDetailId(item.id)} className="text-left font-medium text-foreground hover:underline focus-visible:underline">
                        {item.name}
                      </button>
                      <div className="text-xs text-muted-foreground">{item.sku}</div>
                    </TableCell>
                    <TableCell>{item.category ? <Badge variant="secondary">{item.category}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap"><strong>{fmtQty(item.quantity_on_hand)}</strong> {item.unit}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground">{fmtQty(item.reorder_level)} {item.unit}</TableCell>
                    <TableCell>
                      {conditionBadge(item)}
                      <div className="mt-1 text-xs text-muted-foreground">{reorderGap(item)}</div>
                    </TableCell>
                    <TableCell>{rowActions(item)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: one card per item */}
          <div className="md:hidden space-y-2">
            {filtered.map((item) => (
              <Card key={item.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => setDetailId(item.id)} className="min-w-0 text-left">
                      <span className="block font-semibold text-foreground">{item.name}</span>
                      <span className="block text-xs text-muted-foreground">{item.sku}{item.category ? ` · ${item.category}` : ""}</span>
                    </button>
                    {conditionBadge(item)}
                  </div>
                  <p className="text-sm tabular-nums">
                    <strong>{fmtQty(item.quantity_on_hand)}</strong> {item.unit} on hand
                    <span className="text-muted-foreground"> · reorder at {fmtQty(item.reorder_level)} {item.unit}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{reorderGap(item)}</p>
                  {rowActions(item)}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Item detail */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detail && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle>{detail.name}</SheetTitle>
                <SheetDescription>{detail.sku}{detail.category ? ` · ${detail.category}` : ""}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">On hand</p>
                    <p className="text-xl font-semibold tabular-nums">{fmtQty(detail.quantity_on_hand)} <span className="text-sm font-normal">{detail.unit}</span></p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Reorder at</p>
                    <p className="text-xl font-semibold tabular-nums">{fmtQty(detail.reorder_level)} <span className="text-sm font-normal">{detail.unit}</span></p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {conditionBadge(detail)}
                  <span className="text-xs text-muted-foreground">{reorderGap(detail)}</span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Unit cost</dt>
                  <dd>{detail.unit_cost != null ? fmtQty(detail.unit_cost) : "—"}</dd>
                  {Object.entries(detail.attributes ?? {}).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground capitalize">{k}</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="break-words">{detail.notes || "—"}</dd>
                </dl>
                <div className="flex flex-wrap gap-2">
                  {can("inventory.update") && (
                    <>
                      <Button size="sm" onClick={() => setMovement({ item: detail, type: "in" })}>
                        <SlidersHorizontal className="w-4 h-4 mr-1" /> Adjust stock
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(detail)}>Edit item</Button>
                    </>
                  )}
                </div>

                <section>
                  <h3 className="mb-2 text-sm font-semibold">Recent stock movements</h3>
                  {movementsLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
                  ) : movements.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No stock movements recorded yet.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {movements.map((m) => (
                        <li key={m.id} className="space-y-0.5 p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <StatusBadge
                              tone={m.type === "in" ? "success" : m.type === "out" ? "warning" : "info"}
                              icon={m.type === "in" ? ArrowDownToLine : m.type === "out" ? ArrowUpFromLine : SlidersHorizontal}
                            >
                              {m.type === "in" ? "Stock in" : m.type === "out" ? "Stock out" : "Set to"}
                            </StatusBadge>
                            <span className="font-medium tabular-nums">
                              {m.type === "in" ? "+" : m.type === "out" ? "−" : ""}{fmtQty(m.quantity)} {detail.unit}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{fmtDateTime(m.created_at)}</p>
                          {m.reason && <p className="break-words">{shortReason(m.reason)}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {movements.length === 50 && <p className="mt-1 text-xs text-muted-foreground">Showing the latest 50.</p>}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Add / Edit dialog */}
      <Dialog open={adding || !!editing} onOpenChange={(o) => !o && (setAdding(false), setEditing(null))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Item" : "Add Inventory Item"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave(e.currentTarget, editing ?? undefined);
            }}
            className="space-y-3"
          >
            <div>
              <Label className="text-xs">SKU * (auto-generated, editable)</Label>
              <Input name="sku" value={skuDraft} onChange={(e) => setSkuDraft(e.target.value)} required className="mt-1" />
            </div>
            <Field label="Name *" name="name" defaultValue={editing?.name} required />
            <div className="min-w-0">
              <Label className="text-xs">Category</Label>
              <input type="hidden" name="category" value={categoryDraft} />
              <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={categoryPopoverOpen}
                    className="w-full min-w-0 justify-between font-normal mt-1"
                  >
                    <span className="truncate">{categoryDraft || "Select or type a category…"}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search or type new category…"
                      value={categoryDraft}
                      onValueChange={setCategoryDraft}
                    />
                    <CommandList>
                      <CommandEmpty>
                        <button
                          type="button"
                          className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent rounded-sm"
                          onClick={() => setCategoryPopoverOpen(false)}
                        >
                          Use "{categoryDraft}"
                        </button>
                      </CommandEmpty>
                      <CommandGroup>
                        {CATEGORY_SUGGESTIONS.map((c) => (
                          <CommandItem
                            key={c}
                            value={c}
                            onSelect={(value) => {
                              setCategoryDraft(value);
                              setCategoryPopoverOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", categoryDraft === c ? "opacity-100" : "opacity-0")} />
                            {c}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {categoryDraft === "accessory" && (
              <div>
                <Label className="text-xs">Accessory Type</Label>
                <Input
                  value={stickerAttrs.type}
                  onChange={(e) => setStickerAttrs({ ...stickerAttrs, type: e.target.value })}
                  placeholder="e.g. button, zip, label..."
                  className="mt-1"
                />
              </div>
            )}

            {categoryDraft === "sticker" && (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-border">
                <div>
                  <Label className="text-xs">Size</Label>
                  <Input value={stickerAttrs.size} onChange={(e) => setStickerAttrs({ ...stickerAttrs, size: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Type</Label>
                  <Input value={stickerAttrs.type} onChange={(e) => setStickerAttrs({ ...stickerAttrs, type: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Color</Label>
                  <Input value={stickerAttrs.color} onChange={(e) => setStickerAttrs({ ...stickerAttrs, color: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Design</Label>
                  <Input value={stickerAttrs.design} onChange={(e) => setStickerAttrs({ ...stickerAttrs, design: e.target.value })} className="mt-1" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Unit *</Label>
                <Select name="unit" defaultValue={editing?.unit ?? "pcs"} required>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {UNIT_LABELS[u]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field
                label="Reorder Level"
                name="reorder_level"
                type="number"
                defaultValue={String(editing?.reorder_level ?? 0)}
              />
            </div>
            <Field
              label="Unit Cost"
              name="unit_cost"
              type="number"
              step="0.01"
              defaultValue={editing?.unit_cost?.toString() ?? ""}
            />
            <Field label="Notes" name="notes" defaultValue={editing?.notes ?? ""} />
            <DialogFooter>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stock movement dialog */}
      <Dialog open={!!movement} onOpenChange={(o) => !o && setMovement(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust stock — {movement?.item.name}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleMovement(e.currentTarget);
            }}
            className="space-y-3"
          >
            <div>
              <Label className="text-xs">Transaction</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={movement?.type}
                onValueChange={(v) => v && movement && setMovement({ ...movement, type: v as "in" | "out" })}
                className="mt-1 grid grid-cols-2"
              >
                <ToggleGroupItem value="in"><ArrowDownToLine className="w-4 h-4 mr-1" /> Stock in</ToggleGroupItem>
                <ToggleGroupItem value="out"><ArrowUpFromLine className="w-4 h-4 mr-1" /> Stock out</ToggleGroupItem>
              </ToggleGroup>
              <p className="mt-1 text-xs text-muted-foreground">
                Now {movement ? `${fmtQty(movement.item.quantity_on_hand)} ${movement.item.unit}` : ""} on hand. Recorded in the item's movement history.
              </p>
            </div>
            <Field label={`Quantity (${movement?.item.unit ?? ""}) *`} name="quantity" type="number" step="0.01" required />
            <div className="min-w-0">
              <Label className="text-xs">Reason</Label>
              <input type="hidden" name="reason" value={reasonDraft} />
              <Popover open={reasonPopoverOpen} onOpenChange={setReasonPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={reasonPopoverOpen}
                    className="w-full min-w-0 justify-between font-normal mt-1"
                  >
                    <span className="truncate">{reasonDraft || "Select a batch or type a reason…"}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search ongoing batches or type…"
                      value={reasonDraft}
                      onValueChange={setReasonDraft}
                    />
                    <CommandList>
                      <CommandEmpty>
                        <button
                          type="button"
                          className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent rounded-sm"
                          onClick={() => setReasonPopoverOpen(false)}
                        >
                          Use "{reasonDraft}"
                        </button>
                      </CommandEmpty>
                      <CommandGroup heading="Ongoing Production">
                        {ongoingBatches.map((b) => {
                          const label = `Production batch #${b.style_number}${b.order_number ? ` (Order #${b.order_number}${b.party_name ? ` · ${b.party_name}` : ""})` : ""} — ${b.status}`;
                          return (
                            <CommandItem
                              key={b.id}
                              value={label}
                              onSelect={(value) => {
                                setReasonDraft(value);
                                setReasonPopoverOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", reasonDraft === label ? "opacity-100" : "opacity-0")} />
                              {label}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <DialogFooter>
              <Button type="submit">Record</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Tiny labelled-input helper to keep the dialog markup compact and consistent
function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input {...rest} className="mt-1" />
    </div>
  );
}
