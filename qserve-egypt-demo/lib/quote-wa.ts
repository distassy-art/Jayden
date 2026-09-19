import { site } from "./content";

export type QuoteContact = { name: string; phone: string; email: string };
export type QuoteItem = { qty: number; sku: string; name: string };

const CONTACT_KEY = "qserve-quote-contact";

export function saveQuoteContact(c: QuoteContact) {
  try {
    localStorage.setItem(CONTACT_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export function loadQuoteContact(): QuoteContact {
  try {
    const raw = JSON.parse(localStorage.getItem(CONTACT_KEY) || "{}") as Partial<QuoteContact>;
    return {
      name: String(raw.name || "").trim(),
      phone: String(raw.phone || "").trim(),
      email: String(raw.email || "").trim(),
    };
  } catch {
    return { name: "", phone: "", email: "" };
  }
}

export function quoteWhatsAppText(opts: { ar: boolean; items?: QuoteItem[]; product?: string; contact?: QuoteContact }) {
  const c = opts.contact || (typeof window !== "undefined" ? loadQuoteContact() : { name: "", phone: "", email: "" });
  const lines = [
    opts.ar ? "طلب عرض سعر — QServe AI Egypt" : "Quote request — QServe AI Egypt",
    "#سعر",
  ];
  if (c.name) lines.push(`${opts.ar ? "الاسم" : "Name"}: ${c.name}`);
  if (c.phone) lines.push(`${opts.ar ? "الموبايل" : "Phone"}: ${c.phone}`);
  if (c.email) lines.push(`${opts.ar ? "الإيميل" : "Email"}: ${c.email}`);
  if (opts.product) lines.push(`${opts.ar ? "الصنف" : "Item"}: ${opts.product}`);
  if (opts.items?.length) {
    lines.push(opts.ar ? "البنود:" : "Items:");
    for (const row of opts.items) {
      lines.push(`${row.qty}× ${row.sku} ${row.name}`.trim());
    }
  }
  return lines.join("\n");
}

export function quoteWhatsAppUrl(text: string) {
  return `${site.whatsapp}?text=${encodeURIComponent(text)}`;
}

export function openQuoteWhatsApp(opts: { ar: boolean; items?: QuoteItem[]; product?: string; contact?: QuoteContact }) {
  const url = quoteWhatsAppUrl(quoteWhatsAppText(opts));
  window.location.href = url;
}
