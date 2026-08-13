import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { fetchMyClientInboxMessages, sendClientQuery, type ClientInboxMessage } from "@/lib/clientInbox";

const statusColors: Record<ClientInboxMessage["status"], string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  resolved: "bg-slate-500/15 text-slate-600 border-slate-500/30",
};

export default function ClientInboxPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order_id");
  const [messages, setMessages] = useState<ClientInboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!user) return;
    try {
      const data = await fetchMyClientInboxMessages(user.id, 50);
      setMessages(data);
    } catch (err: any) {
      toast({ title: "Failed to load inbox", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const handleSend = async () => {
    if (!user || !query.trim()) return;
    setSending(true);
    try {
      await sendClientQuery(user.id, query.trim(), orderId);
      setQuery("");
      toast({ title: "Message sent" });
      await load();
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          {orderId
            ? "Ask a question about this order — our team will reply here."
            : "Message our team about your account or an order."}
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type your question..."
            rows={3}
          />
          <Button size="sm" disabled={sending || !query.trim()} onClick={handleSend}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1" /> Send</>}
          </Button>
        </CardContent>
      </Card>

      {messages.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No messages yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <Card key={m.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {m.type === "order_question" ? "Order Question" : "Query"}
                      </span>
                      <Badge className={`text-[10px] ${statusColors[m.status]}`}>{m.status}</Badge>
                    </div>
                    <p className="text-sm text-foreground mt-1">{m.message}</p>
                    {m.resolution_note && (
                      <p className="text-xs text-muted-foreground mt-1">Reply: {m.resolution_note}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      {new Date(m.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
