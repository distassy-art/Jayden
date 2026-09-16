"use client";

type Size = "sm" | "md" | "lg";
type Pose = "idle" | "walk" | "point" | "grab" | "haul" | "drop";

export function QaiMascot({
  size = "lg",
  talking = false,
  enter = false,
  idle = true,
  pose = "idle",
  facing = "right",
  haul = false,
  heldThumb = "",
  label = "Q AI",
}: {
  size?: Size;
  talking?: boolean;
  enter?: boolean;
  idle?: boolean;
  pose?: Pose;
  facing?: "left" | "right";
  haul?: boolean;
  heldThumb?: string;
  label?: string;
}) {
  const walking = pose === "walk" || pose === "haul";
  const cls = [
    "qai-puppet",
    `qai-${size}`,
    `qai-pose-${pose}`,
    facing === "left" ? "is-left" : "is-right",
    idle && !walking ? "is-idle" : "",
    walking ? "is-walk" : "",
    enter ? "is-enter" : "",
    talking ? "is-talking" : "",
    haul ? "is-haul" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={cls} role="img" aria-label={label}>
      <span className="qai-legs">
        <span className="qai-leg qai-leg-l" />
        <span className="qai-leg qai-leg-r" />
      </span>
      <img src="/brand/qserve-ai-official-logo.jpg" alt="" className="qai-skin" />
      <span className="qai-mouth" aria-hidden />
      <span className="qai-arm qai-arm-l" aria-hidden />
      <span className="qai-arm qai-arm-r" aria-hidden />
      {heldThumb ? <img src={heldThumb} alt="" className="qai-held" /> : null}
      {haul || pose === "haul" ? (
        <span className="qai-mini-cart" aria-hidden>
          <span className="qai-mini-basket" />
          <span className="qai-mini-wheel qai-mini-wheel-l" />
          <span className="qai-mini-wheel qai-mini-wheel-r" />
        </span>
      ) : null}
      <span className="qai-mouse-drag" aria-hidden>
        <span className="qai-gold-hand" />
        <svg className="qai-os-mouse" viewBox="0 0 32 32" width="28" height="28">
          <path
            d="M4 2.5 4 23.5 11.2 16.6 16.8 29.4 20.6 27.8 15.2 15.4 26.5 15.4Z"
            fill="#0b1b33"
            stroke="#d4af37"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );
}
