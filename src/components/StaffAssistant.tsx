import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { HelpCircle, Loader2, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Msg = { role: "user" | "assistant"; content: string };

// Internal help assistant for admin/staff/managers/workers (plans/02 part D).
// Separate from the public website ChatBot. Read-only; the edge function only
// sees what this user's permissions allow.
export default function StaffAssistant({ bottomOffset = "1.5rem" }: { bottomOffset?: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const ask = async (text: string) => {
    const q = text.trim().slice(0, 1000);
    if (!q || busy) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("staff-assistant", { body: { messages: next.slice(-10) } });
    const reply = error ? "Sorry, the helper is not available right now. Please try again or ask an admin." : (data?.reply ?? data?.error ?? "No answer.");
    setMessages([...next, { role: "assistant", content: reply }]);
    setBusy(false);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const suggestions = ["Order ORD-123 kahan tak pohncha?", "How do I enter a supervisor slip (Manager Entry)?", "Payment approve kaise hoti hai?"];

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{ bottom: bottomOffset }}
          className="fixed right-4 z-50 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg px-4 h-11 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open help assistant"
        >
          <HelpCircle className="w-5 h-5" /> <span className="text-sm font-medium hidden sm:inline">Help</span>
        </button>
      )}
      {open && (
        <div
          style={{ bottom: bottomOffset }}
          className="fixed right-4 z-50 w-[calc(100vw-2rem)] max-w-sm h-[min(32rem,70vh)] flex flex-col rounded-xl border border-border bg-card shadow-2xl"
          role="dialog"
          aria-label="Help assistant"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <p className="font-medium text-sm">GarmentFlow Helper</p>
              <p className="text-xs text-muted-foreground">Read-only. Answers in English, Urdu or Roman Urdu.</p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Close help"><X className="w-4 h-4" /></Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted-foreground">Ask how to do something, or where an order/batch has reached.</p>
                {suggestions.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="block w-full text-left rounded-md border border-border px-3 py-2 hover:bg-muted">{s}</button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-8 rounded-lg bg-primary text-primary-foreground px-3 py-2" : "mr-4 rounded-lg bg-muted px-3 py-2 prose prose-sm dark:prose-invert max-w-none"}>
                {m.role === "user" ? m.content : (
                  // No images or live links: a reply can't load remote URLs (prompt-injection exfiltration).
                  <ReactMarkdown disallowedElements={["img"]} components={{ a: ({ children }) => <span>{children}</span> }}>{m.content}</ReactMarkdown>
                )}
              </div>
            ))}
            {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            <div ref={endRef} />
          </div>
          <form className="flex gap-2 p-3 border-t border-border" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question…" maxLength={1000} aria-label="Question" />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send"><Send className="w-4 h-4" /></Button>
          </form>
        </div>
      )}
    </>
  );
}
