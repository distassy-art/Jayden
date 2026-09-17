"use client";

export function BrandLockup({ size = "header" }: { size?: "header" | "footer" }) {
  const h = size === "header" ? "h-11 sm:h-12" : "h-10";
  return (
    <span className="brand-lockup inline-flex items-center gap-1.5">
      <img
        src="/brand/qserve-logo-wordmark.png"
        alt="QServe AI"
        className={`${h} w-auto max-w-[min(9.5rem,42vw)] object-contain object-left`}
      />
      <span className={`font-black tracking-tight text-navy ${size === "header" ? "text-xl sm:text-2xl" : "text-lg"}`}>AI</span>
    </span>
  );
}
