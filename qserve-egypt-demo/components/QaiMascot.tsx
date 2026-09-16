"use client";

type Size = "sm" | "md" | "lg";
type Pose = "idle" | "walk" | "point" | "grab" | "haul" | "drop";

function Lotus() {
  return (
    <svg className="qai-lotus" viewBox="0 0 32 28" aria-hidden>
      <path d="M16 26c-3.2-4.6-8.8-7.4-8.8-13.2C7.2 8.2 11 6.4 16 10.2 21 6.4 24.8 8.2 24.8 12.8 24.8 18.6 19.2 21.4 16 26Z" fill="#d4af37" />
      <path d="M16 24c-2-5.4-7.6-7-7.6-12.2 0-2.8 2.2-4.2 5.2-2.4C15 10.6 16 13 16 13s1-2.4 2.4-3.6c3-1.8 5.2-.4 5.2 2.4C23.6 17 18 18.6 16 24Z" fill="#f6e27a" />
    </svg>
  );
}

function OsMouse() {
  return (
    <svg className="qai-os-mouse" viewBox="0 0 32 32" aria-hidden>
      <path
        d="M4 2.5 4 23.5 11.2 16.6 16.8 29.4 20.6 27.8 15.2 15.4 26.5 15.4Z"
        fill="#0b1b33"
        stroke="#d4af37"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
      <span className="qai-figure">
        <span className="qai-antenna" aria-hidden>
          <span className="qai-ant-rod" />
          <span className="qai-ant-ball" />
        </span>
        <span className="qai-arm qai-arm-l" aria-hidden>
          <span className="qai-forearm" />
          <span className="qai-hand" />
        </span>
        <span className="qai-leg qai-leg-l" aria-hidden>
          <span className="qai-thigh" />
          <span className="qai-shin" />
          <span className="qai-foot" />
        </span>
        <span className="qai-leg qai-leg-r" aria-hidden>
          <span className="qai-thigh" />
          <span className="qai-shin" />
          <span className="qai-foot" />
        </span>
        <span className="qai-torso" aria-hidden>
          <span className="qai-chest">
            <Lotus />
          </span>
        </span>
        <span className="qai-head">
          <span className="qai-hood" aria-hidden />
          <span className="qai-qtail" aria-hidden />
          <span className="qai-face">
            <span className="qai-visor" aria-hidden />
            <span className="qai-eye qai-eye-l" aria-hidden />
            <span className="qai-eye qai-eye-r" aria-hidden />
            <span className="qai-mouth" aria-hidden />
          </span>
        </span>
        <span className="qai-arm qai-arm-r" aria-hidden>
          <span className="qai-forearm" />
          <span className="qai-hand" />
          <span className="qai-mouse-drag">
            <OsMouse />
          </span>
        </span>
      </span>
      {heldThumb ? <img src={heldThumb} alt="" className="qai-held" /> : null}
      {haul || pose === "haul" ? (
        <span className="qai-mini-cart" aria-hidden>
          <span className="qai-mini-basket" />
          <span className="qai-mini-wheel qai-mini-wheel-l" />
          <span className="qai-mini-wheel qai-mini-wheel-r" />
        </span>
      ) : null}
    </span>
  );
}
