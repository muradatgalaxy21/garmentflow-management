import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Loader2, Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { insertDepartmentEntry } from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

const ACCESSORY_GROUPS: { category: string; items: string[] }[] = [
  {
    category: "Stitching / Sewing Accessories",
    items: [
      "Thread", "Interlining/Fusing", "Buttons", "Snap buttons", "Zippers", "Drawstring/Drawcord",
      "Drawcord end caps/aglets", "Elastic", "Velcro", "Rivets", "Eyelets", "Piping/Cording",
      "Shoulder pads", "Pocket bags/lining fabric",
    ],
  },
  {
    category: "Labels & Tags",
    items: [
      "Main label", "Size label", "Care label", "Composition label", "Country of origin label",
      "Hang tag", "Hang tag string/safety pin/plastic tag pin", "Barcode sticker",
    ],
  },
  {
    category: "Packing Accessories",
    items: [
      "Poly bags", "Tissue paper", "Cardboard/chipboard", "Collar stand/butterfly clips", "Pins",
      "Stickers", "Master carton", "Inner carton/box", "Tape", "Silica gel packets",
    ],
  },
  {
    category: "Production Tracking / Misc",
    items: ["Sequence tags/lot tags", "Waistband labels", "Reflective trims"],
  },
  {
    category: "Parachute / Technical Jackets",
    items: [
      "Waterproof zippers", "Taped seams/seam tape", "Toggle stoppers", "Hood", "Mesh lining",
      "Ripstop tape/patches", "Storm flap", "D-rings", "Reflective piping/trim",
      "Elastic cuffs with thumbhole", "Water-repellent coating tag",
    ],
  },
  {
    category: "Sportswear — Padding / Protective",
    items: [
      "Knee pads", "Elbow pads", "Shoulder pads (protective)", "Chest pad/guard",
      "Compression panels", "Foam inserts", "Pad pockets/sleeves", "Bonding tape",
      "Silicone grippers",
    ],
  },
  {
    category: "Buyer/Export-Specific",
    items: ["REACH compliance labels", "OEKO-TEX tags", "Other EU/UK regulatory labels"],
  },
];

interface InventoryMatch {
  id: string;
  name: string;
  sku: string;
  unit_cost: number | null;
  quantity_on_hand: number;
  attributes: Record<string, unknown>;
}

