export default function CircularGauge({ value, max, label, size = 190 }) {
  const radius = (size - 18) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const offset = circumference * (1 - ratio);
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="gauge">
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--line)"
        strokeWidth="10"
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--acc)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
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
