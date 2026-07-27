import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Package, Send, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export default function DirectOrderPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [submitting, setSubmitting] = useState(false);
  const [productSummary, setProductSummary] = useState("");
  const [quantity, setQuantity] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!productSummary.trim() || !quantity || Number(quantity) <= 0) {
      toast({ title: "Please fill in product summary and a valid quantity.", variant: "destructive" });
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
      navigate(`/portal/orders/${newOrder.id}`);
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
              <Label htmlFor="delivery-date" className="text-xs font-semibold">Target Delivery Date (Optional)</Label>
              <Input
                id="delivery-date"
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="notes" className="text-xs font-semibold">Fabric &amp; Stitching Instructions (Optional)</Label>
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
