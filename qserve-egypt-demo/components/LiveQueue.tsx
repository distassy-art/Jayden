"use client";

import { useEffect, useState } from "react";
import { ui } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function LiveQueue() {
  const locale = useLocale();
  const t = ui[locale];
  const [now, setNow] = useState({ letter: "A", n: 103, window: 2 });
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow((prev) => {
        const n = prev.n + 1;
        const letter = t.services[n % 3].id;
        return { letter, n, window: (prev.window % 4) + 1 };
      });
      setFlash(true);
      const hold = setTimeout(() => setFlash(false), 400);
      return () => clearTimeout(hold);
    }, 3800);
    return () => clearInterval(timer);
  }, [t.services]);

  const current = `${now.letter}-${now.n}`;

  return (
    <div className="kiosk-device glow-ring relative w-full max-w-sm rounded-3xl p-6">
      <p className="mb-4 text-center text-[11px] font-extrabold tracking-[0.28em] text-cyan">{t.queuePreview}</p>
      <div className={`rounded-2xl bg-black/40 p-6 text-center ${flash ? "ticket-pop" : ""}`}>
        <p className="text-xs text-cyan/80">{t.liveNow}</p>
        <p className="mt-1 text-5xl font-black text-white">{current}</p>
        <p className="mt-2 text-sm text-white/70">
          {t.window} {now.window}
        </p>
      </div>
      <ul className="mt-5 space-y-2 text-sm text-white/80">
        {t.services.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
            <span className="text-lg font-black text-cyan">{s.id}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
