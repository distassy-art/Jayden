"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { applyOps, getCart, openCartDrawer } from "@/lib/cart";
import { useMoney } from "@/lib/currency";
import { DIALECT_UI, dialectOf } from "@/lib/dialect";
import { greeterLine, isProductPath } from "@/lib/product-db";
import { lookedAt, postJson, sessionId } from "@/lib/track";
import { useBarePath, useLocale } from "@/lib/use-locale";
import { inferPartner, inferShipId, getPartnerInstall, getShipId, setPartnerInstall, setShipId, type ShipId } from "@/lib/shipping";
import { speakText, startListen, unlockSpeech, voiceSupported } from "@/lib/voice";
import { QaiWanderer } from "./QaiWanderer";
import { TalkButton } from "./TalkButton";

type Msg = { role: "user" | "assistant"; text: string };
const COOLDOWN_MS = 8 * 60 * 1000;
const DISMISS_KEY = "qserve-agent-dismiss";
const HEARD_KEY = "qserve-voice-heard";

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
  const money = useMoney();
  const dialect = dialectOf(money.currency);
  const ui = DIALECT_UI[dialect] || DIALECT_UI.eg;
  const product = isProductPath(path);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceBlocked, setVoiceBlocked] = useState(true);
  const [voiceHint, setVoiceHint] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const stopVoice = useRef<() => void>(() => {});
  const stopListen = useRef<() => void>(() => {});
  const sending = useRef(false);
  const dialectRef = useRef(dialect);
  dialectRef.current = dialect;
  const fullPath = locale === "en" ? (path === "/" ? "/en" : `/en${path}`) : path;
  const hello = greeterLine(path, dialect);

  function stopAllVoice() {
    stopListen.current();
    stopVoice.current();
    setListening(false);
    setSpeaking(false);
  }

  function greetVoice(fromTap = false) {
    if (fromTap) {
      unlockSpeech();
      setVoiceBlocked(false);
    }
    stopVoice.current();
    setSpeaking(true);
    stopVoice.current = speakText(
      hello,
      dialectRef.current,
      () => {
        setSpeaking(true);
        setVoiceBlocked(false);
        try {
          sessionStorage.setItem(HEARD_KEY, "1");
        } catch {
          /* ignore */
        }
      },
      () => setSpeaking(false),
    );
  }

  useEffect(() => {
    const auto = product && shouldAutoOpen(path);
    setOpen(Boolean(auto));
    setMsgs([{ role: "assistant", text: hello }]);
    setVoiceHint(ui.enableHint);
    if (auto) greetVoice(false);
    return () => stopAllVoice();
    // greet on path change; currency mouth is a separate effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, product]);

  useEffect(() => {
    setMsgs((prev) => (prev.length <= 1 ? [{ role: "assistant", text: hello }] : prev));
    setVoiceHint(ui.enableHint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hello, dialect]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open, busy]);

  function dismiss() {
    setOpen(false);
    stopAllVoice();
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify({ at: Date.now(), path }));
    } catch {
      /* ignore */
    }
  }

  function openAgent() {
    setOpen(true);
    greetVoice(true);
  }

  async function send(text: string, viaVoice = false) {
    const t = text.trim();
    if (!t || sending.current) return;
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

    const history = [...msgs, { role: "user" as const, text: t }];
    setMsgs(history);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId(),
          locale,
          currency: money.currency,
          path: fullPath,
          messages: history,
          cart: getCart(),
          shipId: getShipId(),
          partner: getPartnerInstall(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = String(data.reply || ui.failReply);
      setMsgs([...history, { role: "assistant", text: reply }]);
      stopVoice.current();
      setSpeaking(true);
      stopVoice.current = speakText(reply, dialectRef.current, () => setSpeaking(true), () => setSpeaking(false));
      if (data.shipId) setShipId(data.shipId as ShipId);
      if (typeof data.partner === "boolean") setPartnerInstall(data.partner);
      if (Array.isArray(data.cartOps) && data.cartOps.length) await applyOps(data.cartOps);
      if (data.showCart || (Array.isArray(data.cartOps) && data.cartOps.length) || data.shipId) openCartDrawer();
      postJson("/api/visit", { path: fullPath, locale, lookedAt: lookedAt(fullPath), source: viaVoice ? "voice" : "chat" });
      if (data.navigate) setTimeout(() => router.push(data.navigate), 900);
    } catch {
      const fail = ui.failConn;
      setMsgs([...history, { role: "assistant", text: fail }]);
      speakText(fail, dialectRef.current);
    } finally {
      setBusy(false);
      sending.current = false;
    }
  }

  function toggleTalk() {
    unlockSpeech();
    setOpen(true);
    const support = voiceSupported();
    if (listening) {
      stopListen.current();
      setListening(false);
      return;
    }
    if (voiceBlocked) greetVoice(true);
    if (!support.stt) {
      setVoiceHint(ui.noStt);
      if (voiceBlocked) greetVoice(true);
      return;
    }
    stopVoice.current();
    setListening(true);
    setVoiceHint(ui.listen);
    stopListen.current = startListen(dialectRef.current, {
      onPartial: (p) => setInput(p),
      onFinal: (text) => {
        setListening(false);
        setInput("");
        send(text, true);
      },
      onError: (code) => {
        setListening(false);
        if (code === "not-allowed") setVoiceHint(ui.micAllow);
        else if (code === "no-speech") setVoiceHint(ui.noSpeech);
        else setVoiceHint(ui.micFail);
      },
      onEnd: () => setListening(false),
    });
  }

  const talking = busy || speaking;

  return (
    <>
      <QaiWanderer
        dialect={dialect}
        open={open}
        talking={talking}
        listening={listening}
        voiceBlocked={voiceBlocked}
        hello={hello}
        onOpen={openAgent}
        onDismiss={dismiss}
        onTalk={toggleTalk}
      />
      {open && (
        <div className="qai-chat-dock glass" dir={ui.rtl ? "rtl" : "ltr"}>
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
            {listening && <p className="text-xs font-bold text-gold">{ui.listen}</p>}
            <div ref={end} />
          </div>
          <div className="border-t border-navy/10 p-2">
            <TalkButton dialect={dialect} listening={listening} blocked={voiceBlocked} disabled={busy} size="lg" onClick={toggleTalk} />
            {voiceHint && <p className="mt-1 px-1 text-[11px] font-bold text-navy/70">{voiceHint}</p>}
          </div>
          <form
            className="flex gap-2 border-t border-navy/10 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input, false);
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
