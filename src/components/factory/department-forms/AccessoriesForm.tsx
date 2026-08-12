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
import { useTranslation } from "@/i18n/useTranslation";
import { cn } from "@/lib/utils";
import { insertDepartmentEntry, recordInventoryMovement } from "@/lib/departmentEntries";
import { UNITS, UNIT_LABELS, unitsAreConvertible, convertUnit, type Unit } from "@/lib/units";
import { ACCESSORY_GROUPS } from "@/lib/accessoryTypes";
import type { DepartmentFormProps } from "./types";

interface InventoryMatch {
  id: string;
  name: string;
  sku: string;
  unit: string;
  unit_cost: number | null;
  quantity_on_hand: number;
  attributes: Record<string, unknown>;
}

export default function AccessoriesForm({ batchId, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
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
  const [entryUnit, setEntryUnit] = useState<Unit>("pcs");
  const [submitting, setSubmitting] = useState(false);

  const isSticker = accessoryType.toLowerCase() === "stickers";
  const selectedItem = useMemo(() => matches.find((m) => m.id === selectedItemId) || null, [matches, selectedItemId]);
  const itemUnit = (selectedItem?.unit as Unit) || "pcs";
  const stockQuantity = useMemo(
    () => (unitsAreConvertible(entryUnit, itemUnit) ? convertUnit(quantity, entryUnit, itemUnit) : quantity),
    [quantity, entryUnit, itemUnit],
  );
  const perItemCost = selectedItem?.unit_cost ?? null;
  const totalCost = perItemCost !== null ? perItemCost * stockQuantity : null;

  useEffect(() => {
    setEntryUnit(itemUnit);
  }, [itemUnit]);

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
        .select("id, name, sku, unit, unit_cost, quantity_on_hand, attributes")
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
      toast({ title: t("factory.forms.accessories.selectTypeAndQty"), variant: "destructive" });
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
          quantity: stockQuantity,
          entry_quantity: quantity,
          entry_unit: entryUnit,
          per_item_cost: perItemCost,
          ...(isSticker ? { sticker_attributes: { size: stickerSize, type: stickerType, color: stickerColor, design: stickerDesign } } : {}),
        },
        totalCost,
      });
      if (selectedItem) {
        await recordInventoryMovement(selectedItem.id, stockQuantity, "out", workerId, `Used in accessories entry for batch ${batchId}`);
      }
      toast({ title: t("factory.common.entrySaved") });
      onSubmitted();
    } catch (err: any) {
      toast({ title: t("factory.common.errorSavingEntry"), description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl shadow-xs">
      <CardContent className="p-4 space-y-4">
        <div className="min-w-0">
          <Label className="text-xs font-bold text-slate-700">{t("factory.restock.accessoryType")}</Label>
          <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={typePopoverOpen}
                className="w-full min-w-0 justify-between bg-white border-slate-300 text-slate-900 text-sm h-11 font-semibold rounded-lg mt-1"
              >
                <span className="truncate">{accessoryType || t("factory.restock.typeSearchPlaceholder")}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
                <CommandInput placeholder={t("factory.restock.searchPlaceholder")} />
                <CommandList>
                  <CommandEmpty>{t("factory.restock.noAccessoryFound")}</CommandEmpty>
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
            <Label className="text-xs font-bold text-slate-700">{t("factory.forms.accessories.stickerAttributes")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder={t("factory.restock.size")} value={stickerSize} onChange={(e) => setStickerSize(e.target.value)} className="h-9 text-sm" />
              <Input placeholder={t("factory.forms.accessories.stickerType")} value={stickerType} onChange={(e) => setStickerType(e.target.value)} className="h-9 text-sm" />
              <Input placeholder={t("factory.common.color")} value={stickerColor} onChange={(e) => setStickerColor(e.target.value)} className="h-9 text-sm" />
              <Input placeholder={t("factory.forms.accessories.design")} value={stickerDesign} onChange={(e) => setStickerDesign(e.target.value)} className="h-9 text-sm" />
            </div>
            <Button type="button" size="sm" variant="outline" className="w-full h-9 text-xs" onClick={searchStickers} disabled={searching}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : t("factory.forms.accessories.searchInventoryBtn")}
            </Button>
          </div>
        )}

        {accessoryType && !isSticker && searching && (
          <p className="text-xs text-slate-500">{t("factory.restock.searchingInventory")}</p>
        )}

        {matches.length > 0 && (
          <div>
            <Label className="text-xs font-bold text-slate-700">{t("factory.forms.accessories.matchingInventory")}</Label>
            <Select value={selectedItemId} onValueChange={setSelectedItemId}>
              <SelectTrigger className="bg-white border-slate-300 text-slate-900 text-sm h-11 rounded-lg mt-1">
                <SelectValue placeholder={t("factory.common.selectItem")} />
              </SelectTrigger>
              <SelectContent>
                {matches.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.sku}) — {m.quantity_on_hand} {t("factory.common.inStock")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {accessoryType && !searching && matches.length === 0 &&
          (!isSticker || [stickerSize, stickerType, stickerColor, stickerDesign].some(Boolean)) && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              {t("factory.forms.accessories.notInInventory")}
            </p>
        )}

        {selectedItem && (
          <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">{t("factory.forms.accessories.perItemCost")}</span>
            <span className="text-sm font-bold text-slate-800">
              {perItemCost !== null ? `PKR ${perItemCost}` : t("factory.common.setByAdmin")}
            </span>
          </div>
        )}

        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.dashboard.quantity")}</Label>
          <div className="flex gap-2 mt-1">
            <Input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0, parseFloat(e.target.value) || 0))}
              className="bg-white border-slate-300 text-slate-900 text-center text-xl font-bold h-11 rounded-lg flex-1"
            />
            <Select value={entryUnit} onValueChange={(v) => setEntryUnit(v as Unit)}>
              <SelectTrigger className="bg-white border-slate-300 text-slate-900 text-sm h-11 rounded-lg w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u} disabled={selectedItem ? !unitsAreConvertible(u, itemUnit) : false}>
                    {UNIT_LABELS[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedItem && entryUnit !== itemUnit && quantity > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              = {stockQuantity.toFixed(2)} {itemUnit} (stock unit)
            </p>
          )}
        </div>

        {totalCost !== null && (
          <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">{t("factory.common.totalCost")}</span>
            <span className="text-sm font-bold text-slate-800">PKR {totalCost.toFixed(2)}</span>
          </div>
        )}

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting || !accessoryType || quantity <= 0}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("factory.common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
