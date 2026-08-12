import { useEffect, useState } from "react";
import { Plus, Loader2, ArrowDownToLine, ArrowUpFromLine, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  const { isAdmin } = useAuth();

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

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.sku.toLowerCase().includes(search.toLowerCase())
  );

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
    if (!window.confirm(`Delete "${item.name}" (${item.sku})? This removes its movement history and cannot be undone.`)) return;
    const { error } = await supabase.from("inventory_items").delete().eq("id", item.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Item deleted" });
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
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground">Track raw materials and finished goods.</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Item
        </Button>
      </div>

      <Input
        placeholder="Search by name or SKU..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {items.length === 0 ? "No inventory items yet. Add your first one." : "No matches."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const low = Number(item.quantity_on_hand) <= Number(item.reorder_level);
            return (
              <Card key={item.id}>
                <CardContent className="py-4 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-center">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{item.name}</h3>
                      <Badge variant="outline">{item.sku}</Badge>
                      {item.category && <Badge variant="secondary">{item.category}</Badge>}
                      {low && (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                          Low Stock
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      <strong>{item.quantity_on_hand}</strong> {item.unit} on hand • reorder at{" "}
                      {item.reorder_level}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setMovement({ item, type: "in" })}>
                      <ArrowDownToLine className="w-4 h-4 mr-1" /> In
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setMovement({ item, type: "out" })}>
                      <ArrowUpFromLine className="w-4 h-4 mr-1" /> Out
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(item)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => deleteItem(item)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
            <DialogTitle>
              {movement?.type === "in" ? "Stock In" : "Stock Out"} — {movement?.item.name}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleMovement(e.currentTarget);
            }}
            className="space-y-3"
          >
            <Field label="Quantity *" name="quantity" type="number" step="0.01" required />
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
