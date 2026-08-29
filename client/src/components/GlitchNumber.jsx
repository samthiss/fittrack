import { useGlitchValue } from '../data/glitchValue';

// A number that decodes itself whenever it changes — see useGlitchValue for the timing.
export default function GlitchNumber({ value, className }) {
  return <span className={className}>{useGlitchValue(value)}</span>;
}
