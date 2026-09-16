"use client";

import { useEffect, useRef, useState } from "react";
import { CURRENCIES, CURRENCY_META, useMoney, type Currency } from "@/lib/currency";
import { useLocale } from "@/lib/use-locale";

function Flag({ cc, emoji }: { cc: string; emoji: string }) {
  return (
    <span className="currency-flag-wrap" aria-hidden>
      <img className="currency-flag" src={`/flags/${cc}.svg`} width={22} height={16} alt="" />
      <span className="currency-flag-emoji">{emoji}</span>
    </span>
  );
}

export function CurrencySwitch() {
  const locale = useLocale();
  const ar = locale === "ar";
  const money = useMoney();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const selected = money.currency;
  const others = CURRENCIES.filter((c) => c !== selected);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="currency-bar" ref={box}>
      <button
        type="button"
        className="currency-only"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ar ? `العملة ${selected}` : `Currency ${selected}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="currency-only-code">{selected}</span>
        <span className="currency-only-caret" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <ul className="currency-menu" role="listbox" aria-label={ar ? "اختر العملة" : "Choose currency"}>
          {others.map((code) => {
            const row = CURRENCY_META[code];
            return (
              <li key={code} role="option">
                <button
                  type="button"
                  onClick={() => {
                    money.setCurrency(code as Currency);
                    setOpen(false);
                  }}
                >
                  <Flag cc={row.cc} emoji={row.flag} />
                  <span className="currency-menu-code">{code}</span>
                  <span className="currency-menu-name">{ar ? row.ar : row.en}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
