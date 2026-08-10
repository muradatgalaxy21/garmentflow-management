import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Type-to-confirm delete dialog: user must retype the exact name/number to proceed. */
export default function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  confirmValue,
  fieldLabel,
  warning,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  confirmValue: string;
  fieldLabel: string;
  warning?: string;
  onConfirm: () => void;
}) {
  const [input, setInput] = useState("");

  useEffect(() => {
    if (open) setInput("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-red-500">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {warning ?? "This cannot be undone."} Type <strong className="text-foreground">{confirmValue}</strong> to confirm.
          </p>
          <div>
            <Label className="text-xs">{fieldLabel}</Label>
            <Input value={input} onChange={(e) => setInput(e.target.value)} className="mt-1" autoFocus />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={input !== confirmValue}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
