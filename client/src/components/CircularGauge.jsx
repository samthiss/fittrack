export default function CircularGauge({ value, max, label, size = 190 }) {
  const radius = (size - 18) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const offset = circumference * (1 - ratio);
  const center = size / 2;
  const gradientId = 'ftGaugeGrad';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="gauge">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c9bcff" />
          <stop offset="55%" stopColor="#a893ff" />
          <stop offset="100%" stopColor="#7c5cfc" />
        </linearGradient>
      </defs>
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--ink-600, var(--line))"
        strokeWidth="10"
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
        style={{
          transition: 'stroke-dashoffset 700ms var(--ease-standard, ease)',
          filter: 'drop-shadow(0 0 8px rgba(139,118,249,0.5))',
        }}
      />
      <text x={center} y={center - 6} textAnchor="middle" className="gauge-value">
        {value < 0 ? `+${Math.round(-value)}` : Math.round(value)}
      </text>
      <text x={center} y={center + 22} textAnchor="middle" className="gauge-label">
        {label}
      </text>
    </svg>
  );
}
