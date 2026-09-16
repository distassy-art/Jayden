"use client";

import { DIALECT_UI, type Dialect } from "@/lib/dialect";

export function TalkButton({
  dialect,
  listening,
  blocked,
  disabled,
  size = "md",
  onClick,
}: {
  dialect: Dialect;
  listening: boolean;
  blocked?: boolean;
  disabled?: boolean;
  size?: "md" | "lg";
  onClick: () => void;
}) {
  const ui = DIALECT_UI[dialect] || DIALECT_UI.eg;
  const label = listening ? ui.stop : ui.talk;
  const hint = blocked ? ui.enableHint : listening ? ui.listen : ui.speakHint;
  return (
    <button
      type="button"
      className={`qai-talk-btn ${size === "lg" ? "qai-talk-btn-lg" : ""} ${listening ? "is-listen" : ""} ${blocked ? "is-blocked" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? ui.stop : ui.aria}
    >
      <span className="qai-mic-icon" aria-hidden>
        {listening ? (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2Z" />
          </svg>
        )}
      </span>
      <span className="qai-talk-copy">
        <strong>
          {listening ? <span className="qai-mic-on-dot" /> : null}
          {label}
        </strong>
        <em>{hint}</em>
      </span>
    </button>
  );
}
