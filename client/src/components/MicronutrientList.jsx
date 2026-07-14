import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

// Floor nutrients (targets to reach): red <50%, orange 50-80%, green 80%+. No blue/"too high"
// tier — being generously covered isn't a problem for these, unlike limit nutrients below.
// Limit nutrients (ceilings not to cross): green under 80%, orange 80-100%, red over 100%.
function microFillClass(status) {
  return { low: 'fill-low', warn: 'fill-warn', ok: 'fill-ok', danger: 'fill-low' }[status];
}

function MicroBar({ m, sources, expandedKey, onToggleExpand, t }) {
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
          {m.kind === 'limit' && <span className="limit-tag">{t('micro.limitTag')}</span>}
          {m.weeklyAvg && <span className="limit-tag">{t('micro.weeklyAvgTag')}</span>}
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
      {m.suggestion && <p className="micro-suggestion">👉 {t('micro.addSource')} {m.suggestion}.</p>}
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
  const { t, lang } = useLanguage();
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

  const nutrientWord = t('micro.nutrientWord') + (toImprove.length !== 1 ? 's' : '');
  const coveredWord = t('micro.coveredWord') + (lang === 'fr' && covered.length !== 1 ? 's' : '');

  return (
    <div>
      <div className="card micro-summary-card">
        <p className="micro-summary-line">
          <b>{toImprove.length}</b> {nutrientWord} {t('micro.toImprove')} ·{' '}
          <b>{covered.length}</b> {coveredWord}
        </p>
        {priorities.length > 0 && (
          <p className="hint">
            {t('micro.priorities')} : {priorities.map((m) => `${m.label} (${Math.round(m.pct)}%)`).join(', ')}
          </p>
        )}
      </div>

      {toImprove.length > 0 && (
        <>
          <h4 className="section-label">{t('micro.toImproveTitle')}</h4>
          <div className="card">
            {toImprove.map((m) => (
              <MicroBar key={m.key} m={m} sources={sources} expandedKey={expandedKey} onToggleExpand={toggleExpand} t={t} />
            ))}
          </div>
        </>
      )}

      {covered.length > 0 && (
        <>
          <h4 className="section-label clickable" onClick={() => setShowCovered((s) => !s)}>
            {t('micro.coveredTitle')} ({covered.length}) {showCovered ? '▾' : '▸'}
          </h4>
          {showCovered && (
            <div className="card">
              {covered.map((m) => (
                <MicroBar key={m.key} m={m} sources={sources} expandedKey={expandedKey} onToggleExpand={toggleExpand} t={t} />
              ))}
            </div>
          )}
        </>
      )}

      {limits.length > 0 && (
        <>
          <h4 className="section-label">{t('micro.limitsTitle')}</h4>
          <div className="card">
            {limits.map((m) => (
              <MicroBar key={m.key} m={m} sources={sources} expandedKey={expandedKey} onToggleExpand={toggleExpand} t={t} />
            ))}
          </div>
        </>
      )}

      {toImprove.length > 0 && (
        <>
          <h4 className="section-label">{t('micro.detailedRecos')}</h4>
          <div className="card">
            {toImprove.map((m) => (
              <p className="hint micro-reco-line" key={m.key}>
                <b>{m.label}</b> {t('micro.at')} {Math.round(m.pct)}% : {t('micro.addSource')} {m.suggestion || t('micro.defaultSuggestion')}.
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
