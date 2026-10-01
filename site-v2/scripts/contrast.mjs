#!/usr/bin/env node
/*
 * Contrast audit for the design tokens in base.css.
 *
 * Small UI text — table headers, stat labels, hints — is the easiest thing to
 * get wrong when a palette is tuned by eye, and it is the first thing to fail
 * on a laptop screen in daylight. This reads the real token values out of the
 * stylesheet and checks the pairings that actually appear in the interface.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Parse `#rgb`, `#rrggbb` or `rgba(r, g, b, a)` into `[r, g, b, a]` 0–255/0–1. */
function parseColour(value) {
  const text = String(value).trim();

  const rgba = text.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  }

  const hex = text.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
    full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
  ];
}

/** Flatten a translucent colour onto an opaque one. */
function composite(colour, backdrop) {
  const [r, g, b, a] = parseColour(colour);
  if (a >= 1) return [r, g, b, 1];
  const [br, bg, bb] = parseColour(backdrop);
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
}

/** WCAG relative luminance. */
function luminance([r, g, b]) {
  const linear = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * Contrast ratio, flattening any translucency onto `base` first — a badge
 * background at 16% alpha is really that colour over the card behind it.
 */
function ratio(foreground, background, base) {
  const bg = composite(background, base);
  const fg = composite(foreground, bg);
  const a = luminance(fg);
  const b = luminance(bg);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/** Pull custom-property declarations out of a `:root`-style block. */
function tokensIn(css, selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`no ${selector} block in base.css`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const block = css.slice(open + 1, close);

  const tokens = {};
  const pattern = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s*;/g;
  for (const [, name, value] of block.matchAll(pattern)) {
    tokens[name] = value;
  }
  return tokens;
}

/* Foreground/background pairs as they are actually used, with the WCAG minimum
   for that text size. 4.5 is the AA floor for normal text; 3.0 covers large
   text and non-text boundaries such as borders. */
const PAIRINGS = [
  ["text", "bg", 4.5, "body text on the page background"],
  ["text", "surface", 4.5, "body text on a card"],
  ["text", "surface-2", 4.5, "body text on a subtle surface"],
  ["text-2", "surface", 4.5, "secondary text on a card"],
  ["text-2", "surface-2", 4.5, "secondary text on a subtle surface"],
  ["text-3", "surface", 4.5, "muted text on a card"],
  ["text-3", "surface-2", 4.5, "table headers on their header row"],
  ["text-3", "bg", 4.5, "muted text on the page background"],
  ["pos-fg", "pos-bg", 4.5, "positive badge"],
  ["neg-fg", "neg-bg", 4.5, "negative badge"],
  ["warn-fg", "warn-bg", 4.5, "warning badge"],
  ["info-fg", "info-bg", 4.5, "info badge"],
  ["accent-ink", "accent-soft", 4.5, "active trail step and calendar chip"],
  // WCAG 1.4.11: a control has to be distinguishable from its surroundings.
  ["field-border", "surface", 3.0, "input and button borders on a card"],
  ["field-border", "bg", 3.0, "input and button borders on the page"],
];

const css = await readFile(join(ROOT, "public", "assets", "base.css"), "utf8");

const THEMES = [
  ["light", tokensIn(css, ":root")],
  ["dark", { ...tokensIn(css, ":root"), ...tokensIn(css, '[data-theme="dark"]') }],
];

let failures = 0;

for (const [theme, tokens] of THEMES) {
  process.stdout.write(`\n${theme}\n`);
  for (const [fg, bg, minimum, label] of PAIRINGS) {
    if (!tokens[fg] || !tokens[bg]) {
      failures += 1;
      process.stdout.write(`  FAIL  ${label}: --${tokens[fg] ? bg : fg} is not a resolvable colour\n`);
      continue;
    }
    // Translucent tokens are flattened onto the card behind them.
    const value = ratio(tokens[fg], tokens[bg], tokens.surface);
    const ok = value >= minimum;
    if (!ok) failures += 1;
    process.stdout.write(`  ${ok ? "ok  " : "FAIL"}  ${value.toFixed(2)}:1 `
      + `(needs ${minimum.toFixed(1)}) — ${label} [${tokens[fg]} on ${tokens[bg]}]\n`);
  }
}

process.stdout.write(failures ? `\n${failures} pairing(s) below the minimum\n` : "\nAll pairings pass\n");
process.exitCode = failures ? 1 : 0;
