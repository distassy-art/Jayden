import { DIALECT_UI, type Dialect } from "./dialect";

type RecCtor = new () => Rec;
type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let keepAliveOsc: OscillatorNode | null = null;
let keepAliveGain: GainNode | null = null;
let speechPlayer: HTMLAudioElement | null = null;
let ctxSource: AudioBufferSourceNode | null = null;
let lastError = "";
let lastBytes = 0;
let lastDuration = 0;
let lastStarted = "";
let peakRms = 0;
let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

function recognitionCtor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function voiceSupported() {
  if (typeof window === "undefined") return { tts: false, stt: false };
  return { tts: true, stt: Boolean(recognitionCtor()) };
}

function stopBrowserSpeak() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  audioCtx = audioCtx || new AC();
  return audioCtx;
}

function ensurePlayer() {
  if (typeof window === "undefined") return null;
  if (speechPlayer) return speechPlayer;
  const existing = document.getElementById("qai-speaker");
  if (existing instanceof HTMLAudioElement) {
    speechPlayer = existing;
    speechPlayer.setAttribute("playsinline", "true");
    speechPlayer.setAttribute("webkit-playsinline", "true");
    speechPlayer.preload = "auto";
    speechPlayer.crossOrigin = "anonymous";
    return speechPlayer;
  }
  speechPlayer = new Audio();
  speechPlayer.preload = "auto";
  speechPlayer.setAttribute("playsinline", "true");
  speechPlayer.setAttribute("webkit-playsinline", "true");
  speechPlayer.crossOrigin = "anonymous";
  return speechPlayer;
}

function publishDebug() {
  if (typeof window === "undefined") return;
  const rms = currentRms();
  (window as Window & { __qaiVoice?: unknown }).__qaiVoice = {
    ctx: audioCtx?.state || "none",
    keepAlive: Boolean(keepAliveOsc),
    playerPaused: speechPlayer ? speechPlayer.paused : null,
    lastError,
    lastBytes,
    lastStarted,
    lastDuration,
    peakRms,
    playerTime: speechPlayer ? speechPlayer.currentTime : 0,
    rms,
  };
}

function currentRms() {
  if (!analyser) return 0;
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

function armContext() {
  const ctx = getAudioContext();
  if (!ctx) return null;
  void ctx.resume();
  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
  }
  if (!keepAliveOsc) {
    keepAliveGain = ctx.createGain();
    keepAliveGain.gain.value = 0.00008;
    keepAliveOsc = ctx.createOscillator();
    keepAliveOsc.frequency.value = 18;
    keepAliveOsc.connect(keepAliveGain);
    keepAliveGain.connect(masterGain);
    keepAliveOsc.start();
  }
  ctx.onstatechange = () => {
    if (ctx.state === "suspended") void ctx.resume();
    publishDebug();
  };
  publishDebug();
  return ctx;
}

function warmVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve([] as SpeechSynthesisVoice[]);
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const finish = () => resolve(window.speechSynthesis.getVoices() || []);
    const have = window.speechSynthesis.getVoices();
    if (have.length) {
      finish();
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      const now = window.speechSynthesis.getVoices();
      if (now.length || Date.now() - started > 1200) {
        window.clearInterval(timer);
        finish();
      }
    }, 80);
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        const now = window.speechSynthesis.getVoices();
        if (now.length) {
          window.clearInterval(timer);
          finish();
        }
      },
      { once: true },
    );
    void window.speechSynthesis.getVoices();
  });
  return voicesReady;
}

export function unlockSpeech() {
  if (typeof window === "undefined") return;
  try {
    window.speechSynthesis?.resume();
  } catch {
    /* ignore */
  }
  void warmVoices();
  const ctx = armContext();
  if (ctx && ctx.state !== "running") void ctx.resume();
  const player = ensurePlayer();
  if (player) {
    try {
      player.muted = false;
      player.volume = 1;
      player.loop = true;
      if (!player.src) player.src = SILENT_WAV;
      void player.play().then(
        () => {
          publishDebug();
        },
        () => {
          lastError = "unlock-play-blocked";
          publishDebug();
        },
      );
    } catch (e) {
      lastError = String(e);
    }
  }
  publishDebug();
}

