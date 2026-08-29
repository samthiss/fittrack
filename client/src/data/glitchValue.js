import { useState, useEffect, useRef } from 'react';

// Glyphs a readout cycles through before settling. Digits dominate so the scramble keeps the
// shape of a number instead of turning into noise.
const GLYPHS = '0123456789012345678901234567#%&$@';

function scramble(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  return out;
}

function prefersReducedMotion() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Returns what to display for `value`: the value itself, except for a few frames after it
 * changes, where it decodes out of random glyphs. Only on *changes* — the first render shows the
 * real number, so a screen never boots into noise.
 */
export function useGlitchValue(value, { duration = 240, step = 45 } = {}) {
  const [display, setDisplay] = useState(value);
  // What's currently settled on screen, so an unrelated re-render (same value) never scrambles.
  const settled = useRef(value);

  useEffect(() => {
    if (settled.current === value) return;
    settled.current = value;
    if (prefersReducedMotion()) {
      setDisplay(value);
      return;
    }
    const width = String(value).length;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt >= duration) {
        clearInterval(timer);
        setDisplay(value);
        return;
      }
      setDisplay(scramble(width));
    }, step);
    return () => {
      clearInterval(timer);
      // Unmounting mid-scramble must not leave glyphs behind if the node gets reused.
      setDisplay(value);
    };
  }, [value, duration, step]);

  return display;
}
