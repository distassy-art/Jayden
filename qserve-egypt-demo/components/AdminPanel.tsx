"use client";

import { FormEvent, useState } from "react";

type Item = {
  sku: string;
  nameAr: string;
  nameEn: string;
  category: string;
  unitAr: string;
  unitEn: string;
  buyUsd: number;
  sellUsd: number;
  marginPct: number;
  moq: number;
  supplier: string;
  url: string;
  notesAr: string;
  notesEn: string;
};

type Visit = { id: string; ts: number; path: string; locale: string; lookedAt: string; source?: string };
type Lead = {
  sessionId: string;
  ts: number;
  name?: string;
  phone?: string;
  org?: string;
  city?: string;
  interest?: string;
  kind?: string;
  locale?: string;
  summary?: string;
  transcript?: { role: string; text: string }[];
  cart?: { sku: string; qty: number }[];
  recommended?: string[];
};

const TABS = [
  { id: "products", ar: "للبيع", en: "Products" },
  { id: "suppliers", ar: "مكان الشراء", en: "Supplier" },
  { id: "spares", ar: "صيانة / قطع", en: "Spares" },
  { id: "visits", ar: "الزيارات", en: "Visits" },
  { id: "leads", ar: "العملاء", en: "Leads" },
] as const;

export function AdminPanel() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("products");
  const [items, setItems] = useState<Item[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  async function load(nextTab: typeof tab, password: string) {
    const res = await fetch(`/api/admin?tab=${nextTab === "suppliers" ? "products" : nextTab}`, {
      headers: { "x-admin-password": password },
    });
    if (res.status === 401) {
      setAuthed(false);
      setErr("كلمة المرور غير صحيحة");
      return;
    }
    const data = await res.json();
    if (data.items) setItems(data.items);
    if (data.visits) setVisits(data.visits);
    if (data.leads) setLeads(data.leads);
    setAuthed(true);
    setErr("");
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (!res.ok) {
      setErr("كلمة المرور غير صحيحة / wrong password");
      return;
    }
    sessionStorage.setItem("qserve-admin", pw);
    await load(tab, pw);
  }

  async function switchTab(id: typeof tab) {
    setTab(id);
    const password = sessionStorage.getItem("qserve-admin") || pw;
    await load(id, password);
  }

  if (!authed) {
    return (
      <form onSubmit={onLogin} className="glass mx-auto mt-16 max-w-md rounded-3xl p-8">
        <h1 className="text-3xl font-black text-navy">الموظفين / Staff</h1>
        <p className="mt-2 text-sm text-navy/70">هذه الصفحة ليست للمتسوقين. زيارات الموقع والمحادثات تظهر بعد الدخول.</p>
        <input type="password" className="field" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="كلمة المرور" />
        {err && <p className="mt-2 text-sm font-bold text-red-700">{err}</p>}
        <button className="btn-go mt-4 w-full" type="submit">
          دخول
        </button>
      </form>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-4xl font-black text-navy">إدارة QServe AI Egypt</h1>
      <p className="mt-2 text-sm text-navy/70">سجل زيارات موقعنا ومحادثات الخدمة — ليس قاعدة بيانات عملاء الفرع.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-extrabold ${tab === t.id ? "bg-navy text-paper" : "bg-white border border-navy/15"}`}
          >
            {t.ar} / {t.en}
          </button>
        ))}
      </div>

      {(tab === "products" || tab === "suppliers" || tab === "spares") && (
        <div className="mt-6 overflow-x-auto rounded-3xl border border-navy/10 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-void text-start font-extrabold">
              <tr>
                <th className="p-3">SKU</th>
                <th className="p-3">الاسم</th>
                <th className="p-3">شراء</th>
                <th className="p-3">بيع 2×</th>
                <th className="p-3">هامش</th>
                {tab !== "products" && <th className="p-3">المورد / MOQ</th>}
                {tab !== "products" && <th className="p-3">ملاحظات</th>}
              </tr>
            </thead>
            <tbody>
              {(tab === "spares" ? items.filter((i) => i.category === "spare") : items).map((i) => (
                <tr key={i.sku} className="border-t border-navy/10">
                  <td className="p-3 font-mono text-xs">{i.sku}</td>
                  <td className="p-3">
                    <div className="font-bold">{i.nameAr}</div>
                    <div className="text-navy/60">{i.nameEn}</div>
                    <div className="text-xs">
                      {i.unitAr} / {i.unitEn}
                    </div>
                  </td>
                  <td className="p-3" dir="ltr">
                    ${i.buyUsd}
                  </td>
                  <td className="p-3 font-extrabold text-cyan" dir="ltr">
                    ${i.sellUsd}
                  </td>
                  <td className="p-3">{i.marginPct}%</td>
                  {tab !== "products" && (
                    <td className="p-3">
                      <a className="font-bold text-cyan underline" href={i.url} target="_blank" rel="noreferrer">
                        {i.supplier}
                      </a>
                      <div className="text-xs">MOQ {i.moq}</div>
                    </td>
                  )}
                  {tab !== "products" && <td className="max-w-xs p-3 text-xs leading-6 text-navy/70">{i.notesAr}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "visits" && (
        <ul className="mt-6 space-y-2">
          {visits.length === 0 && <li className="glass rounded-2xl p-4">لا زيارات بعد — افتح الموقع العام ثم حدّث.</li>}
          {visits.map((v) => (
            <li key={v.id} className="flex flex-wrap justify-between gap-2 rounded-2xl border border-navy/10 bg-white px-4 py-3 text-sm">
              <span className="font-mono">{v.path}</span>
              <span className="font-bold text-cyan">{v.lookedAt}</span>
              <span>{v.locale}</span>
              <span className="text-navy/50">{new Date(v.ts).toLocaleString("ar-EG")}</span>
            </li>
          ))}
        </ul>
      )}

      {tab === "leads" && (
        <ul className="mt-6 space-y-3">
          {leads.length === 0 && <li className="glass rounded-2xl p-4">لا محادثات بعد — جرّب ويدجت المساعدة في الصفحة الرئيسية.</li>}
          {leads.map((l) => (
            <li key={l.sessionId} className="rounded-3xl border border-navy/10 bg-white p-4">
              <p className="font-extrabold">
                {l.name || "زائر"} · {l.phone || "بدون رقم"} · {l.org || "—"}
              </p>
              <p className="text-sm text-navy/70">
                {l.kind} · {l.interest} · {l.locale}
              </p>
              <p className="mt-2 text-sm">{l.summary}</p>
              {l.recommended && l.recommended.length > 0 && (
                <p className="mt-2 font-mono text-xs text-gold">SKU: {l.recommended.join(", ")}</p>
              )}
              {l.cart && l.cart.length > 0 && (
                <p className="mt-1 text-xs font-bold text-navy">
                  cart: {l.cart.map((c) => `${c.qty}×${c.sku}`).join(" · ")}
                </p>
              )}
              {l.transcript && l.transcript.length > 0 && (
                <div className="mt-3 max-h-40 overflow-y-auto rounded-2xl bg-void p-3 text-xs leading-6">
                  {l.transcript.map((m, i) => (
                    <p key={i}>
                      <b>{m.role}:</b> {m.text}
                    </p>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
