import { forwardRef } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Icon-only button: `label` becomes the accessible name and the tooltip. 36px hit area. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(
  ({ label, className, variant = "ghost", ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button ref={ref} variant={variant} size="icon" aria-label={label} className={cn("h-9 w-9", className)} {...props} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  ),
);
IconButton.displayName = "IconButton";