export function prepSpeak(text: string, dialect: Dialect) {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  t = t.replace(/https?:\/\/\S+/g, " ");
  t = t.replace(/\bCART_ADD:\S+/gi, " ");
  t = t.replace(/\bSHOW_CART\b/gi, " ");
  t = t.replace(/\bNAV:\/\S+/g, " ");
  t = t.replace(/\bSHIP:\S+/gi, " ");
  t = t.replace(/\bPARTNER:\S+/gi, " ");
  if (dialect !== "en") {
    t = t.replace(/\bQ AI\b/g, "كيو أيه آي");
    t = t.replace(/\bQServe\b/gi, "كيوسيرف");
    t = t.replace(/\bHDMI\b/g, "إتش دي إم آي");
    t = t.replace(/\bWi-?Fi\b/gi, "واي فاي");
    t = t.replace(/\bAMC\b/g, "أي إم سي");
  }
  const clauses = t
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?؟])\s+/)
    .filter(Boolean);
  return clauses.slice(0, 2).join(" ").slice(0, 220);
}

export function spokenClauses(text: string, dialect: Dialect) {
  const said = prepSpeak(text, dialect);
  if (!said) return [] as string[];
  const parts = said.split(/(?<=[.!?؟])\s+/).filter(Boolean);
  return (parts.length ? parts : [said]).slice(0, 2).map((p) => p.slice(0, 140));
}

export function firstClauseReady(text: string, dialect: Dialect) {
  const clauses = spokenClauses(text, dialect);
  if (!clauses.length) return "";
  if (clauses.length > 1) return clauses[0];
  const first = clauses[0];
  if (/[.!?؟]/.test(first) && first.replace(/\s/g, "").length >= 4) return first;
  if (first.length >= 18) return first;
  return "";
}

const ttsCache = new Map<string, Promise<ArrayBuffer>>();

function ttsKey(text: string, dialect: Dialect) {
  return `${dialect}:${text}`;
}

async function fetchTts(text: string, dialect: Dialect) {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, dialect }),
  });
  if (!res.ok) throw new Error("tts http");
  const buf = await res.arrayBuffer();
  if (buf.byteLength < 200) throw new Error("tts empty");
  return buf;
}

export function prefetchSpeak(text: string, dialect: Dialect) {
  if (typeof window === "undefined") return;
  const first = spokenClauses(text, dialect)[0];
  if (!first) return;
  const key = ttsKey(first, dialect);
  if (!ttsCache.has(key)) ttsCache.set(key, fetchTts(first, dialect));
}

function scoreVoice(voice: SpeechSynthesisVoice, dialect: Dialect) {
  const lang = (voice.lang || "").toLowerCase();
  const name = `${voice.name} ${voice.lang}`.toLowerCase();
  let score = 0;
  if (dialect === "eg") {
    if (lang === "ar-eg") score += 80;
    if (/egypt|cairo|hoda|salma/.test(name)) score += 50;
    if (lang.startsWith("ar-eg")) score += 20;
  }
  if (dialect === "ae" && (lang === "ar-ae" || /emirati|uae|hamdan/.test(name))) score += 70;
  if (dialect === "sa" && (lang === "ar-sa" || /saudi|hamed|zariyah/.test(name))) score += 70;
  if (dialect === "qa" && lang === "ar-qa") score += 70;
  if (dialect === "kw" && lang === "ar-kw") score += 70;
  if (dialect === "en") {
    if (lang === "en-us") score += 60;
    if (/english|us english|google us/.test(name)) score += 30;
  } else if (lang.startsWith("ar")) score += 10;
  if (/google|microsoft|natural|neural|online/.test(name)) score += 8;
  return score;
}

