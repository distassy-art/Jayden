"use client";

import { FormEvent, useState } from "react";
import { site } from "@/lib/content";
import { postJson, sessionId } from "@/lib/track";
import { ui } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function RepairView() {
  const locale = useLocale();
  const ar = locale === "ar";
  const t = ui[locale];
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") || "");
    const phone = String(data.get("phone") || "");
    const org = String(data.get("org") || "");
    const issue = String(data.get("issue") || "");
    postJson("/api/lead", {
      sessionId: sessionId(),
      name,
      phone,
      org,
      interest: "repair",
      kind: "repair",
      locale,
      path: locale === "en" ? "/en/repair" : "/repair",
      summary: issue.slice(0, 400),
      transcript: [{ role: "user", text: issue }],
    });
    const text = [ar ? "طلب صيانة كيوسيرف مصر" : "Qserve Egypt repair", `${t.name}: ${name}`, `${t.phone}: ${phone}`, issue].join("\n");
    window.open(`${site.whatsapp}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setSent(true);
  }

  return (
    <div className="mesh min-h-[80vh] px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-center text-4xl font-black text-navy">{ar ? "صيانة وتعطل الأجهزة" : "Repair & downtime"}</h1>
        <p className="mx-auto mt-3 max-w-lg text-center text-navy/70">
          {ar ? "صف العطل. قطع الغيار المعروفة بسعر 2× التوريد. الأنظمة الكاملة دراسة موقع." : "Describe the fault. Known spares at 2× supply. Full systems need a site survey."}
        </p>
        <div className="glass mt-8 rounded-3xl p-6 sm:p-8">
          {sent ? (
            <p className="font-extrabold text-cyan">{t.quoteSent}</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <label className="text-sm font-bold">
                {t.name}
                <input required name="name" className="field" />
              </label>
              <label className="text-sm font-bold">
                {t.phone}
                <input required name="phone" className="field" />
              </label>
              <label className="text-sm font-bold">
                {t.org}
                <input name="org" className="field" />
              </label>
              <label className="block text-sm font-bold">
                {ar ? "وصف العطل" : "What failed?"}
                <textarea required name="issue" rows={5} className="field" />
              </label>
              <button className="btn-go w-full" type="submit">
                {ar ? "إرسال للصيانة" : "Send repair request"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
