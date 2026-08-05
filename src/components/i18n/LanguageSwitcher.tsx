import { Globe, Check } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LanguageSwitcherProps {
  variant?: "ghost" | "outline" | "default";
  size?: "default" | "sm" | "icon";
  showLabel?: boolean;
  className?: string;
}

export default function LanguageSwitcher({
  variant = "ghost",
  size = "sm",
  showLabel = true,
  className = "",
}: LanguageSwitcherProps) {
  const { language, setLanguage, isRtl } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={`group gap-1.5 font-medium text-[#5B5142] hover:text-[#1B2A4A] transition-colors ${className}`}
          title="Switch Language / زبان تبدیل کریں"
        >
          <Globe className="w-4 h-4 shrink-0 text-[#9A8F72] group-hover:text-[#1B2A4A] transition-colors" />
          {showLabel && (
            <span className="text-xs tracking-wide">
              {language === "en" ? "English" : "اردو"}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isRtl ? "start" : "end"} className="w-36">
        <DropdownMenuItem
          onClick={() => setLanguage("en")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="font-semibold text-xs">English</span>
          {language === "en" && <Check className="w-3.5 h-3.5 text-emerald-500" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setLanguage("ur")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="font-semibold text-sm">اردو</span>
          {language === "ur" && <Check className="w-3.5 h-3.5 text-emerald-500" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
