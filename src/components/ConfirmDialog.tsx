import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// One confirmation dialog for the whole app (plans/02 part C). Use for money,
// deletes/voids, status changes and stock movements:
//   const confirm = useConfirm();
//   const ok = await confirm({ title: "Record payment?", details: [["Amount", "Rs 5,000"]] });
//   if (!ok) return;            // ok.reason is set when requireReason is true

export interface ConfirmOptions {
  title: string;
  description?: string;
  details?: [string, string][];
  confirmLabel?: string;
  destructive?: boolean;
  requireReason?: string; // label for a required reason box (e.g. void)
}
type Result = false | { reason?: string };

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<Result>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState("");
  const resolver = useRef<(r: Result) => void>();

  const confirm = useCallback((o: ConfirmOptions) => {
    setReason("");
    setOpts(o);
    return new Promise<Result>((resolve) => (resolver.current = resolve));
  }, []);

  const close = (r: Result) => {
    resolver.current?.(r);
    setOpts(null);
  };

  const needsReason = !!opts?.requireReason;
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!opts} onOpenChange={(o) => !o && close(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.description && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          {opts?.details && opts.details.length > 0 && (
            <dl className="rounded-md border border-border bg-muted/40 p-3 text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {opts.details.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium text-foreground tabular-nums break-words">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {needsReason && (
            <div>
              <Label htmlFor="confirm-reason">{opts!.requireReason}</Label>
              <Textarea id="confirm-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={needsReason && !reason.trim()}
              className={opts?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={() => close({ reason: reason.trim() || undefined })}
            >
              {opts?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
