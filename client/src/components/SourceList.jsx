// Expandable "d'où ça vient" list, shared by TodayReport/WeekReport rows and the fermented-foods
// microbiote row. `sources` is the [{label, value}] shape already used by MicronutrientList.
export default function SourceList({ sources, unit }) {
  if (!sources || sources.length === 0) {
    return <p className="hint" style={{ margin: '4px 0 0' }}>Aucune source identifiée.</p>;
  }
  return (
    <div className="micro-source-list">
      {sources.map((s, i) => (
        <div className="micro-source-row" key={i}>
          <span>{s.label}</span>
          {s.value != null && (
            <span>
              {s.value.toFixed(1)} {unit}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
