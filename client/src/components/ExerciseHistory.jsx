import { useState, useEffect } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

// The three ways a strength session can be better than the last one. They're separate metrics
// rather than one combined score because they answer different questions — "am I lifting heavier",
// "am I stronger", "am I doing more work" — and a session often moves one without the others.
//
// One at a time, never two curves on one chart: kilos and total volume are different scales, and
// putting them on a shared axis (or worse, two axes) makes the shape of both meaningless.
const METRICS = [
  { key: 'best_est_1rm', unit: 'kg', decimals: 1 },
  { key: 'top_weight', unit: 'kg', decimals: 1 },
  { key: 'volume', unit: 'kg', decimals: 0 },
];

function formatValue(value, metric, lang) {
  if (value == null) return '—';
  const n = Number(value).toFixed(metric.decimals);
  return `${lang === 'en' ? n : n.replace('.', ',')} ${metric.unit}`;
}

function formatDate(dateStr, lang) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${dateStr}T00:00:00Z`));
}

// Same shape as the weight report's chart, for the same reason it's shaped that way: a phone-width
// trend line is read for its direction, not for exact values, so it carries no axes — the current
// value is direct-labelled at the last point and the span is stated underneath. One series, so no
// legend: the metric picker above the chart names what's plotted.
function ProgressionChart({ points, metric, lang }) {
  const { t } = useLanguage();
  if (points.length < 2) {
    return <p className="hint" style={{ padding: '18px 0' }}>{t('strength.needTwoSessions')}</p>;
  }

  const width = 320;
  const height = 120;
  const bottom = height - 18;
  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = span * 0.15;
  const toY = (v) => bottom - ((v - min + pad) / (span + pad * 2)) * (bottom - 10);
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => [i * stepX, toY(p.value)]);
  const line = coords.map(([x, y]) => `${x} ${y}`).join(' L ');
  const area = `M ${coords[0][0]} ${coords[0][1]} L ${line} L ${coords[coords.length - 1][0]} ${height} L ${coords[0][0]} ${height} Z`;
  const last = coords[coords.length - 1];

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: `${height}px`, display: 'block', overflow: 'visible' }}
        role="img"
        aria-label={`${t(`strength.metric.${metric.key}`)} — ${points.map((p) => `${formatDate(p.date, lang)}: ${formatValue(p.value, metric, lang)}`).join(', ')}`}
      >
        <defs>
          <linearGradient id="strengthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(139,118,249,0.35)" />
            <stop offset="100%" stopColor="rgba(139,118,249,0)" />
          </linearGradient>
          <linearGradient id="strengthLine" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c9bcff" />
            <stop offset="55%" stopColor="#a893ff" />
            <stop offset="100%" stopColor="#7c5cfc" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#strengthGrad)" />
        <path
          d={`M ${coords[0][0]} ${coords[0][1]} L ${line}`}
          fill="none"
          stroke="url(#strengthLine)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last[0]} cy={last[1]} r="4.5" fill="var(--purple-500, #7c5cfc)" />
      </svg>
      <div className="strength-chart-scale">
        <span>{formatDate(points[0].date, lang)}</span>
        <span>{formatDate(points[points.length - 1].date, lang)}</span>
      </div>
    </div>
  );
}

// Opened over whatever screen asked for it (the workout page, or the exercise being performed)
// rather than being a route of its own: it's a reference you consult and dismiss, and from
// mid-session it must not cost you your place in the workout.
export default function ExerciseHistory({ exerciseName, onClose }) {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [metricKey, setMetricKey] = useState(METRICS[0].key);
  const metric = METRICS.find((m) => m.key === metricKey);

  useEffect(() => {
    let cancelled = false;
    api
      .getExerciseHistory(exerciseName, { limit: 20 })
      .then((history) => {
        if (!cancelled) setData(history);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [exerciseName]);

  // Oldest first: a progression reads left to right.
  const sessions = data ? [...data.sessions].reverse() : [];
  const points = sessions
    .map((s) => ({ date: s.date, value: s[metricKey] }))
    .filter((p) => p.value != null && p.value > 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="meal-detail-header" style={{ marginBottom: 4 }}>
          <button type="button" className="meal-detail-back-btn" onClick={onClose} aria-label={t('meal.close')}>
            <Icon name="x" size={20} />
          </button>
          <div className="meal-detail-heading">
            <div className="day-nav-subtitle">{t('strength.historyTitle')}</div>
            <div className="meal-detail-title" style={{ fontSize: 21 }}>{exerciseName}</div>
          </div>
        </div>

        {failed && <p className="hint">{t('strength.historyFailed')}</p>}
        {!failed && !data && <p className="hint">{t('weight.loading')}</p>}

        {data && data.sessions.length === 0 && (
          <p className="hint" style={{ marginTop: 12 }}>{t('strength.noHistory')}</p>
        )}

        {data && data.sessions.length > 0 && (
          <>
            <div className="tile-grid tile-grid-compact" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 8 }}>
              <div className="tile">
                <b>{formatValue(data.records.top_weight, METRICS[1], lang)}</b>
                <span>{t('strength.record.top_weight')}</span>
              </div>
              <div className="tile">
                <b>{formatValue(data.records.best_est_1rm, METRICS[0], lang)}</b>
                <span>{t('strength.record.best_est_1rm')}</span>
              </div>
              <div className="tile">
                <b>{formatValue(data.records.best_volume, METRICS[2], lang)}</b>
                <span>{t('strength.record.best_volume')}</span>
              </div>
            </div>

            <div className="filter-pill-row">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={m.key === metricKey ? 'filter-pill active' : 'filter-pill'}
                  onClick={() => setMetricKey(m.key)}
                >
                  {t(`strength.metric.${m.key}`)}
                </button>
              ))}
            </div>

            <ProgressionChart points={points} metric={metric} lang={lang} />

            {/* The chart carries the shape; this carries the detail, and is also the fallback for
                anyone who can't read the chart at all. */}
            <h4 className="section-label">{t('strength.sessions')}</h4>
            <div className="entry-list">
              {data.sessions.map((s) => (
                <div className="entry-card" key={s.activity_log_id}>
                  <div className="entry-card-body" style={{ cursor: 'default' }}>
                    <div className="entry-card-name">
                      {formatDate(s.date, lang)}
                      {data.records.best_est_1rm != null && s.best_est_1rm === data.records.best_est_1rm && (
                        <span className="strength-record-tag">
                          <Icon name="trophy" size={11} /> {t('strength.recordShort')}
                        </span>
                      )}
                    </div>
                    <div className="entry-card-sub">
                      {s.sets.map((set) => `${set.weight_kg ?? 0} kg × ${set.reps}`).join(' · ')}
                    </div>
                  </div>
                  <span className="activites-row-kcal">{formatValue(s[metricKey], metric, lang)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
