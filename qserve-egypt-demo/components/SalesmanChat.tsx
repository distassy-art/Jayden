"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { applyOps, getCart, openCartDrawer } from "@/lib/cart";
import { greeterLine, isProductPath } from "@/lib/product-db";
import { lookedAt, postJson, sessionId } from "@/lib/track";
import { useBarePath, useLocale } from "@/lib/use-locale";
import { QaiMascot } from "./QaiMascot";

type Msg = { role: "user" | "assistant"; text: string };
const COOLDOWN_MS = 8 * 60 * 1000;
const DISMISS_KEY = "qserve-agent-dismiss";

function shouldAutoOpen(bare: string) {
  if (!isProductPath(bare)) return false;
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return true;
    const { at, path } = JSON.parse(raw) as { at: number; path: string };
    if (path === bare) return false;
    return Date.now() - at > COOLDOWN_MS;
  } catch {
    return true;
  }
}

export function SalesmanChat() {
  const locale = useLocale();
  const path = useBarePath();
  const router = useRouter();
  const ar = locale === "ar";
  const product = isProductPath(path);
  const [open, setOpen] = useState(false);
  const [pop, setPop] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const talkTimer = useRef<number | null>(null);
  const fullPath = locale === "en" ? (path === "/" ? "/en" : `/en${path}`) : path;
  const hello = greeterLine(path, ar);

  function pulseTalk(ms = 1800) {
    setSpeaking(true);
    if (talkTimer.current) window.clearTimeout(talkTimer.current);
    talkTimer.current = window.setTimeout(() => setSpeaking(false), ms);
  }

  useEffect(() => {
    const auto = product && shouldAutoOpen(path);
    setPop(Boolean(auto));
    setOpen(Boolean(auto));
    setMsgs([{ role: "assistant", text: hello }]);
    if (auto) pulseTalk(2200);
  }, [path, product, hello]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open, busy]);

  function dismiss() {
    setOpen(false);
    setPop(false);
    setSpeaking(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify({ at: Date.now(), path }));
    } catch {
      /* ignore */
    }
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const history = [...msgs, { role: "user" as const, text: t }];
    setMsgs(history);
    setInput("");
    setBusy(true);
    setSpeaking(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId(),
          locale,
          path: fullPath,
          messages: history,
          cart: getCart(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = String(data.reply || (ar ? "تعذّر الرد، أعد المحاولة." : "Could not reply, please retry."));
      setMsgs([...history, { role: "assistant", text: reply }]);
      pulseTalk(Math.min(4200, 900 + reply.length * 18));
      if (Array.isArray(data.cartOps) && data.cartOps.length) await applyOps(data.cartOps);
      if (data.showCart || (Array.isArray(data.cartOps) && data.cartOps.length)) openCartDrawer();
      postJson("/api/visit", { path: fullPath, locale, lookedAt: lookedAt(fullPath), source: "chat" });
      if (data.navigate) setTimeout(() => router.push(data.navigate), 900);
    } catch {
      setMsgs([...history, { role: "assistant", text: ar ? "الاتصال انقطع. أعد الإرسال." : "Connection dropped. Please resend." }]);
    } finally {
      setBusy(false);
    }
  }

  const talking = busy || speaking;
  const mascotLabel = ar ? "كيو AI" : "Q AI";

  const panel = open && (
    <div className={`agent-stage ${pop ? "agent-pop" : ""}`}>
      <button type="button" className="agent-x agent-x-lg" aria-label={ar ? "إغلاق المساعد" : "Close assistant"} onClick={dismiss}>
        ×
      </button>
      <button type="button" className="agent-mascot-hit" onClick={() => document.getElementById("qai-chat-input")?.focus()} aria-label={mascotLabel}>
        <QaiMascot size="lg" talking={talking} enter={pop} idle label={mascotLabel} />
      </button>
      <div className="glass flex h-[min(28rem,70vh)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between bg-navy px-4 py-3 text-sm font-extrabold text-paper">
          <span>{ar ? "Q AI · كيو سيرف AI مصر" : "Q AI · QServe AI Egypt"}</span>
          <button type="button" className="text-2xl leading-none" onClick={dismiss} aria-label="close">
            ×
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm leading-7">
          {msgs.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={`max-w-[90%] rounded-2xl px-3 py-2 ${m.role === "assistant" ? "bg-void text-navy" : "ms-auto bg-navy text-paper"}`}
            >
              {m.text}
            </div>
          ))}
          {busy && <p className="text-xs font-bold text-gold">{ar ? "يكتب…" : "Typing…"}</p>}
          <div ref={end} />
        </div>
        <form
          className="flex gap-2 border-t border-navy/10 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            id="qai-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="field !mt-0"
            placeholder={ar ? "اكتب رسالتك…" : "Type a message…"}
            disabled={busy}
          />
          <button className="btn-go !px-3 !py-2 text-sm" type="submit" disabled={busy}>
            {ar ? "إرسال" : "Send"}
          </button>
        </form>
        <p className="px-3 pb-2 text-[10px] text-navy/50">
          {ar ? "الروبوت يحرّك الماوس قدامك. السلة على اليسار تتحدث معك سطراً سطراً." : "The robot drags the mouse in front of you. The left cart fills line by line."}
        </p>
      </div>
    </div>
  );

  return (
    <div className="sales-dock">
      {panel}
      {!open && (
        <button
          type="button"
          className="agent-launcher"
          onClick={() => {
            setPop(true);
            setOpen(true);
            pulseTalk(1600);
          }}
        >
          <QaiMascot size="sm" idle talking={false} enter={false} label={mascotLabel} />
          <span>{ar ? "Q AI" : "Q AI"}</span>
        </button>
      )}
    </div>
  );
}
