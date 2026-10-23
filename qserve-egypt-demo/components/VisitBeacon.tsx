"use client";

import { useEffect } from "react";
import { lookedAt, postJson, sessionId } from "@/lib/track";
import { useBarePath, useLocale } from "@/lib/use-locale";

export function VisitBeacon() {
  const locale = useLocale();
  const path = useBarePath();
  useEffect(() => {
    const full = locale === "en" ? (path === "/" ? "/en" : `/en${path}`) : path;
    postJson("/api/visit", {
      path: full,
      locale,
      lookedAt: lookedAt(full),
      source: "page",
      sessionId: sessionId(),
    });
  }, [locale, path]);
  return null;
}
