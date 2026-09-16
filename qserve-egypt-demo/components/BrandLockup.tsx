"use client";

import { site } from "@/lib/content";

export function BrandLockup({ size = "header" }: { size?: "header" | "footer" }) {
  const h = size === "header" ? "h-16 sm:h-[4.75rem]" : "h-14";
  return (
    <span className="brand-lockup inline-flex items-center rounded-2xl bg-white px-1 py-0.5">
      <img
        src="/brand/qserve-ai-official-logo.jpg"
        alt={`${site.brandEn} ${site.brandAr}`}
        className={`${h} w-auto max-w-[min(11rem,46vw)] object-contain object-left`}
      />
    </span>
  );
}
