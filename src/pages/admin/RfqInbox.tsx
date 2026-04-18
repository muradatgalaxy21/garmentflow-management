import { useEffect, useState } from "react";
import { Loader2, Mail, Phone, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type RfqStatus = "new" | "contacted" | "quoted" | "won" | "lost";

interface Rfq {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  product_type: string | null;
  quantity: string | null;
  message: string;
  status: RfqStatus;
  notes: string | null;
  created_at: string;
}

const statusColors: Record<RfqStatus, string> = {
  new: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  contacted: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  quoted: "bg-purple-500/15 text-purple-600 border-purple-500/30",
  won: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  lost: "bg-red-500/15 text-red-600 border-red-500/30",
};

export default function RfqInbox() {
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RfqStatus | "all">("all");
  const [selected, setSelected] = useState<Rfq | null>(null);
  const [draftStatus, setDraftStatus] = useState<RfqStatus>("new");
  const [draftNotes, setDraftNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rfqs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load RFQs", description: error.message, variant: "destructive" });
    } else {
      setRfqs((data ?? []) as Rfq[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const visible = filter === "all" ? rfqs : rfqs.filter((r) => r.status === filter);

  const openDetail = (rfq: Rfq) => {
    setSelected(rfq);
    setDraftStatus(rfq.status);
    setDraftNotes(rfq.notes ?? "");
  };

  const saveChanges = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase
      .from("rfqs")
      .update({ status: draftStatus, notes: draftNotes || null })
      .eq("id", selected.id);
    setSaving(false);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "RFQ updated" });
    setSelected(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">RFQ Inbox</h1>
          <p className="text-sm text-muted-foreground">Quote requests from the public website.</p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="quoted">Quoted</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No RFQs match this filter yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((rfq) => (
            <Card
              key={rfq.id}
              className="cursor-pointer hover:border-accent transition-colors"
              onClick={() => openDetail(rfq)}
            >
              <CardContent className="py-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground">{rfq.name}</h3>
                    <Badge variant="outline" className={statusColors[rfq.status]}>
                      {rfq.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {rfq.email}</span>
                    {rfq.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {rfq.phone}</span>}
                    {rfq.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {rfq.company}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{rfq.message}</p>
                </div>
                <p className="text-xs text-muted-foreground self-start">
                  {new Date(rfq.created_at).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>{new Date(selected.created_at).toLocaleString()}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 mt-6 text-sm">
                <Detail label="Email" value={selected.email} />
                {selected.phone && <Detail label="Phone" value={selected.phone} />}
                {selected.company && <Detail label="Company" value={selected.company} />}
                {selected.product_type && <Detail label="Product Type" value={selected.product_type} />}
                {selected.quantity && <Detail label="Quantity" value={selected.quantity} />}
                <div>
                  <p className="text-xs uppercase text-muted-foreground mb-1">Message</p>
                  <p className="text-foreground whitespace-pre-wrap">{selected.message}</p>
                </div>

                <div>
                  <p className="text-xs uppercase text-muted-foreground mb-1">Status</p>
                  <Select value={draftStatus} onValueChange={(v) => setDraftStatus(v as RfqStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="quoted">Quoted</SelectItem>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="text-xs uppercase text-muted-foreground mb-1">Internal Notes</p>
                  <Textarea
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    rows={4}
                    placeholder="Add notes for the team..."
                  />
                </div>

                <Button className="w-full" onClick={saveChanges} disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}
