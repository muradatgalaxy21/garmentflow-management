import { useEffect, useState } from "react";
import { Loader2, PlayCircle, CheckCircle2, MessageSquare, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { DEPARTMENT_LABELS } from "@/lib/departmentEntries";
import {
  fetchInboxMessages,
  resolveEndVerification,
  resolveStartVerification,
  resolveWorkerQuery,
  type InboxMessage,
} from "@/lib/workerInbox";
import { fetchClientInboxMessages, resolveClientQuery, type ClientInboxMessage } from "@/lib/clientInbox";

const typeConfig: Record<InboxMessage["type"], { label: string; icon: typeof PlayCircle; color: string }> = {
  batch_start_verification: { label: "Batch Start", icon: PlayCircle, color: "text-blue-600" },
  batch_end_verification: { label: "Batch End", icon: CheckCircle2, color: "text-emerald-600" },
  worker_query: { label: "Query", icon: MessageSquare, color: "text-slate-500" },
};

const statusColors: Record<InboxMessage["status"], string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  accepted: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  denied: "bg-red-500/15 text-red-600 border-red-500/30",
  reprocess: "bg-purple-500/15 text-purple-600 border-purple-500/30",
  resolved: "bg-slate-500/15 text-slate-600 border-slate-500/30",
};

function WorkerInboxTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const data = await fetchInboxMessages(100);
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
  }, []);

  const act = async (fn: () => Promise<void>, id: string) => {
    if (!user) return;
    setBusyId(id);
    try {
      await fn();
      toast({ title: "Updated" });
      await load();
    } catch (err: any) {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const visible = messages.filter((m) => (filter === "pending" ? m.status === "pending" : true));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Batch start/end verifications take priority over worker queries.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant={filter === "pending" ? "default" : "outline"} onClick={() => setFilter("pending")}>
            Pending
          </Button>
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            All
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filter === "pending" ? "No pending items." : "No messages yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((m) => {
            const config = typeConfig[m.type];
            const Icon = config.icon;
            const isPending = m.status === "pending";
            return (
              <Card key={m.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{config.label}</span>
                          {m.department && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {DEPARTMENT_LABELS[m.department]}
                            </Badge>
                          )}
                          <Badge className={`text-[10px] ${statusColors[m.status]}`}>{m.status}</Badge>
                        </div>
                        <p className="text-sm text-foreground mt-1">{m.message}</p>
                        {m.resolution_note && (
                          <p className="text-xs text-muted-foreground mt-1">Note: {m.resolution_note}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground/70 mt-1">
                          {new Date(m.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {isPending && (
                    <div className="space-y-2 border-t pt-3">
                      <Textarea
                        placeholder="Optional note..."
                        value={notes[m.id] ?? ""}
                        onChange={(e) => setNotes((s) => ({ ...s, [m.id]: e.target.value }))}
                        rows={2}
                        className="text-xs"
                      />
                      <div className="flex flex-wrap gap-2">
                        {m.type === "batch_start_verification" && (
                          <>
                            <Button
                              size="sm"
                              disabled={busyId === m.id}
                              onClick={() =>
                                act(() => resolveStartVerification(m, "accepted", user!.id, notes[m.id]), m.id)
                              }
                            >
                              Accept (enable End QR)
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busyId === m.id}
                              onClick={() =>
                                act(() => resolveStartVerification(m, "denied", user!.id, notes[m.id]), m.id)
                              }
                            >
                              Deny
                            </Button>
                          </>
                        )}
                        {m.type === "batch_end_verification" && (
                          <>
                            <Button
                              size="sm"
                              disabled={busyId === m.id}
                              onClick={() => act(() => resolveEndVerification(m, "accepted", user!.id, notes[m.id]), m.id)}
                            >
                              Accept & Close
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === m.id}
                              onClick={() => act(() => resolveEndVerification(m, "reprocess", user!.id, notes[m.id]), m.id)}
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reprocess
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busyId === m.id}
                              onClick={() => act(() => resolveEndVerification(m, "denied", user!.id, notes[m.id]), m.id)}
                            >
                              Deny
                            </Button>
                          </>
                        )}
                        {m.type === "worker_query" && (
                          <Button
                            size="sm"
                            disabled={busyId === m.id}
                            onClick={() => act(() => resolveWorkerQuery(m, user!.id, notes[m.id]), m.id)}
                          >
                            Mark Resolved
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const clientStatusColors: Record<ClientInboxMessage["status"], string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  resolved: "bg-slate-500/15 text-slate-600 border-slate-500/30",
};

function ClientInboxTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ClientInboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const data = await fetchClientInboxMessages(100);
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
  }, []);

  const act = async (m: ClientInboxMessage) => {
    if (!user) return;
    setBusyId(m.id);
    try {
      await resolveClientQuery(m, user.id, notes[m.id]);
      toast({ title: "Resolved" });
      await load();
    } catch (err: any) {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const visible = messages.filter((m) => (filter === "pending" ? m.status === "pending" : true));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Free-text questions clients send about their account or orders.</p>
        <div className="flex gap-2">
          <Button size="sm" variant={filter === "pending" ? "default" : "outline"} onClick={() => setFilter("pending")}>
            Pending
          </Button>
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            All
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filter === "pending" ? "No pending items." : "No messages yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((m) => {
            const isPending = m.status === "pending";
            return (
              <Card key={m.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <MessageSquare className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {m.type === "order_question" ? "Order Question" : "Query"}
                        </span>
                        <Badge className={`text-[10px] ${clientStatusColors[m.status]}`}>{m.status}</Badge>
                      </div>
                      <p className="text-sm text-foreground mt-1">{m.message}</p>
                      {m.resolution_note && (
                        <p className="text-xs text-muted-foreground mt-1">Note: {m.resolution_note}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground/70 mt-1">
                        {new Date(m.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {isPending && (
                    <div className="space-y-2 border-t pt-3">
                      <Textarea
                        placeholder="Reply (optional)..."
                        value={notes[m.id] ?? ""}
                        onChange={(e) => setNotes((s) => ({ ...s, [m.id]: e.target.value }))}
                        rows={2}
                        className="text-xs"
                      />
                      <Button size="sm" disabled={busyId === m.id} onClick={() => act(m)}>
                        Mark Resolved
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="font-heading text-2xl">Inbox</h1>
        <p className="text-sm text-muted-foreground">Worker batch verifications/queries and client questions.</p>
      </div>

      <Tabs defaultValue="worker">
        <TabsList>
          <TabsTrigger value="worker">Worker</TabsTrigger>
          <TabsTrigger value="client">Client</TabsTrigger>
        </TabsList>
        <TabsContent value="worker" className="mt-4">
          <WorkerInboxTab />
        </TabsContent>
        <TabsContent value="client" className="mt-4">
          <ClientInboxTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
