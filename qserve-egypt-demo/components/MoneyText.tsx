"use client";

export function MoneyText({ ar, className = "" }: { usd?: number; ar: boolean; className?: string }) {
  return (
    <span className={`money ${className}`}>
      {ar ? "طلب عرض سعر" : "Request quote"}
    </span>
  );
}
