import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Cap message size client-side to mirror the server-side Zod schema
const userMessageSchema = z.string().trim().min(1).max(2000);

// Floating AI assistant for En En Garments. Sits at the bottom-left so it does
// not collide with the WhatsApp widget on the bottom-right.
export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm the **En En Garments** assistant. Ask me about our products, manufacturing capabilities, MOQs, exports, or how to request a quote.",
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Auto-scroll to the latest message whenever the list changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (streaming) return;

    const validated = userMessageSchema.safeParse(input);
    if (!validated.success) {
      toast({ title: "Message is required", description: "Please type a question first.", variant: "destructive" });
      return;
    }

    const next: ChatMessage[] = [...messages, { role: "user", content: validated.data }];
    setMessages(next);
    setInput("");
    setStreaming(true);

    // Insert an empty assistant placeholder we will progressively fill from the stream
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("Empty response");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        // Update the last assistant message with the accumulated text
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      toast({ title: "Chat error", description: message, variant: "destructive" });
      // Remove the empty assistant placeholder on error
      setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <>
      {/* Toggle button in bottom-left to avoid the WhatsApp widget */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open AI assistant"
        className="fixed bottom-6 left-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform"
      >
        {open ? <X size={22} /> : <MessageSquare size={24} />}
      </button>

      {open && (
        <div className="fixed bottom-24 left-6 z-50 w-[min(92vw,380px)] h-[min(70vh,560px)] bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
          <header className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-gold" />
            <div>
              <p className="font-heading font-semibold text-sm">En En Garments Assistant</p>
              <p className="text-xs opacity-70">Ask about products, MOQs, exports</p>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
                      {m.content ? (
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      ) : (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={sendMessage} className="border-t border-border p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question..."
              maxLength={2000}
              disabled={streaming}
              className="flex-1 px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" size="icon" disabled={streaming || !input.trim()}>
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
