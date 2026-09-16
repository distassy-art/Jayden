"use client";

type Size = "sm" | "md" | "lg";

export function QaiMascot({
  size = "lg",
  talking = false,
  enter = false,
  idle = true,
  label = "Q AI",
}: {
  size?: Size;
  talking?: boolean;
  enter?: boolean;
  idle?: boolean;
  label?: string;
}) {
  const cls = [
    "qai-puppet",
    `qai-${size}`,
    idle ? "is-idle" : "",
    enter ? "is-enter" : "",
    talking ? "is-talking" : "",
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
