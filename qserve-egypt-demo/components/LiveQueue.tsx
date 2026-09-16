"use client";

import { useEffect, useState } from "react";
import { ui } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function LiveQueue() {
  const locale = useLocale();
  const t = ui[locale];
  const [now, setNow] = useState({ letter: "A", n: 103, window: 2 });
  const [mine, setMine] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow((prev) => {
        const n = prev.n + 1;
        const letter = t.services[n % 3].id;
        return { letter, n, window: (prev.window % 4) + 1 };
      });
      setFlash(true);
      setTimeout(() => setFlash(false), 400);
    }, 3800);
    return () => clearInterval(timer);
  }, [t.services]);

  function takeTicket(id: string) {
    const n = now.n + 7 + id.charCodeAt(0);
    setMine(`${id}-${n}`);
  }

  const current = `${now.letter}-${now.n}`;

  return (
    <div className="kiosk-device glow-ring float-y relative w-full max-w-sm overflow-hidden rounded-3xl p-5">
      <p className="mb-3 text-center text-[11px] font-extrabold tracking-[0.35em] text-cyan">QSERVE OS · LIVE</p>
      <div className={`rounded-2xl bg-black/40 p-5 text-center ${flash ? "ticket-pop" : ""}`}>
        <p className="text-xs text-cyan/80">{t.liveNow}</p>
        <p className="mt-1 text-5xl font-black text-white">{current}</p>
        <p className="mt-2 text-sm text-white/70">
          {t.window} {now.window}
        </p>
      </div>
      <p className="mt-4 mb-2 text-sm font-bold">{t.tryKiosk}</p>
      <div className="grid gap-2">
        {t.services.map((s) => (
          <button
            key={s.id}
            type="button"
            className="kiosk-btn flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 hover:bg-teal/30"
            onClick={() => takeTicket(s.id)}
          >
            <span className="text-lg font-black text-cyan">{s.id}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      {mine && (
        <div className="ticket-pop mt-4 rounded-2xl bg-teal px-4 py-3 text-center font-extrabold text-paper">
          {t.ticket}: {mine}
          <span className="mt-1 block text-xs font-semibold">{t.ticketHint}</span>
        </div>
      )}
    </div>
  );
}