export default function AccessoriesForm({ batchId, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const [accessoryType, setAccessoryType] = useState<string>("");
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [stickerSize, setStickerSize] = useState("");
  const [stickerType, setStickerType] = useState("");
  const [stickerColor, setStickerColor] = useState("");
  const [stickerDesign, setStickerDesign] = useState("");
  const [matches, setMatches] = useState<InventoryMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const isSticker = accessoryType.toLowerCase() === "stickers";
  const selectedItem = useMemo(() => matches.find((m) => m.id === selectedItemId) || null, [matches, selectedItemId]);
  const perItemCost = selectedItem?.unit_cost ?? null;
  const totalCost = perItemCost !== null ? perItemCost * quantity : null;

  // Non-sticker accessories: look up matching inventory as soon as a type is picked
  useEffect(() => {
    setSelectedItemId("");
    if (!accessoryType || isSticker) {
      setMatches([]);
      return;
    }
    const run = async () => {
      setSearching(true);
      const { data } = await supabase
        .from("inventory_items")
        .select("id, name, sku, unit_cost, quantity_on_hand, attributes")
        .eq("category", "accessory")
        .contains("attributes", { type: accessoryType });
      setMatches((data as any) || []);
      setSearching(false);
    };
    run();
  }, [accessoryType, isSticker]);

  const searchStickers = async () => {
    setSearching(true);
    setSelectedItemId("");
    const filter: Record<string, string> = {};
    if (stickerSize.trim()) filter.size = stickerSize.trim();
    if (stickerType.trim()) filter.type = stickerType.trim();
    if (stickerColor.trim()) filter.color = stickerColor.trim();
    if (stickerDesign.trim()) filter.design = stickerDesign.trim();

    const { data } = await supabase
      .from("inventory_items")
      .select("id, name, sku, unit_cost, quantity_on_hand, attributes")
      .eq("category", "sticker")
      .contains("attributes", filter);
    setMatches((data as any) || []);
    setSearching(false);
  };

  const handleSubmit = async () => {
    if (!accessoryType || quantity <= 0) {
      toast({ title: "Select accessory type and enter a quantity", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await insertDepartmentEntry({
        department: "accessories",
        batchId,
        workerId,
        inventoryItemId: selectedItem?.id ?? null,
        payload: {
          accessory_type: accessoryType,
          quantity,
          per_item_cost: perItemCost,
          ...(isSticker ? { sticker_attributes: { size: stickerSize, type: stickerType, color: stickerColor, design: stickerDesign } } : {}),
        },
        totalCost,
      });
      toast({ title: "Entry Saved!" });
      onSubmitted();
    } catch (err: any) {
      toast({ title: "Error saving entry", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl shadow-xs">
      <CardContent className="p-4 space-y-4">
        <div>
          <Label className="text-xs font-bold text-slate-700">Accessory Type</Label>
          <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={typePopoverOpen}
                className="w-full justify-between bg-white border-slate-300 text-slate-900 text-sm h-11 font-semibold rounded-lg mt-1"
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

        {isSticker && (
          <div className="bg-white/80 p-3 rounded-lg border border-slate-200 space-y-2">
            <Label className="text-xs font-bold text-slate-700">Sticker Attributes</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Size" value={stickerSize} onChange={(e) => setStickerSize(e.target.value)} className="h-9 text-sm" />
              <Input placeholder="Type" value={stickerType} onChange={(e) => setStickerType(e.target.value)} className="h-9 text-sm" />
              <Input placeholder="Color" value={stickerColor} onChange={(e) => setStickerColor(e.target.value)} className="h-9 text-sm" />
              <Input placeholder="Design" value={stickerDesign} onChange={(e) => setStickerDesign(e.target.value)} className="h-9 text-sm" />
            </div>
            <Button type="button" size="sm" variant="outline" className="w-full h-9 text-xs" onClick={searchStickers} disabled={searching}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search Inventory"}
            </Button>
          </div>
        )}

        {accessoryType && !isSticker && searching && (
          <p className="text-xs text-slate-500">Searching inventory…</p>
        )}

        {matches.length > 0 && (
          <div>
            <Label className="text-xs font-bold text-slate-700">Matching Inventory</Label>
            <Select value={selectedItemId} onValueChange={setSelectedItemId}>
              <SelectTrigger className="bg-white border-slate-300 text-slate-900 text-sm h-11 rounded-lg mt-1">
                <SelectValue placeholder="Select item" />
              </SelectTrigger>
              <SelectContent>
                {matches.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.sku}) — {m.quantity_on_hand} in stock
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {accessoryType && !searching && matches.length === 0 &&
          (!isSticker || [stickerSize, stickerType, stickerColor, stickerDesign].some(Boolean)) && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              This design/item is not in inventory yet. Staff will need to add it.
            </p>
        )}

        {selectedItem && (
          <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Per Item Cost:</span>
            <span className="text-sm font-bold text-slate-800">
              {perItemCost !== null ? `PKR ${perItemCost}` : "Set by Admin"}
            </span>
          </div>
        )}

        <div>
          <Label className="text-xs font-bold text-slate-700">Quantity</Label>
          <Input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 text-slate-900 text-center text-xl font-bold h-11 rounded-lg mt-1"
          />
        </div>

        {totalCost !== null && (
          <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Cost:</span>
            <span className="text-sm font-bold text-slate-800">PKR {totalCost.toFixed(2)}</span>
          </div>
        )}

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting || !accessoryType || quantity <= 0}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Entry"}
        </Button>
      </CardContent>
    </Card>
  );
}
