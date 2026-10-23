"use client";

import { FormEvent, useState } from "react";
import { ui } from "@/lib/i18n";
import { postJson, sessionId } from "@/lib/track";
import { useLocale } from "@/lib/use-locale";
import { quoteWhatsAppUrl, saveQuoteContact } from "@/lib/quote-wa";

export function ContactForm() {
  const locale = useLocale();
  const t = ui[locale];
  const ar = locale === "ar";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    postJson("/api/lead", {
      sessionId: sessionId(),
      name,
      email,
      kind: "contact",
      locale,
      path: locale === "en" ? "/en/contact" : "/contact",
      summary: `#سعر ${name}`.slice(0, 500),
      transcript: [{ role: "user", text: message }],
    });
    saveQuoteContact({ name, phone: "", email });
    const text = [
      ar ? "طلب عرض سعر — كيوسيرف" : "Quote request — QServe",
      "#سعر",
      `${t.name}: ${name}`,
      `${t.email}: ${email}`,
      message ? `${t.message}: ${message}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    window.location.href = quoteWhatsAppUrl(text);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm font-bold">
        {t.name}
        <input required name="name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm font-bold">
        {t.email}
        <input required name="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block text-sm font-bold">
        {t.message}
        <textarea required name="message" rows={5} className="field" value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <button type="submit" className="btn-go w-full">
        {t.send}
      </button>
    </form>
  );
}
