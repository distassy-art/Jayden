"use client";

import { useMoney } from "@/lib/currency";

export function MoneyText({ usd, ar, className = "" }: { usd: number; ar: boolean; className?: string }) {
  const money = useMoney();
  return (
    <span className={`money ${className}`} dir="ltr">
      {money.format(usd, ar)}
    </span>
  );
}
