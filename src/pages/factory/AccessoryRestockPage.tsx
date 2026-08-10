import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, PackagePlus, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { UNITS, UNIT_LABELS, type Unit } from "@/lib/units";
import { ACCESSORY_GROUPS } from "@/lib/accessoryTypes";
import { recordInventoryMovement } from "@/lib/departmentEntries";

interface AccessoryItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  quantity_on_hand: number;
  attributes: Record<string, unknown>;
}

export default function AccessoryRestockPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [department, setDepartment] = useState<string | null | undefined>(undefined);

  const [accessoryType, setAccessoryType] = useState("");
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [matches, setMatches] = useState<AccessoryItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string>("");

  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [weight, setWeight] = useState("");
  const [size, setSize] = useState("");
  const [supplier, setSupplier] = useState("");
  const [unit, setUnit] = useState<Unit>("pcs");
  const [unitCost, setUnitCost] = useState<number>(0);
  const [reorderLevel, setReorderLevel] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const selectedItem = useMemo(() => matches.find((m) => m.id === selectedItemId) || null, [matches, selectedItemId]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("department").eq("id", user.id).maybeSingle().then(({ data }) => {
      setDepartment(data?.department ?? null);
    });
  }, [user]);

  useEffect(() => {
    setSelectedItemId("");
    setName(accessoryType);
    if (!accessoryType) {
      setMatches([]);
      return;
    }
    const run = async () => {
      setSearching(true);
      const { data } = await supabase
        .from("inventory_items")
        .select("id, name, sku, unit, quantity_on_hand, attributes")
        .eq("category", "accessory")
        .contains("attributes", { type: accessoryType });
      setMatches((data as any) || []);
      setSearching(false);
    };
    run();
  }, [accessoryType]);

  const nextSku = async () => {
    const { data } = await supabase.from("inventory_items").select("sku");
    const numeric = (data ?? []).map((i) => parseInt(i.sku, 10)).filter((n) => !isNaN(n));
    const next = (numeric.length ? Math.max(...numeric) : 0) + 1;
    return String(next).padStart(6, "0");
  };

  const reset = () => {
    setAccessoryType("");
    setColor("");
    setWeight("");
    setSize("");
    setSupplier("");
    setUnit("pcs");
    setUnitCost(0);
    setReorderLevel(0);
    setQuantity(0);
    setSelectedItemId("");
  };

  const handleSubmit = async () => {
    if (!accessoryType || quantity <= 0) {
      toast({ title: "Select an accessory type and enter a quantity", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      let itemId = selectedItem?.id;
      if (!itemId) {
        const sku = await nextSku();
        const { data: created, error } = await supabase
          .from("inventory_items")
          .insert({
            sku,
            name: name.trim() || accessoryType,
            category: "accessory",
            unit,
            unit_cost: unitCost || null,
            reorder_level: reorderLevel,
            attributes: { type: accessoryType, color, weight, size, supplier },
          })
          .select("id")
          .single();
        if (error) throw error;
        itemId = created.id;
      }
      await recordInventoryMovement(itemId!, quantity, "in", user!.id, "Accessory restock");
      toast({ title: "Inventory restocked" });
      reset();
    } catch (err: any) {
      toast({ title: "Restock failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (department === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (department !== "accessories") {
    return (
      <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl max-w-md mx-auto">
        <CardContent className="py-12 flex flex-col items-center text-center gap-2">
          <ShieldAlert className="w-8 h-8 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">Accessories department only</p>
          <p className="text-xs text-slate-500">Restocking inventory is limited to workers assigned to the Accessories department.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <PackagePlus className="w-5 h-5 text-slate-700" />
        <h1 className="text-xl font-bold text-slate-900">Restock Accessory</h1>
      </div>

      <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl shadow-xs">
        <CardContent className="p-4 space-y-4">
          <div className="min-w-0">
            <Label className="text-xs font-bold text-slate-700">Accessory Type</Label>
            <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={typePopoverOpen}
                  className="w-full min-w-0 justify-between bg-white border-slate-300 text-slate-900 text-sm h-11 font-semibold rounded-lg mt-1"
                >
                  <span className="truncate">{accessoryType || "Type to search accessory…"}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
                  <CommandInput placeholder="Search accessory type…" />
                  <CommandList>
                    <CommandEmpty>No accessory found.</CommandEmpty>
                    {ACCESSORY_GROUPS.map((group) => (
                      <CommandGroup key={group.category} heading={group.category}>
                        {group.items.map((item) => (
                          <CommandItem
                            key={item}
                            value={item}
                            onSelect={(value) => {
                              setAccessoryType(value === accessoryType ? "" : value);
                              setTypePopoverOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", accessoryType === item ? "opacity-100" : "opacity-0")} />
                            {item}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {accessoryType && (
            <>
              {searching && <p className="text-xs text-slate-500">Searching inventory…</p>}

              {matches.length > 0 && (
                <div>
                  <Label className="text-xs font-bold text-slate-700">Top Up Existing Item</Label>
                  <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                    <SelectTrigger className="bg-white border-slate-300 text-slate-900 text-sm h-11 rounded-lg mt-1">
                      <SelectValue placeholder="None — add as new variant below" />
                    </SelectTrigger>
                    <SelectContent>
                      {matches.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} ({m.sku}) — {m.quantity_on_hand} {m.unit} in stock
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!selectedItem && (
                <div className="bg-white/80 p-3 rounded-lg border border-slate-200 space-y-2">
                  <Label className="text-xs font-bold text-slate-700">New Variant Details</Label>
                  <Input placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 text-sm" />
                    <Input placeholder="Weight (e.g. 2kg)" value={weight} onChange={(e) => setWeight(e.target.value)} className="h-9 text-sm" />
                    <Input placeholder="Size" value={size} onChange={(e) => setSize(e.target.value)} className="h-9 text-sm" />
                    <Input placeholder="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
                      <SelectTrigger className="bg-white border-slate-300 text-sm h-9 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map((u) => (
                          <SelectItem key={u} value={u}>{UNIT_LABELS[u]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" min="0" placeholder="Unit cost"
                      value={unitCost || ""} onChange={(e) => setUnitCost(Number(e.target.value))}
                      className="h-9 text-sm"
                    />
                  </div>
                  <Input
                    type="number" min="0" placeholder="Reorder level"
                    value={reorderLevel || ""} onChange={(e) => setReorderLevel(Number(e.target.value))}
                    className="h-9 text-sm"
                  />
                </div>
              )}

              <div>
                <Label className="text-xs font-bold text-slate-700">
                  Quantity to Add {selectedItem ? `(${selectedItem.unit})` : unit ? `(${unit})` : ""}
                </Label>
                <Input
                  type="number" min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="bg-white border-slate-300 text-slate-900 text-center text-xl font-bold h-11 rounded-lg mt-1"
                />
              </div>

              <Button
                size="lg"
                className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
                onClick={handleSubmit}
                disabled={submitting || quantity <= 0}
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Add to Inventory"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
