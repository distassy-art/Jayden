"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { site } from "@/lib/content";
import { localizedHref } from "@/lib/i18n";
import { useCart, whatsappCartText } from "@/lib/cart";
import { useLocale } from "@/lib/use-locale";
import { useMoney } from "@/lib/currency";
import { catalogWeightKg, quoteOnlyHint, useShip } from "@/lib/shipping";
import { MoneyText } from "./MoneyText";
import { FulfillmentCta, ShipPicker } from "./ShipPicker";

function Totals({ catalogUsd, quoteCount, ar }: { catalogUsd: number; quoteCount: number; ar: boolean }) {
  const money = useMoney();
  const { group, option } = useShip();
  const cart = useCart();
  const kg = catalogWeightKg(cart.hydrated);
  return (
    <div className="cart-totals">
      <div className="flex justify-between text-sm">
        <span>{ar ? "المجموع الفرعي (كتالوج 2×)" : "Subtotal (catalog 2×)"}</span>
        <MoneyText usd={catalogUsd} ar={ar} className="text-end text-sm" />
      </div>
      <div className="mt-2 flex justify-between text-sm">
        <span>{ar ? "عقد صيانة / بنود عرض" : "AMC / quote lines"}</span>
        <span className="font-bold text-cyan">{quoteCount ? (ar ? `${quoteCount} بند — يُسعَّر في العرض` : `${quoteCount} line(s) — priced on quote`) : "—"}</span>
      </div>
      <div className="mt-2 flex justify-between text-sm">
        <span>{ar ? "شحن / تركيب" : "Freight / install"}</span>
        <span className="text-end text-xs font-bold text-cyan">{ar ? "تقدير — ليس في الإجمالي" : "Estimate — not in the total"}</span>
      </div>
      {kg > 0 && (
        <p className="money mt-1 text-[11px] text-navy/55" dir="ltr">
          {ar ? "وزن تقديري" : "Est. weight"} {kg} kg
        </p>
      )}
      <p className="mt-2 text-[11px] leading-5 text-navy/60">{quoteOnlyHint(cart.hydrated, ar, group)}</p>
      <div className="mt-3 flex justify-between border-t border-navy/10 pt-3 text-base font-black">
        <span>{ar ? "الإجمالي الظاهر" : "Visible total"}</span>
        <MoneyText usd={catalogUsd} ar={ar} className="text-end text-base" />
      </div>
      <p className="money mt-2 text-[11px] leading-4 text-navy/55" dir="ltr">
        {money.note(ar)}
        {option ? ` · ${ar ? option.ar : option.en}` : ""}
      </p>
    </div>
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
      const sku = (e as CustomEvent).detail?.sku as string;
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
  const wa = `${site.whatsapp}?text=${encodeURIComponent(whatsappCartText(cart.hydrated, ar))}`;

  return (
    <aside className={`cart-drawer glass ${open ? "is-open" : ""}`} dir={ar ? "rtl" : "ltr"} aria-hidden={!open}>
      <div className="flex items-center justify-between border-b border-navy/10 px-4 py-3">
        <div>
          <p className="text-xs font-extrabold text-cyan">{ar ? "السلة تتحرك قدامك" : "Watch the cart fill"}</p>
          <h2 className="text-lg font-black text-navy">{ar ? "السلة" : "Cart"}</h2>
        </div>
        <button type="button" className="agent-x" aria-label={ar ? "إغلاق السلة" : "Close cart"} onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {cart.hydrated.length === 0 && (
          <p className="rounded-2xl bg-void p-4 text-sm text-navy/70">
            {ar ? "فاضية. قل للمساعد «محتاج شاشات» — يسأل كام واحدة ثم يضيف السطر هنا." : "Empty. Tell the associate you need screens — they ask how many, then the line appears here."}
          </p>
        )}
        {cart.hydrated.map((l) => (
          <div key={l.sku} className={`cart-line flex gap-3 rounded-2xl border border-navy/10 bg-white p-2 ${flash === l.sku ? "cart-line-in" : ""}`}>
            <img src={l.thumb} alt="" className="h-16 w-16 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold leading-5">{ar ? l.item.nameAr : l.item.nameEn}</p>
              <p className="font-mono text-[10px] text-navy/50">{l.sku}</p>
              {l.quote ? (
                <p className="text-xs font-bold text-cyan">{ar ? "طلب عرض سعر" : "Quote line"}</p>
              ) : (
                <p className="text-xs font-bold">
                  <MoneyText usd={Number(l.item.sellUsd)} ar={ar} className="text-xs" />
                  {" × "}
                  {l.qty}
                  {" = "}
                  <MoneyText usd={l.lineUsd || 0} ar={ar} className="text-xs" />
                </p>
              )}
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
            {ar ? "أضف عقد صيانة سنوي (AMC-STD) — يُحسب كعرض سعر تحت الإجمالي" : "Add annual care (AMC-STD) — counted as a quote line under the total"}
          </button>
        )}
        {cart.hydrated.length > 0 && <ShipPicker hydrated={cart.hydrated} ar={ar} />}
      </div>
      <div className="border-t border-navy/10 p-4">
        <Totals catalogUsd={cart.catalogUsd} quoteCount={cart.quotes.length} ar={ar} />
        <FulfillmentCta hydrated={cart.hydrated} ar={ar} />
        <a className="btn-ghost mt-2 w-full !py-2 text-sm" href={wa} target="_blank" rel="noreferrer">
          {ar ? "إرسال السلة واتساب" : "Send cart on WhatsApp"}
        </a>
        <Link href={href("/quote")} className="btn-ghost mt-2 w-full" onClick={() => setOpen(false)}>
          {ar ? "طلب عرض سعر للنظام" : "System quote"}
        </Link>
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
  const wa = `${site.whatsapp}?text=${encodeURIComponent(whatsappCartText(cart.hydrated, ar))}`;
  return (
    <div className="mesh mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-black text-navy">{ar ? "السلة" : "Cart"}</h1>
      <p className="mt-2 text-navy/70">
        {ar
          ? "نفس السلة التي يملأها المساعد. مصر = عرض تركيب فريق كيوسيرف. الشرق الأوسط = شحن من مصر + تركيب شريك محلي اختياري."
          : "The same cart the associate fills. Egypt = QServe own-team install quote. Middle East = ship from Egypt + optional local-partner install quote."}
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
            <p className="text-sm font-black">{l.quote ? (ar ? "عرض سعر" : "Quote") : <MoneyText usd={l.lineUsd || 0} ar={ar} />}</p>
          </div>
        ))}
      </div>
      {cart.hydrated.length > 0 && (
        <div className="mt-6">
          <ShipPicker hydrated={cart.hydrated} ar={ar} />
        </div>
      )}
      <div className="glass mt-6 rounded-3xl p-6">
        <Totals catalogUsd={cart.catalogUsd} quoteCount={cart.quotes.length} ar={ar} />
        <FulfillmentCta hydrated={cart.hydrated} ar={ar} />
        <a className="btn-ghost mt-3 inline-flex" href={wa} target="_blank" rel="noreferrer">
          {ar ? "واتساب بالسلة" : "WhatsApp the cart"}
        </a>
      </div>
    </div>
  );
}
