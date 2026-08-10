import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Package, Send, X, Palette, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface ColorEntry {
  name: string;
  quantity: string;
}

export default function DirectOrderPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [submitting, setSubmitting] = useState(false);
  const [productSummary, setProductSummary] = useState("");
  const [quantity, setQuantity] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [colorInput, setColorInput] = useState("");
  const [colors, setColors] = useState<ColorEntry[]>([]);
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");

  const colorTotal = colors.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0);

  const addColor = () => {
    const name = colorInput.trim();
    if (!name) return;
    if (colors.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setColorInput("");
      return;
    }
    setColors([...colors, { name, quantity: "" }]);
    setColorInput("");
  };

  const removeColor = (name: string) => setColors(colors.filter((c) => c.name !== name));

  const setColorQty = (name: string, qty: string) =>
    setColors(colors.map((c) => (c.name === name ? { ...c, quantity: qty } : c)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!productSummary.trim() || !quantity || Number(quantity) <= 0) {
      toast({ title: "Please fill in product summary and a valid quantity.", variant: "destructive" });
      return;
    }
    if (colors.length > 0 && colorTotal !== Number(quantity)) {
      toast({
        title: "Color quantities don't add up",
        description: `Color breakdown totals ${colorTotal} pcs but Total Quantity is ${quantity} pcs.`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

    try {
      const { data: newOrder, error } = await supabase
        .from("orders")
        .insert({
          client_id: user.id,
          order_number: orderNumber,
          product_summary: productSummary.trim(),
          quantity: Number(quantity),
          currency,
          color_breakdown: colors.map((c) => ({ color: c.name, quantity: Number(c.quantity) || 0 })),
          expected_delivery: expectedDelivery || null,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      // Add initial order update log
      await supabase.from("order_updates").insert({
        order_id: newOrder.id,
        status: "pending",
        note: `Direct Order created by client. Notes: ${notes || "None"}`,
        created_by: user.id,
      });

      toast({ title: "Order Submitted Successfully!", description: `Order #${orderNumber} is pending review.` });
      navigate(`/client-portal/orders/${newOrder.id}`);
    } catch (err: any) {
      toast({ title: "Failed to create order", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2 text-muted-foreground">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Portal
      </Button>

      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground flex items-center gap-2">
          <Package className="w-6 h-6 text-accent" /> Place Direct Production Order
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Submit custom apparel production specifications directly to the En En Garments factory team.
        </p>
      </div>

      <Card className="border-border/80 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Order Details</CardTitle>
          <CardDescription>Specify your garment style, total quantity, and target delivery window.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="product-summary" className="text-xs font-semibold">Garment / Product Summary *</Label>
              <Input
                id="product-summary"
                placeholder="e.g. 500 pcs Cotton Polo Shirts (Black & Navy)"
                value={productSummary}
                onChange={(e) => setProductSummary(e.target.value)}
                required
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quantity" className="text-xs font-semibold">Total Quantity (Pieces) *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  placeholder="500"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="currency" className="text-xs font-semibold">Currency Preference</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="PKR">PKR (Rs)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-accent" /> Colors (Optional)
              </Label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="e.g. Red, Navy, Gray"
                  value={colorInput}
                  onChange={(e) => setColorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addColor();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addColor}>Add</Button>
              </div>

              {colors.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {colors.map((c) => (
                    <Badge key={c.name} variant="secondary" className="pl-2.5 pr-1 py-1 text-xs capitalize flex items-center gap-1">
                      {c.name}
                      <button
                        type="button"
                        onClick={() => removeColor(c.name)}
                        className="hover:text-destructive"
                        aria-label={`Remove ${c.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {colors.length > 0 && (
                <div className="mt-3 space-y-2 bg-muted/30 border border-border rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground">Quantity per Color</p>
                  {colors.map((c) => (
                    <div key={c.name} className="flex items-center gap-3">
                      <span className="text-sm capitalize w-24 shrink-0">{c.name}</span>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={c.quantity}
                        onChange={(e) => setColorQty(c.name, e.target.value)}
                        className="h-8"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">pcs</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t text-xs font-semibold">
                    <span className="text-muted-foreground">Total Entered</span>
                    <span className={colorTotal === Number(quantity || 0) ? "text-emerald-600" : "text-amber-600"}>
                      {colorTotal} / {quantity || 0} pcs
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="delivery-date" className="text-xs font-semibold">Target Delivery Date (Optional)</Label>
              <Input
                id="delivery-date"
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This is your preferred date. Final delivery date will be reviewed and confirmed by our Manager/Owner/Admin.
              </p>
            </div>

            <div>
              <Label htmlFor="notes" className="text-xs font-semibold">Other Instructions / Fabric Details (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Include fabric GSM, sizing breakdown, custom embroidery or printing notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="mt-1"
              />
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={submitting} className="w-full h-12 text-base bg-accent text-accent-foreground hover:bg-accent/90">
                {submitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Submitting Order...</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" /> Submit Direct Production Order</>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