function pickVoice(dialect: Dialect) {
  const voices = window.speechSynthesis?.getVoices() || [];
  const prefs = (DIALECT_UI[dialect] || DIALECT_UI.eg).voiceLangs.map((l) => l.toLowerCase());
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = 0;
  for (const voice of voices) {
    const lang = voice.lang.toLowerCase();
    let score = scoreVoice(voice, dialect);
    for (let i = 0; i < prefs.length; i += 1) {
      const want = prefs[i];
      if (lang === want) score += 40 - i * 4;
      else if (lang.startsWith(want)) score += 20 - i * 2;
    }
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  if (best && bestScore > 0) return best;
  if (dialect === "en") return voices.find((v) => /english/i.test(v.name)) || null;
  return voices.find((v) => /arab/i.test(v.name) || v.lang.toLowerCase().startsWith("ar")) || null;
}

function stopSpeechSource() {
  if (ctxSource) {
    try {
      ctxSource.stop();
    } catch {
      /* ignore */
    }
    ctxSource = null;
  }
}

function speakBrowser(text: string, dialect: Dialect, onStart?: () => void, onEnd?: () => void): { stop: () => void; started: Promise<boolean> } {
  if (!window.speechSynthesis) {
    return { stop() {}, started: Promise.resolve(false) };
  }
  const ui = DIALECT_UI[dialect] || DIALECT_UI.eg;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = dialect === "eg" ? "ar-EG" : ui.bcp47;
  u.rate = dialect === "eg" ? 1.02 : dialect === "en" ? 1 : 1.0;
  u.pitch = 1;
  const voice = pickVoice(dialect);
  if (voice) {
    u.voice = voice;
    if (voice.lang) u.lang = voice.lang;
  }
  let finished = false;
  let started = false;
  let abandoned = false;
  let startResolve: (ok: boolean) => void = () => {};
  const startedP = new Promise<boolean>((resolve) => {
    startResolve = resolve;
  });
  const done = () => {
    if (finished) return;
    finished = true;
    startResolve(started);
    onEnd?.();
  };
  u.onstart = () => {
    if (abandoned) return;
    started = true;
    startResolve(true);
    onStart?.();
  };
  u.onend = () => {
    if (abandoned && !started) return;
    done();
  };
  u.onerror = () => {
    if (abandoned && !started) {
      startResolve(false);
      return;
    }
    if (!started) startResolve(false);
    else done();
  };
  try {
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(u);
  } catch {
    startResolve(false);
  }
  window.setTimeout(() => {
    if (!started) startResolve(false);
  }, 400);
  return {
    started: startedP,
    stop() {
      abandoned = true;
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      if (started) done();
      else startResolve(false);
    },
  };
}

async function playViaContext(buf: ArrayBuffer, onStart?: () => void, onEnd?: () => void) {
  const ctx = armContext();
  if (!ctx) throw new Error("no ctx");
  await ctx.resume();
  if (ctx.state !== "running") throw new Error("ctx suspended");
  const decoded = await ctx.decodeAudioData(buf.slice(0));
  lastDuration = decoded.duration;
  lastStarted = "context";
  peakRms = 0;
  publishDebug();
  return await new Promise<() => void>((resolve, reject) => {
    try {
      stopSpeechSource();
      const src = ctx.createBufferSource();
      ctxSource = src;
      src.buffer = decoded;
      src.connect(masterGain || ctx.destination);
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        if (ctxSource === src) ctxSource = null;
        onEnd?.();
      };
      src.onended = done;
      onStart?.();
      src.start();
      const tick = () => {
        const v = currentRms();
        if (v > peakRms) peakRms = v;
        if (ctxSource === src) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      publishDebug();
      resolve(() => {
        try {
          src.stop();
        } catch {
          /* ignore */
        }
        done();
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function playViaElement(buf: ArrayBuffer, mime: string, onStart?: () => void, onEnd?: () => void) {
  const audio = ensurePlayer();
  if (!audio) throw new Error("no player");
  const url = URL.createObjectURL(new Blob([buf], { type: mime || "audio/mpeg" }));
  audio.loop = false;
  audio.muted = false;
  audio.volume = 1;
  audio.src = url;
  lastStarted = "element";
  publishDebug();
  return await new Promise<() => void>((resolve, reject) => {
    let finished = false;
    let startedPlay = false;
    const done = () => {
      if (finished) return;
      finished = true;
      URL.revokeObjectURL(url);
      onEnd?.();
    };
    audio.onplay = () => {
      lastDuration = Number.isFinite(audio.duration) ? audio.duration : lastDuration;
      onStart?.();
      publishDebug();
    };
    audio.onended = done;
    audio.onerror = () => {
      lastError = "element-error";
      publishDebug();
      if (!startedPlay) {
        URL.revokeObjectURL(url);
        reject(new Error("play"));
        return;
      }
      done();
    };
    const tryPlay = () => {
      if (startedPlay || finished) return;
      startedPlay = true;
      void audio.play().then(
        () => {
          publishDebug();
          resolve(() => {
            try {
              audio.pause();
            } catch {
              /* ignore */
            }
            done();
          });
        },
        (err) => {
          lastError = String(err);
          startedPlay = false;
          publishDebug();
          URL.revokeObjectURL(url);
          reject(err);
        },
      );
    };
    audio.oncanplaythrough = () => tryPlay();
    audio.oncanplay = () => tryPlay();
    try {
      audio.load();
    } catch {
      /* ignore */
    }
    window.setTimeout(() => tryPlay(), 500);
  });
}

async function playServerTts(text: string, dialect: Dialect, onStart?: () => void, onEnd?: () => void) {
  const key = ttsKey(text, dialect);
  const pending = ttsCache.get(key) || fetchTts(text, dialect);
  ttsCache.set(key, pending);
  const buf = await pending;
  lastBytes = buf.byteLength;
  publishDebug();
  const mime = "audio/mpeg";
  try {
    return await playViaElement(buf, mime, onStart, onEnd);
  } catch (e) {
    lastError = String(e);
    publishDebug();
    return await playViaContext(buf, onStart, onEnd);
  }
}

export function speakText(text: string, dialect: Dialect, onStart?: () => void, onEnd?: () => void) {
  if (typeof window === "undefined") {
    onEnd?.();
    return () => {};
  }
  const parts = spokenClauses(text, dialect);
  if (!parts.length) {
    onEnd?.();
    return () => {};
  }
  stopSpeechSource();
  stopBrowserSpeak();
  armContext();
  if (parts[1]) {
    const key = ttsKey(parts[1], dialect);
    if (!ttsCache.has(key)) ttsCache.set(key, fetchTts(parts[1], dialect));
  }
  let cancelled = false;
  let stopInner: () => void = () => {};
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    onEnd?.();
  };
  void (async () => {
    for (let i = 0; i < parts.length; i += 1) {
      if (cancelled) {
        finish();
        return;
      }
      const piece = parts[i];
      const startedAt = i === 0 ? onStart : undefined;
      const voicesNow = window.speechSynthesis?.getVoices() || [];
      const canUseEnglishBrowser = dialect === "en" && voicesNow.some((v) => v.lang.toLowerCase().startsWith("en"));
      let played = false;
      if (canUseEnglishBrowser) {
        const browser = speakBrowser(
          piece,
          dialect,
          () => {
            if (!cancelled) startedAt?.();
          },
          () => {},
        );
        stopInner = browser.stop;
        const started = await Promise.race([browser.started, new Promise<boolean>((r) => window.setTimeout(() => r(false), 400))]);
        if (cancelled) {
          browser.stop();
          finish();
          return;
        }
        if (started) {
          played = true;
          await new Promise<void>((resolve) => {
            const prev = browser.stop;
            stopInner = () => {
              prev();
              resolve();
            };
            window.setTimeout(resolve, Math.min(8000, piece.length * 80 + 1200));
          });
        } else browser.stop();
      }
      if (!played) {
        try {
          await new Promise<void>((resolve, reject) => {
            void playServerTts(
              piece,
              dialect,
              () => {
                if (!cancelled) startedAt?.();
              },
              () => resolve(),
            ).then(
              (stop) => {
                stopInner = () => {
                  stop();
                  resolve();
                };
              },
              reject,
            );
          });
        } catch (e) {
          lastError = String(e);
          publishDebug();
          if (i === parts.length - 1) {
            const retry = speakBrowser(piece, dialect, () => {
              if (!cancelled) startedAt?.();
            }, () => {});
            stopInner = retry.stop;
            const ok = await retry.started;
            if (!ok && i === 0) {
              finish();
              return;
            }
          }
        }
      }
    }
    finish();
  })();
  return () => {
    cancelled = true;
    stopInner();
    stopSpeechSource();
    stopBrowserSpeak();
    finish();
  };
}

export function speakWelcome(text: string, dialect: Dialect) {
  return speakText(text, dialect);
}

export function createReplySpeaker(
  getDialect: () => Dialect,
  hooks: { onStart?: () => void; onEnd?: () => void },
) {
  let stopInner = () => {};
  let started = false;
  let rest = "";
  let firstEnded = false;
  let ended = false;
  let streamDone = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    hooks.onEnd?.();
  };
  const playRest = () => {
    if (ended) return;
    const piece = rest.trim();
    rest = "";
    if (piece) {
      stopInner = speakText(piece, getDialect(), undefined, () => finish());
      return;
    }
    if (streamDone) finish();
  };
  return {
    push(text: string) {
      if (ended) return;
      const dialect = getDialect();
      const clauses = spokenClauses(text, dialect);
      if (clauses.length > 1) rest = clauses.slice(1).join(" ");
      if (started) return;
      const first = firstClauseReady(text, dialect);
      if (!first) return;
      started = true;
      stopInner = speakText(first, dialect, hooks.onStart, () => {
        firstEnded = true;
        playRest();
      });
    },
    finish(text?: string) {
      if (ended) return;
      streamDone = true;
      if (text) this.push(text);
      if (!started) {
        const dialect = getDialect();
        const said = spokenClauses(text || "", dialect).join(" ") || String(text || "").trim();
        if (!said) {
          finish();
          return;
        }
        started = true;
        stopInner = speakText(said, dialect, hooks.onStart, () => finish());
        return;
      }
      if (firstEnded) playRest();
    },
    stop() {
      stopInner();
      rest = "";
      started = true;
      firstEnded = true;
      streamDone = true;
      finish();
    },
  };
}

export type ListenCtl = {
  stop: () => void;
  pause: () => void;
  resume: () => void;
};

export function startListen(
  dialect: Dialect,
  handlers: {
    onFinal: (text: string) => void;
    onPartial?: (text: string) => void;
    onError?: (code: string) => void;
    ignoreFinal?: () => boolean;
  },
): ListenCtl {
  const Ctor = recognitionCtor();
  const noop: ListenCtl = { stop() {}, pause() {}, resume() {} };
  if (!Ctor) {
    handlers.onError?.("no-stt");
    return noop;
  }
  const RecEngine = Ctor;
  let wanted = true;
  let muted = false;
  let rec: Rec | null = null;
  let restartTimer = 0;
  let watchTimer = 0;
  let lastFinalAt = 0;

  function boot() {
    if (!wanted || rec) return;
    window.clearTimeout(restartTimer);
    const next = new RecEngine();
    rec = next;
    let seen = 0;
    next.lang = (DIALECT_UI[dialect] || DIALECT_UI.eg).bcp47;
    next.interimResults = true;
    next.continuous = true;
    next.onresult = (ev) => {
      if (!wanted) return;
      let interim = "";
      const fresh: string[] = [];
      for (let i = 0; i < ev.results.length; i += 1) {
        const row = ev.results[i];
        const piece = row[0]?.transcript || "";
        if (!row.isFinal) {
          interim += piece;
          continue;
        }
        if (i < seen) continue;
        seen = i + 1;
        if (piece.trim()) fresh.push(piece.trim());
      }
      if (muted || handlers.ignoreFinal?.()) {
        if (interim) handlers.onPartial?.(interim);
        return;
      }
      if (interim) handlers.onPartial?.(interim);
      const text = fresh.join(" ").replace(/\s+/g, " ").trim();
      if (!text) return;
      const now = Date.now();
      if (now - lastFinalAt < 400) return;
      lastFinalAt = now;
      handlers.onFinal(text);
    };
    next.onerror = (ev) => {
      const code = String(ev.error || "error");
      if (code === "not-allowed" || code === "service-not-allowed") {
        wanted = false;
        handlers.onError?.(code);
        return;
      }
      // no-speech / network / aborted: keep the session — onend restarts.
    };
    next.onend = () => {
      if (rec === next) rec = null;
      if (!wanted) return;
      restartTimer = window.setTimeout(boot, 60);
    };
    try {
      next.start();
    } catch {
      rec = null;
      restartTimer = window.setTimeout(boot, 120);
    }
  }

  boot();
  watchTimer = window.setInterval(() => {
    if (wanted && !rec) boot();
  }, 900);
  return {
    stop() {
      wanted = false;
      muted = false;
      window.clearTimeout(restartTimer);
      window.clearInterval(watchTimer);
      try {
        rec?.stop();
      } catch {
        try {
          rec?.abort();
        } catch {
          /* ignore */
        }
      }
      rec = null;
    },
    pause() {
      muted = true;
    },
    resume() {
      if (!wanted) return;
      muted = false;
      if (!rec) boot();
    },
  };
}
