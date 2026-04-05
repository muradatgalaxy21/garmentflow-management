import { useState } from "react";

// Supported currencies for the B2B pricing display
const currencies = ["PKR", "USD", "EUR", "GBP"] as const;
export type Currency = (typeof currencies)[number];

// Approximate exchange rates relative to PKR (base)
// These should be updated from a real API in production
export const exchangeRates: Record<Currency, number> = {
  PKR: 1,
  USD: 0.0036,
  EUR: 0.0033,
  GBP: 0.0028,
};

export const currencySymbols: Record<Currency, string> = {
  PKR: "Rs",
  USD: "$",
  EUR: "E",
  GBP: "P",
};

export default function CurrencyToggle() {
  const [active, setActive] = useState<Currency>("USD");

  return (
    <div className="flex items-center rounded-md border border-border bg-muted/50 overflow-hidden">
      {currencies.map((cur) => (
        <button
          key={cur}
          onClick={() => setActive(cur)}
          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
            active === cur
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {cur}
        </button>
      ))}
    </div>
  );
}
