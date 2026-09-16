"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { products, site } from "@/lib/content";
import { enCopy } from "@/lib/en-copy";
import { ui } from "@/lib/i18n";
import { postJson, sessionId } from "@/lib/track";
import { useLocale } from "@/lib/use-locale";
import { SHIP_OPTIONS, setPartnerInstall, setShipId, useShip } from "@/lib/shipping";

type Props = { defaultSystem?: string };

export function QuoteForm({ defaultSystem = "" }: Props) {
  const locale = useLocale();
  const t = ui[locale];
  const ar = locale === "ar";
  const [sent, setSent] = useState(false);
  const [system, setSystem] = useState(defaultSystem);
  const [pack, setPack] = useState("hardware");
  const [sector, setSector] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [org, setOrg] = useState("");
  const [city, setCity] = useState("");
  const { shipId, group, partner } = useShip();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("system")) setSystem(q.get("system") || "");
    if (q.get("pack")) setPack(q.get("pack") || "hardware");
    if (q.get("sector")) setSector(q.get("sector") || "");
    if (q.get("name")) setName(q.get("name") || "");
    if (q.get("phone")) setPhone(q.get("phone") || "");
    if (q.get("org")) setOrg(q.get("org") || "");
    if (q.get("city")) setCity(q.get("city") || "");
  }, []);

  const systemOptions = useMemo(
    () =>
      products.map((p) => ({
        slug: p.slug,
        label: locale === "en" ? enCopy[p.slug]?.nav ?? p.nav : p.nav,
      })),
    [locale],
  );

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const count = String(data.get("count") || "").trim();
    const message = String(data.get("message") || "").trim();
    const sysLabel = systemOptions.find((s) => s.slug === system)?.label || system;
    const packLabel = pack === "plus" ? (ar ? "أجهزة + إضافة برمجية مخصّصة" : "hardware + tailored software add-on") : ar ? "أجهزة فقط" : "hardware only";
    postJson("/api/lead", {
      sessionId: sessionId(),
      name,
      phone,
      org,
      city,
      interest: `${system}|${pack}|${sector}`,
      kind: "quote",
      locale,
      path: locale === "en" ? "/en/quote" : "/quote",
      summary: packLabel,
      transcript: [{ role: "user", text: message || packLabel }],
    });
    const text = [
      ar ? `طلب عرض سعر — كيوسيرف مصر` : `Quote request — Qserve Egypt`,
      `${t.name}: ${name}`,
      `${t.phone}: ${phone}`,
      org ? `${t.org}: ${org}` : "",
      sysLabel ? `${t.system}: ${sysLabel}` : "",
      packLabel,
      sector,
      count ? `${t.count}: ${count}` : "",
      city ? `${t.city}: ${city}` : "",
      shipId ? `${ar ? "الوجهة" : "Destination"}: ${SHIP_OPTIONS.find((o) => o.id === shipId)?.[ar ? "ar" : "en"]}` : "",
      group === "egypt" ? (ar ? "INST-EG عرض تركيب مصنع #تركيب" : "INST-EG factory install quote #تركيب") : "",
      group === "me" ? (ar ? "SHIP-ME تقدير ثم عرض شحن #شحن" : "SHIP-ME estimate then shipping quote #شحن") : "",
      group === "me" && partner ? (ar ? "INST-ME عرض تركيب محلي #تركيب" : "INST-ME local-partner install quote #تركيب") : "",
      message ? `${t.details}: ${message}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    window.open(`${site.whatsapp}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setSent(true);
  }

  if (sent) {
    return (
      <div className="ticket-pop rounded-3xl bg-teal p-6 font-extrabold text-paper">
        {t.quoteSent} <span dir="ltr">{site.phoneDisplay}</span>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          {t.name}
          <input required name="name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-sm font-bold">
          {t.phone}
          <input required name="phone" type="tel" className="field" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="text-sm font-bold">
          {t.org}
          <input name="org" className="field" value={org} onChange={(e) => setOrg(e.target.value)} />
        </label>
        <label className="text-sm font-bold">
          {t.system}
          <select name="system" value={system} onChange={(e) => setSystem(e.target.value)} className="field">
            <option value="">{t.choose}</option>
            {systemOptions.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          {ar ? "العرض" : "Package"}
          <select name="pack" value={pack} onChange={(e) => setPack(e.target.value)} className="field">
            <option value="hardware">{ar ? "أجهزة فقط" : "Hardware only"}</option>
            <option value="plus">{ar ? "أجهزة + إضافة برمجية مخصّصة" : "Hardware + tailored software add-on"}</option>
          </select>
        </label>
        <label className="text-sm font-bold">
          {ar ? "نوع الجهة (للإضافة)" : "Client type (for add-on)"}
          <select name="sector" value={sector} onChange={(e) => setSector(e.target.value)} className="field">
            <option value="">{t.choose}</option>
            <option value="bank">{ar ? "بنك" : "Bank"}</option>
            <option value="hospital">{ar ? "مستشفى" : "Hospital"}</option>
            <option value="gov">{ar ? "جهة حكومية" : "Government"}</option>
          </select>
        </label>
        <label className="text-sm font-bold">
          {t.count}
          <input name="count" className="field" />
        </label>
        <label className="text-sm font-bold">
          {t.city}
          <input name="city" className="field" value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
      </div>
      <fieldset className="rounded-2xl border border-navy/10 bg-void p-3">
        <legend className="text-sm font-black">{ar ? "الوجهة" : "Destination"}</legend>
        {SHIP_OPTIONS.map((o) => (
          <label key={o.id} className="mt-1 flex items-center gap-2 text-sm">
            <input type="radio" name="dest" checked={shipId === o.id} onChange={() => setShipId(o.id)} />
            {ar ? `${o.groupAr} — ${o.ar}` : `${o.groupEn} — ${o.en}`}
          </label>
        ))}
        {group === "me" && (
          <label className="mt-3 flex items-start gap-2 text-sm font-bold">
            <input type="checkbox" className="mt-1" checked={partner} onChange={(e) => setPartnerInstall(e.target.checked)} />
            <span>
              {ar ? "اطلب عرض تركيب محلي (INST-ME)" : "Request local install quote (INST-ME)"}
              <span className="mt-0.5 block text-[11px] font-semibold text-navy/60">
                {ar ? "شريك محلي — ليس فني كيوسيرف في الخليج." : "Local partner — not QServe staff on-site in the GCC."}
              </span>
            </span>
          </label>
        )}
      </fieldset>
      <label className="block text-sm font-bold">
        {t.details}
        <textarea name="message" rows={4} className="field" />
      </label>
      <button type="submit" className="btn-go w-full">
        {t.sendWa}
      </button>
    </form>
  );
}
