"use client";

export function BrandLockup({ size = "header" }: { size?: "header" | "footer" }) {
  const img = size === "header" ? "h-16 w-auto max-w-[min(20rem,72vw)] sm:h-[4.75rem] md:h-20" : "h-11 w-auto max-w-[12rem]";
  const ai = size === "header" ? "text-3xl sm:text-4xl" : "text-2xl";
  return (
    <span className="brand-lockup inline-flex items-center gap-2">
      <img src="/brand/qserve-logo-wordmark.png" alt="QServe AI" className={`${img} object-contain object-left`} />
      <span className={`font-black tracking-tight text-navy ${ai}`}>AI</span>
    </span>
  );
}
