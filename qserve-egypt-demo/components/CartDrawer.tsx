"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { site } from "@/lib/content";
import { localizedHref } from "@/lib/i18n";
import { useCart, type HydratedLine } from "@/lib/cart";
import { useLocale } from "@/lib/use-locale";
import { postJson, sessionId } from "@/lib/track";
import { loadQuoteContact, openQuoteWhatsApp, saveQuoteContact } from "@/lib/quote-wa";
import { ShipPicker } from "./ShipPicker";

function cartItems(hydrated: HydratedLine[], ar: boolean) {
  return hydrated.map((l) => ({
    qty: l.qty,
    sku: l.sku,
    name: ar ? l.item.nameAr : l.item.nameEn,
  }));
}

function QuoteSubmit({ hydrated, ar, path }: { hydrated: HydratedLine[]; ar: boolean; path: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const c = loadQuoteContact();
    setName(c.name);
    setPhone(c.phone);
    setEmail(c.email);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const contact = { name: name.trim(), phone: phone.trim(), email: email.trim() };
    if (!contact.phone) {
      setErr(ar ? "الموبايل مطلوب عشان نفتح واتساب." : "Phone is required so we can open WhatsApp.");
      return;
    }
    setErr("");
    saveQuoteContact(contact);
    const items = cartItems(hydrated, ar);
    const summary = items.map((i) => `${i.qty}×${i.sku}`).join(" · ");
    postJson("/api/lead", {
      sessionId: sessionId(),
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      interest: "quote-cart",
      kind: "quote",
      locale: ar ? "ar" : "en",
      path,
      summary: `#سعر ${summary}`.slice(0, 500),
      cart: hydrated.map((l) => ({ sku: l.sku, qty: l.qty })),
      transcript: [{ role: "user", text: `#سعر ${summary}` }],
    });
    openQuoteWhatsApp({ ar, contact, items });
  }

  if (!hydrated.length) return null;

  return (
    <form className="mt-3 space-y-2" onSubmit={onSubmit}>
      <p className="text-sm font-extrabold text-navy">{ar ? "اطلب العرض على واتساب" : "Get the quote on WhatsApp"}</p>
      <p className="text-[11px] leading-5 text-navy/65">
        {ar
          ? "بعد الإرسال هتتنقل واتساب على طول. مفيش سعر هنا ومش هنكلمك من الموقع."
          : "Submit sends you to WhatsApp immediately. No prices here — the quote happens there."}
      </p>
      <input className="field !mt-0" name="name" autoComplete="name" placeholder={ar ? "الاسم" : "Name"} value={name} onChange={(e) => setName(e.target.value)} />
      <input className="field !mt-0" name="phone" autoComplete="tel" required inputMode="tel" placeholder={ar ? "الموبايل (مطلوب)" : "Phone (required)"} value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input className="field !mt-0" name="email" autoComplete="email" type="email" placeholder={ar ? "الإيميل" : "Email"} value={email} onChange={(e) => setEmail(e.target.value)} />
      {err && <p className="text-xs font-bold text-red-700">{err}</p>}
      <button className="btn-go w-full" type="submit">
        {ar ? "طلب عرض سعر على واتساب" : "Request a quote on WhatsApp"}
      </button>
    </form>
  );
}

