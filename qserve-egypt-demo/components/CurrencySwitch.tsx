"use client";

import { CURRENCIES, useMoney, type Currency } from "@/lib/currency";
import { useLocale } from "@/lib/use-locale";

export function CurrencySwitch() {
  const locale = useLocale();
  const ar = locale === "ar";
  const money = useMoney();
  return (
    <div className="currency-bar" role="group" aria-label={ar ? "العملة" : "Currency"}>
      <span className="currency-bar-label">{ar ? "Currency" : "Currency"}</span>
      <div className="currency-switch">
        {CURRENCIES.map((code) => (
          <button
            key={code}
            type="button"
            className={money.currency === code ? "is-on" : ""}
            aria-pressed={money.currency === code}
            aria-label={code}
            onClick={() => money.setCurrency(code as Currency)}
          >
            {code}
          </button>
        ))}
      </div>
    </div>
  );
}
