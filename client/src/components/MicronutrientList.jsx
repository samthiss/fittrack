import { useState } from 'react';

// Floor nutrients (targets to reach): red <50%, orange 50-80%, green 80%+. No blue/"too high"
// tier — being generously covered isn't a problem for these, unlike limit nutrients below.
// Limit nutrients (ceilings not to cross): green under 80%, orange 80-100%, red over 100%.
function microFillClass(status) {
  return { low: 'fill-low', warn: 'fill-warn', ok: 'fill-ok', danger: 'fill-low' }[status];
}

function MicroBar({ m, sources, expandedKey, onToggleExpand }) {
  const rowSources = sources?.[m.key];
  const canExpand = Boolean(rowSources && rowSources.length > 0);
  const isExpanded = expandedKey === m.key;
  return (
    <div className="micro-row">
      <div
        className={canExpand ? 'micro-row-top clickable' : 'micro-row-top'}
        onClick={canExpand ? () => onToggleExpand(m.key) : undefined}
      >
        <span>
          {m.label}
          {m.kind === 'limit' && <span className="limit-tag"> (seuil max)</span>}
          {m.weeklyAvg && <span className="limit-tag"> (moy. 7j)</span>}
          {canExpand && <span className="micro-source-toggle">{isExpanded ? ' ▾' : ' ▸'}</span>}
        </span>
        <span className="rate">
          {m.avg.toFixed(1)} / {m.reference} {m.unit} · {Math.round(m.pct)}%
        </span>
      </div>
      <div className="progress-track">
        <div
          className={`progress-fill ${microFillClass(m.status)}`}
          style={{ width: `${Math.min(100, m.pct)}%` }}
        />
      </div>
      {m.suggestion && <p className="micro-suggestion">👉 Ajoute {m.suggestion}.</p>}
      {m.excessMessage && <p className="micro-suggestion">ℹ️ {m.excessMessage}</p>}
      {isExpanded && canExpand && (
        <div className="micro-source-list">
          {rowSources.map((s, i) => (
            <div className="micro-source-row" key={i}>
              <span>{s.label}</span>
              <span>
                {s.value.toFixed(1)} {m.unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MicronutrientList({ micros, sources }) {
  const [expandedKey, setExpandedKey] = useState(null);
  const [showCovered, setShowCovered] = useState(true);

  function toggleExpand(key) {
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  const floors = micros.filter((m) => m.kind !== 'limit');
  const limits = micros.filter((m) => m.kind === 'limit');
  const toImprove = floors.filter((m) => m.pct < 80);
  const covered = floors.filter((m) => m.pct >= 80);
  const priorities = toImprove.slice(0, 3);

  return (
    <div>
      <div className="card micro-summary-card">
        <p className="micro-summary-line">
          <b>{toImprove.length}</b> nutriment{toImprove.length !== 1 ? 's' : ''} à améliorer ·{' '}
          <b>{covered.length}</b> couvert{covered.length !== 1 ? 's' : ''}
        </p>
        {priorities.length > 0 && (
          <p className="hint">
            Priorités du jour : {priorities.map((m) => `${m.label} (${Math.round(m.pct)}%)`).join(', ')}
          </p>
        )}
      </div>

      {toImprove.length > 0 && (
        <>
          <h4 className="section-label">À améliorer</h4>
          <div className="card">
            {toImprove.map((m) => (
              <MicroBar key={m.key} m={m} sources={sources} expandedKey={expandedKey} onToggleExpand={toggleExpand} />
            ))}
          </div>
        </>
      )}

      {covered.length > 0 && (
        <>
          <h4 className="section-label clickable" onClick={() => setShowCovered((s) => !s)}>
            Couverts ({covered.length}) {showCovered ? '▾' : '▸'}
          </h4>
          {showCovered && (
            <div className="card">
              {covered.map((m) => (
                <MicroBar key={m.key} m={m} sources={sources} expandedKey={expandedKey} onToggleExpand={toggleExpand} />
              ))}
            </div>
          )}
        </>
      )}

      {limits.length > 0 && (
        <>
          <h4 className="section-label">Seuils à ne pas dépasser</h4>
          <div className="card">
            {limits.map((m) => (
              <MicroBar key={m.key} m={m} sources={sources} expandedKey={expandedKey} onToggleExpand={toggleExpand} />
            ))}
          </div>
        </>
      )}

      {toImprove.length > 0 && (
        <>
          <h4 className="section-label">Recommandations détaillées</h4>
          <div className="card">
            {toImprove.map((m) => (
              <p className="hint micro-reco-line" key={m.key}>
                <b>{m.label}</b> à {Math.round(m.pct)}% : ajoute {m.suggestion || 'une source alimentaire adaptée'}.
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
