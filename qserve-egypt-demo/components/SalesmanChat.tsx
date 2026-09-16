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
import { prefetchSpeak, speakText, startListen, unlockSpeech, voiceSupported, type ListenCtl } from "@/lib/voice";
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
  const listenCtl = useRef<ListenCtl>({ stop() {}, pause() {}, resume() {} });
  const sending = useRef(false);
  const msgsRef = useRef<Msg[]>([]);
  const listeningRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const dialectRef = useRef(dialect);
  dialectRef.current = dialect;
  msgsRef.current = msgs;
  listeningRef.current = listening;
  const fullPath = locale === "en" ? (path === "/" ? "/en" : `/en${path}`) : path;
  const hello = greeterLine(path, dialect);
  const helloRef = useRef(hello);
  helloRef.current = hello;

  function stopAllVoice() {
    listenCtl.current.stop();
    queueRef.current = [];
    stopVoice.current();
    listeningRef.current = false;
    setListening(false);
    setSpeaking(false);
  }

  function greetVoice(fromTap = false) {
    unlockSpeech();
    if (fromTap) {
      setVoiceBlocked(false);
    }
    stopVoice.current();
    listenCtl.current.pause();
    prefetchSpeak(hello, dialectRef.current);
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
      () => {
        setSpeaking(false);
        if (listeningRef.current) beginListen();
      },
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
    const arm = () => {
      unlockSpeech();
    prefetchSpeak(helloRef.current, dialectRef.current);
    };
    window.addEventListener("pointerdown", arm, true);
    window.addEventListener("touchstart", arm, true);
    window.addEventListener("keydown", arm, true);
    return () => {
      window.removeEventListener("pointerdown", arm, true);
      window.removeEventListener("touchstart", arm, true);
      window.removeEventListener("keydown", arm, true);
    };
  }, []);

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
    if (!t) return;
    if (sending.current) {
      queueRef.current.push(t);
      return;
    }
    sending.current = true;
    unlockSpeech();
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
    listenCtl.current.pause();
    try {
      const res = await fetch("/api/ai", {
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
      const next = [...history, { role: "assistant" as const, text: reply }];
      msgsRef.current = next;
      setMsgs(next);
      stopVoice.current();
      setSpeaking(true);
      const spoken = new Promise<void>((resolve) => {
        stopVoice.current = speakText(
          reply,
          dialectRef.current,
          () => setSpeaking(true),
          () => {
            setSpeaking(false);
            resolve();
          },
        );
      });
      if (data.shipId) setShipId(data.shipId as ShipId);
      if (typeof data.partner === "boolean") setPartnerInstall(data.partner);
      if (Array.isArray(data.cartOps) && data.cartOps.length) await applyOps(data.cartOps);
      if (data.showCart || (Array.isArray(data.cartOps) && data.cartOps.length) || data.shipId) openCartDrawer();
      postJson("/api/visit", { path: fullPath, locale, lookedAt: lookedAt(fullPath), source: viaVoice ? "voice" : "chat" });
      if (data.navigate) setTimeout(() => router.push(data.navigate), 900);
      await spoken;
    } catch {
      const fail = ui.failConn;
      const next = [...history, { role: "assistant" as const, text: fail }];
      msgsRef.current = next;
      setMsgs(next);
      setSpeaking(true);
      await new Promise<void>((resolve) => {
        stopVoice.current = speakText(
          fail,
          dialectRef.current,
          () => setSpeaking(true),
          () => {
            setSpeaking(false);
            resolve();
          },
        );
      });
    } finally {
      setBusy(false);
      sending.current = false;
      if (listeningRef.current) listenCtl.current.resume();
      const queued = queueRef.current.shift();
      if (queued) void send(queued, true);
    }
  }

  function beginListen() {
    listenCtl.current.stop();
    listeningRef.current = true;
    setListening(true);
    setVoiceHint(ui.listen);
    listenCtl.current = startListen(dialectRef.current, {
      onPartial: (p) => setInput(p),
      onFinal: (text) => {
        setInput("");
        void send(text, true);
      },
      onError: (code) => {
        if (code !== "not-allowed") return;
        listenCtl.current.stop();
        listeningRef.current = false;
        setListening(false);
        setVoiceHint(ui.micAllow);
      },
    });
  }

  function toggleTalk() {
    unlockSpeech();
    setOpen(true);
    setVoiceBlocked(false);
    if (listeningRef.current) {
      listenCtl.current.stop();
      queueRef.current = [];
      listeningRef.current = false;
      setListening(false);
      setVoiceHint(ui.speakHint);
      return;
    }
    const support = voiceSupported();
    if (!support.stt) {
      setVoiceHint(ui.noStt);
      greetVoice(true);
      return;
    }
    listeningRef.current = true;
    setListening(true);
    setVoiceHint(ui.listen);
    greetVoice(true);
  }

  const talking = busy || speaking;

  return (
    <>
      <audio id="qai-speaker" preload="auto" hidden />
      <div className="qai-talk-dock" dir={ui.rtl ? "rtl" : "ltr"}>
        <TalkButton dialect={dialect} listening={listening} blocked={voiceBlocked} disabled={busy && !listening} size="lg" onClick={toggleTalk} />
      </div>
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
            <TalkButton dialect={dialect} listening={listening} blocked={voiceBlocked} disabled={busy && !listening} size="lg" onClick={toggleTalk} />
            {voiceHint && <p className="mt-1 px-1 text-[11px] font-bold text-navy/70">{voiceHint}</p>}
          </div>
          <form
            className="flex gap-2 border-t border-navy/10 p-2"
            onPointerDown={() => unlockSpeech()}
            onSubmit={(e) => {
              e.preventDefault();
              unlockSpeech();
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
