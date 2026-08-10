import { useEffect, useState } from "react";
import { Loader2, PlayCircle, CheckCircle2, MessageSquare, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DEPARTMENT_LABELS, type Department } from "@/lib/departmentEntries";
import { fetchMyInboxMessages, sendWorkerQuery, type InboxMessage } from "@/lib/workerInbox";

const typeConfig: Record<InboxMessage["type"], { label: string; icon: typeof PlayCircle; color: string }> = {
  batch_start_verification: { label: "Batch Start", icon: PlayCircle, color: "text-blue-600" },
  batch_end_verification: { label: "Batch End", icon: CheckCircle2, color: "text-emerald-600" },
  worker_query: { label: "My Query", icon: MessageSquare, color: "text-slate-500" },
};

const statusColors: Record<InboxMessage["status"], string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-300",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-300",
  denied: "bg-red-50 text-red-700 border-red-300",
  reprocess: "bg-purple-50 text-purple-700 border-purple-300",
  resolved: "bg-slate-100 text-slate-600 border-slate-300",
};

export default function InboxPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [department, setDepartment] = useState<Department | null>(null);
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!user) return;
    try {
      const data = await fetchMyInboxMessages(user.id, 50);
      setMessages(data);
    } catch (err: any) {
      toast({ title: "Failed to load inbox", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("department")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setDepartment((data?.department as Department | null) ?? null));
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const handleSend = async () => {
    if (!user || !query.trim()) return;
    setSending(true);
    try {
      await sendWorkerQuery(user.id, query.trim(), null, department);
      setQuery("");
      toast({ title: "Query sent to admin" });
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
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <div className="bg-[#e9ecef]/80 border border-slate-200/80 rounded-xl p-5 text-center shadow-xs">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium text-slate-600 border border-slate-300 bg-white/70">
          Inbox
        </span>
        <h1 className="text-2xl font-bold text-slate-900 mt-3 font-sans">Batch Updates & Queries</h1>
      </div>

      <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl shadow-xs">
        <CardContent className="p-4 space-y-3">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask admin a question..."
            rows={2}
            className="bg-white border-slate-300 text-slate-900 text-xs rounded-lg"
          />
          <Button
            size="sm"
            className="w-full bg-[#4675a8] hover:bg-[#38608b] text-white rounded-lg"
            disabled={sending || !query.trim()}
            onClick={handleSend}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1" /> Send Query</>}
          </Button>
        </CardContent>
      </Card>

      {messages.length === 0 ? (
        <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl">
          <CardContent className="p-4 text-center text-slate-500 text-xs font-medium">
            No messages yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => {
            const config = typeConfig[m.type];
            const Icon = config.icon;
            return (
              <Card key={m.id} className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-700">{config.label}</span>
                        {m.department && (
                          <Badge variant="outline" className="text-[10px] capitalize border-slate-300">
                            {DEPARTMENT_LABELS[m.department]}
                          </Badge>
                        )}
                        <Badge className={`text-[10px] rounded-full ${statusColors[m.status]}`}>{m.status}</Badge>
                      </div>
                      <p className="text-sm text-slate-800 mt-1">{m.message}</p>
                      {m.resolution_note && (
                        <p className="text-xs text-slate-500 mt-1">Admin: {m.resolution_note}</p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">{new Date(m.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
