"use client";

import { useLocale } from "@/lib/use-locale";
import { openQuoteWhatsApp, quoteWhatsAppText, quoteWhatsAppUrl, type QuoteItem } from "@/lib/quote-wa";

export function QuoteWaButton({
  className = "btn-go",
  product,
  items,
  children,
  onClick,
}: {
  className?: string;
  product?: string;
  items?: QuoteItem[];
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  const locale = useLocale();
  const ar = locale !== "en";
  const href = quoteWhatsAppUrl(quoteWhatsAppText({ ar, product, items }));
  return (
    <a
      className={className}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
        openQuoteWhatsApp({ ar, product, items });
      }}
    >
      {children || (ar ? "طلب عرض سعر" : "Request a quote")}
    </a>
  );
}
