"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { kbBySku, thumbFor } from "@/lib/product-db";
import { openCartDrawer } from "@/lib/cart";
import { QaiMascot } from "./QaiMascot";

type Pose = "idle" | "walk" | "point" | "grab" | "haul" | "drop";
type Spot = { x: number; y: number };

function clampSpot(w: number, h: number, preferRight: boolean): Spot {
  const header = 118;
  const pad = 10;
  const maxX = Math.max(pad, window.innerWidth - w - pad);
  const maxY = Math.max(header, window.innerHeight - h - pad);
  const leftBand = pad + Math.random() * Math.max(24, maxX * 0.28);
  const rightBand = maxX * 0.55 + Math.random() * Math.max(24, maxX * 0.4);
  const x = preferRight ? Math.min(maxX, rightBand) : Math.min(maxX, leftBand);
  const y = header + Math.random() * Math.max(40, maxY - header);
  return { x, y };
}

function productTargets(need: string) {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-sku], .story-card"));
  if (!nodes.length) return [];
  const n = need.toLowerCase();
  const scored = nodes.map((el) => {
    const sku = (el.getAttribute("data-sku") || "").toUpperCase();
    const hay = `${sku} ${el.textContent || ""}`.toLowerCase();
    let s = 0;
    if (n && hay.includes(n.slice(0, 8))) s += 4;
    if (/screen|lcd|شاشة/.test(n) && /lcd|led|شاشة/.test(hay)) s += 6;
    if (/hdmi|cable|كابل/.test(n) && /cab|hdmi|كابل/.test(hay)) s += 6;
    if (/wifi|واي/.test(n) && /wifi|واي/.test(hay)) s += 6;
    if (/queue|انتظار|نظام/.test(n) && /queue|انتظار|sys/.test(hay)) s += 5;
    return { el, sku, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.filter((x) => x.s > 0).concat(scored.filter((x) => x.s === 0)).slice(0, 8);
}

export function QaiWanderer({
  ar,
  open,
  talking,
  hello,
  onOpen,
  onDismiss,
}: {
  ar: boolean;
  open: boolean;
  talking: boolean;
  hello: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<Spot>({ x: 24, y: 180 });
  const [facing, setFacing] = useState<"left" | "right">("left");
  const [pose, setPose] = useState<Pose>("idle");
  const [hop, setHop] = useState(false);
  const [held, setHeld] = useState("");
  const lastRight = useRef(true);
  const job = useRef(false);

  const size = open ? 140 : 86;
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const jump = useCallback(
    (target?: Spot, nextPose: Pose = "walk") => {
      const next = target || clampSpot(size, size + 24, !lastRight.current);
      lastRight.current = next.x > (typeof window !== "undefined" ? window.innerWidth / 2 : 400);
      setFacing(next.x < spot.x ? "left" : "right");
      setPose(nextPose);
      setHop(true);
      setSpot(next);
      window.setTimeout(() => setHop(false), 520);
      window.setTimeout(() => setPose("idle"), 2600);
    },
    [size, spot.x],
  );

  useEffect(() => {
    const start = clampSpot(size, size + 24, true);
    setSpot(start);
    lastRight.current = true;
  }, [size]);

  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => {
      if (job.current) return;
      const need = sessionStorage.getItem("qserve-need") || "";
      const hits = productTargets(need);
      if (hits.length && Math.random() > 0.35) {
        const hit = hits[Math.floor(Math.random() * Math.min(3, hits.length))];
        const r = hit.el.getBoundingClientRect();
        document.querySelectorAll(".qai-pointed").forEach((n) => n.classList.remove("qai-pointed"));
        hit.el.classList.add("qai-pointed");
        jump({ x: Math.max(8, r.left + r.width / 2 - size / 2), y: Math.max(120, r.top + r.height - 20) }, "point");
        window.setTimeout(() => hit.el.classList.remove("qai-pointed"), 3200);
      } else {
        jump();
      }
    }, 9000);
    return () => window.clearInterval(t);
  }, [jump, reduced, size]);

  useEffect(() => {
    const onAdd = (e: Event) => {
      const sku = String((e as CustomEvent).detail?.sku || "");
      const thumb = String((e as CustomEvent).detail?.thumb || thumbFor(sku, kbBySku(sku)?.category));
      if (!sku || job.current || reduced) {
        openCartDrawer();
        return;
      }
      job.current = true;
      const card = document.querySelector<HTMLElement>(`[data-sku="${sku}"]`);
      const r = card?.getBoundingClientRect();
      if (card) card.classList.add("qai-pointed");
      if (r) jump({ x: Math.max(8, r.left), y: Math.max(120, r.top) }, "point");
      else jump(undefined, "walk");
      window.setTimeout(() => {
        setPose("grab");
        setHeld(thumb);
      }, 900);
      window.setTimeout(() => {
        setPose("haul");
        jump({ x: 28, y: Math.max(140, window.innerHeight * 0.42) }, "haul");
        openCartDrawer();
      }, 1600);
      window.setTimeout(() => {
        setPose("drop");
        if (card) card.classList.remove("qai-pointed");
      }, 3200);
      window.setTimeout(() => {
        setHeld("");
        setPose("idle");
        job.current = false;
        jump();
      }, 4000);
    };
    window.addEventListener("qserve:cart-add", onAdd);
    return () => window.removeEventListener("qserve:cart-add", onAdd);
  }, [jump, reduced]);

  return (
    <div
      ref={box}
      className={`qai-wander ${hop ? "is-hop" : ""} ${open ? "is-open" : ""}`}
      style={{ left: spot.x, top: spot.y, width: size + (open ? 8 : 0) }}
    >
      {open && (
        <button type="button" className="qai-wander-x" aria-label={ar ? "إغلاق المساعد" : "Close assistant"} onClick={onDismiss}>
          ×
        </button>
      )}
      <button type="button" className="qai-wander-hit" onClick={onOpen} aria-label={ar ? "كيو AI" : "Q AI"}>
        <QaiMascot
          size={open ? "lg" : "sm"}
          talking={talking}
          enter={hop}
          idle={pose === "idle"}
          pose={pose}
          facing={facing}
          haul={pose === "haul"}
          heldThumb={held}
          label={ar ? "كيو AI" : "Q AI"}
        />
      </button>
      {!open && <span className="qai-wander-tag">Q AI</span>}
      {open && <p className="qai-wander-bubble">{hello}</p>}
    </div>
  );
}
