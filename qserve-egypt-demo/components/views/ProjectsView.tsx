"use client";

import { ui } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

const shots = [
  "/gallery/g1.jpeg",
  "/gallery/g2.jpeg",
  "/gallery/g3.jpeg",
  "/gallery/g4.jpeg",
  "/photos/queue-bank.webp",
  "/photos/kiosk-bank.webp",
];

export function ProjectsView() {
  const t = ui[useLocale()];
  return (
    <div className="mesh mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-black text-navy">{t.projectsTitle}</h1>
      <p className="mt-2 text-navy/70">{t.projectsBody}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shots.map((src) => (
          <img key={src} src={src} alt="" className="story-card h-56 w-full rounded-3xl object-cover" />
        ))}
      </div>
    </div>
  );
}
