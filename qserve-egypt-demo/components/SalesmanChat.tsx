"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { applyOps, getCart, openCartDrawer } from "@/lib/cart";
import { DIALECT_UI } from "@/lib/dialect";
import { greeterLine } from "@/lib/product-db";
import { postSalesmanAi } from "@/lib/ai-client";
import { lookedAt, postJson, sessionId } from "@/lib/track";
import { useBarePath, useLocale } from "@/lib/use-locale";
import { inferPartner, inferShipId, getPartnerInstall, getShipId, setPartnerInstall, setShipId, type ShipId } from "@/lib/shipping";

type Msg = { role: "user" | "assistant"; text: string };
const DISMISS_KEY = "qserve-agent-dismiss";

export function SalesmanChat() {
  const locale = useLocale();
  const path = useBarePath();
  const router = useRouter();
  const ui = DIALECT_UI.eg;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  const msgsRef = useRef<Msg[]>([]);
  const queueRef = useRef<string[]>([]);
  msgsRef.current = msgs;
  const fullPath = locale === "en" ? (path === "/" ? "/en" : `/en${path}`) : path;
  const hello = greeterLine(path, "eg");

  useEffect(() => {
    setOpen(false);
    setMsgs([{ role: "assistant", text: hello }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    setMsgs((prev) => (prev.length <= 1 ? [{ role: "assistant", text: hello }] : prev));
  }, [hello]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open, busy]);

  function dismiss() {
    setOpen(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify({ at: Date.now(), path }));
    } catch {
      /* ignore */
    }
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t) return;
    if (sending.current) {
      queueRef.current.push(t);
      return;
    }
    sending.current = true;
    try {
      sessionStorage.setItem("qserve-need", t);
    } catch {
      /* ignore */
    }
    const guessed = inferShipId(t);
    if (guessed) setShipId(guessed);
    const partnerGuess = inferPartner(t);
    if (partnerGuess !== null) setPartnerInstall(partnerGuess);

    const history = [...msgsRef.current, { role: "user" as const, text: t }];
    msgsRef.current = history;
    setMsgs(history);
    setInput("");
    setBusy(true);
    try {
      let streamed = "";
      const data = await postSalesmanAi(
        {
          sessionId: sessionId(),
          locale,
          currency: "EGP",
          path: fullPath,
          messages: history,
          cart: getCart(),
          shipId: getShipId(),
          partner: getPartnerInstall(),
        },
        (acc) => {
          streamed = acc;
          const preview = [...history, { role: "assistant" as const, text: acc }];
          msgsRef.current = preview;
          setMsgs(preview);
        },
      );
      const reply = String(data.reply || streamed || ui.failReply);
      const next = [...history, { role: "assistant" as const, text: reply }];
      msgsRef.current = next;
      setMsgs(next);
      if (data.shipId) setShipId(data.shipId as ShipId);
      if (typeof data.partner === "boolean") setPartnerInstall(data.partner);
      if (Array.isArray(data.cartOps) && data.cartOps.length) await applyOps(data.cartOps);
      if (data.showCart || (Array.isArray(data.cartOps) && data.cartOps.length) || data.shipId) openCartDrawer();
      postJson("/api/visit", { path: fullPath, locale, lookedAt: lookedAt(fullPath), source: "chat" });
      const nextPath = data.navigate;
      if (nextPath) setTimeout(() => router.push(nextPath), 900);
    } catch {
      const fail = ui.failConn;
      const next = [...history, { role: "assistant" as const, text: fail }];
      msgsRef.current = next;
      setMsgs(next);
    } finally {
      setBusy(false);
      sending.current = false;
      const queued = queueRef.current.shift();
      if (queued) void send(queued);
    }
  }

  return (
    <>
      {!open && (
        <button type="button" className="qai-text-launch" dir="rtl" onClick={() => setOpen(true)}>
          Q AI · اكتب
        </button>
      )}
      {open && (
        <div className="qai-chat-dock glass" dir="rtl">
          <div className="flex items-center justify-between bg-navy px-4 py-3 text-sm font-extrabold text-paper">
            <span>Q AI · QServe AI Egypt</span>
            <button type="button" className="text-2xl leading-none" onClick={dismiss} aria-label={ui.close}>
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
            {busy && <p className="text-xs font-bold text-gold">{ui.typing}</p>}
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
              placeholder={ui.placeholder}
              disabled={busy}
            />
            <button className="btn-ghost !px-3 !py-2 text-sm" type="submit" disabled={busy}>
              {ui.send}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