export function CartDrawer() {
  const locale = useLocale();
  const ar = locale === "ar";
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onAdd = (e: Event) => {
      const sku = String((e as CustomEvent).detail?.sku || "");
      setOpen(true);
      setFlash(sku);
      window.setTimeout(() => setFlash(""), 1100);
    };
    window.addEventListener("qserve:cart-open", onOpen);
    window.addEventListener("qserve:cart-add", onAdd);
    return () => {
      window.removeEventListener("qserve:cart-open", onOpen);
      window.removeEventListener("qserve:cart-add", onAdd);
    };
  }, []);

  const href = (p: string) => localizedHref(locale, p);

  return (
    <aside className={`cart-drawer glass ${open ? "is-open" : ""}`} dir={ar ? "rtl" : "ltr"} aria-hidden={!open}>
      <div className="flex items-center justify-between border-b border-navy/10 px-4 py-3">
        <div>
          <p className="text-xs font-extrabold text-cyan">{ar ? "طلب عرض سعر" : "Quote request"}</p>
          <h2 className="text-lg font-black text-navy">{ar ? "السلة" : "Cart"}</h2>
        </div>
        <button type="button" className="agent-x" aria-label={ar ? "إغلاق السلة" : "Close cart"} onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {cart.hydrated.length === 0 && (
          <p className="rounded-2xl bg-void p-4 text-sm text-navy/70">
            {ar ? "فاضية. ضيف أصناف بعدين اطلب العرض على واتساب." : "Empty. Add items, then request the quote on WhatsApp."}
          </p>
        )}
        {cart.hydrated.map((l) => (
          <div key={l.sku} className={`cart-line flex gap-3 rounded-2xl border border-navy/10 bg-white p-2 ${flash === l.sku ? "cart-line-in" : ""}`}>
            <img src={l.thumb} alt="" className="h-16 w-16 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold leading-5">{ar ? l.item.nameAr : l.item.nameEn}</p>
              <p className="font-mono text-[10px] text-navy/50">{l.sku}</p>
              <p className="text-xs font-bold text-cyan">{ar ? "طلب عرض سعر" : "Quote line"}</p>
              <div className="mt-1 flex items-center gap-2">
                <button type="button" className="qty-btn" onClick={() => cart.setQty(l.sku, l.qty - 1)} aria-label="minus">
                  −
                </button>
                <span className="w-6 text-center text-sm font-black">{l.qty}</span>
                <button type="button" className="qty-btn" onClick={() => cart.setQty(l.sku, l.qty + 1)} aria-label="plus">
                  +
                </button>
                <button type="button" className="ms-auto text-xs font-bold text-red-700" onClick={() => cart.removeLine(l.sku)}>
                  {ar ? "حذف" : "Remove"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {!cart.hydrated.some((l) => l.sku.startsWith("AMC")) && cart.hydrated.length > 0 && (
          <button
            type="button"
            className="w-full rounded-2xl border border-dashed border-cyan bg-teal/10 px-3 py-3 text-start text-sm font-bold text-cyan"
            onClick={() => cart.addLine("AMC-STD", 1)}
          >
            {ar ? "أضف عقد صيانة سنوي (AMC-STD) — بند عرض سعر" : "Add annual care (AMC-STD) — quote line"}
          </button>
        )}
        {cart.hydrated.length > 0 && <ShipPicker hydrated={cart.hydrated} ar={ar} />}
      </div>
      <div className="border-t border-navy/10 p-4">
        <p className="text-sm font-black text-cyan">{ar ? "مفيش إجمالي على الموقع — العرض على واتساب." : "No totals on the site — the quote is on WhatsApp."}</p>
        <QuoteSubmit hydrated={cart.hydrated} ar={ar} path={ar ? "/" : "/en"} />
        <Link href={href("/cart")} className="mt-2 block text-center text-xs font-bold text-cyan" onClick={() => setOpen(false)}>
          {ar ? "صفحة السلة كاملة" : "Full cart page"}
        </Link>
      </div>
    </aside>
  );
}

export function CartButton() {
  const locale = useLocale();
  const ar = locale === "ar";
  const { count, openCartDrawer } = useCart();
  return (
    <button type="button" className="relative rounded-full border border-navy/15 bg-white px-3 py-2 text-sm font-extrabold" onClick={openCartDrawer}>
      {ar ? "السلة" : "Cart"}
      {count > 0 && <span className="ms-1 rounded-full bg-teal px-1.5 text-[10px] text-paper">{count}</span>}
    </button>
  );
}

export function CartPageView() {
  const locale = useLocale();
  const ar = locale === "ar";
  const cart = useCart();
  return (
    <div className="mesh mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-black text-navy">{ar ? "طلب عرض سعر" : "Quote request"}</h1>
      <p className="mt-2 text-navy/70">
        {ar
          ? "السلة دي طلب عرض — مش كاشير. بعد الاسم والموبايل هتفتح واتساب على طول."
          : "This cart is a quote request, not checkout. After name and phone, WhatsApp opens immediately."}
      </p>
      <div className="mt-6 space-y-3">
        {cart.hydrated.length === 0 && <p className="glass rounded-3xl p-6">{ar ? "السلة فاضية." : "Cart is empty."}</p>}
        {cart.hydrated.map((l) => (
          <div key={l.sku} className="flex gap-4 rounded-3xl border border-navy/10 bg-white p-4">
            <img src={l.thumb} alt="" className="h-20 w-20 rounded-2xl object-cover" />
            <div className="flex-1">
              <p className="font-extrabold">{ar ? l.item.nameAr : l.item.nameEn}</p>
              <p className="font-mono text-xs text-navy/50">{l.sku}</p>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" className="qty-btn" onClick={() => cart.setQty(l.sku, l.qty - 1)}>
                  −
                </button>
                <span className="font-black">{l.qty}</span>
                <button type="button" className="qty-btn" onClick={() => cart.setQty(l.sku, l.qty + 1)}>
                  +
                </button>
                <button type="button" className="text-sm font-bold text-red-700" onClick={() => cart.removeLine(l.sku)}>
                  {ar ? "حذف" : "Remove"}
                </button>
              </div>
            </div>
            <p className="text-sm font-black text-cyan">{ar ? "طلب عرض سعر" : "Quote"}</p>
          </div>
        ))}
      </div>
      {cart.hydrated.length > 0 && (
        <div className="mt-6">
          <ShipPicker hydrated={cart.hydrated} ar={ar} />
        </div>
      )}
      <div className="glass mt-6 rounded-3xl p-6">
        <QuoteSubmit hydrated={cart.hydrated} ar={ar} path={ar ? "/cart" : "/en/cart"} />
        <p className="mt-3 text-xs text-navy/55" dir="ltr">
          WhatsApp {site.phoneDisplay}
        </p>
      </div>
    </div>
  );
}
