import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';
import { todayStr, formatDateSubtitle } from '../data/dates';

// La courbe des mesures. Volontairement sans axes : sur quatre à dix points espacés de semaines,
// ce qui se lit est la direction, pas une valeur précise — celles-ci sont juste en dessous.
function Vo2maxChart({ logs, goal }) {
  if (!logs || logs.length < 2) return null;
  const width = 320;
  const height = 120;
  const values = logs.map((l) => l.value);
  const max = Math.max(...values, goal || 0);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = span * 0.2;
  const toY = (v) => height - 18 - ((v - min + pad) / (span + pad * 2)) * (height - 30);
  const stepX = width / (logs.length - 1);
  const points = logs.map((l, i) => [i * stepX, toY(l.value)]);
  const line = points.map(([x, y]) => `${x} ${y}`).join(' L ');
  const last = points[points.length - 1];
  const goalY = goal ? toY(goal) : null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id="vo2Line" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a6f4ff" />
          <stop offset="100%" stopColor="#12d8ff" />
        </linearGradient>
      </defs>
      {/* L'objectif en pointillé : la courbe se lit par rapport à lui, pas dans l'absolu. */}
      {goalY != null && goalY > 0 && (
        <line x1="0" y1={goalY} x2={width} y2={goalY} stroke="var(--magenta-500)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.7" />
      )}
      <path d={`M ${points[0][0]} ${points[0][1]} L ${line}`} fill="none" stroke="url(#vo2Line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="5" fill="var(--accent)" />
    </svg>
  );
}

/**
 * Le suivi de la VO2max : une valeur recopiée de temps en temps depuis Apple Santé, située par
 * rapport aux normes d'âge et de sexe, avec l'objectif du palier suivant.
 *
 * La saisie est manuelle parce qu'une PWA ne lit pas HealthKit — et pour un chiffre qui bouge sur
 * des mois, la recopier une fois par mois suffit largement.
 */
export default function Vo2maxScreen() {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await api.getVo2max());
      setError('');
    } catch (e) {
      setError(e.message || String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAdd(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.addVo2max(todayStr(), Number(String(value).replace(',', '.')));
      setValue('');
      await refresh();
      setError('');
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    await api.deleteVo2max(id);
    await refresh();
  }

  if (!data) return <p className="hint">{t('week.computing')}</p>;

  const { logs, latest, band, category, goal, trend } = data;
  const reversed = [...logs].reverse();

  return (
    <div>
      <div className="card vo2max-hero">
        <div className="vo2max-value">
          {latest ? latest.value.toFixed(1) : '—'}
          <span>ml/kg/min</span>
        </div>
        {category && <span className={`vo2max-category ${category}`}>{t(`vo2max.category_${category}`)}</span>}
        {trend && (
          <div className="vo2max-trend">
            <Icon name={trend.delta >= 0 ? 'trending-up' : 'trending-down'} size={16} color={trend.delta >= 0 ? 'var(--success)' : 'var(--danger)'} />
            {trend.delta >= 0 ? '+' : ''}
            {trend.delta} {t('vo2max.over').replace('{days}', trend.days)}
          </div>
        )}
      </div>

      {logs.length >= 2 && (
        <div className="card">
          <Vo2maxChart logs={logs} goal={goal} />
          <div className="vo2max-chart-legend">
            <span>
              <i style={{ background: 'var(--accent)' }} /> {t('vo2max.measures')}
            </span>
            {goal && (
              <span>
                <i style={{ background: 'var(--magenta-500)' }} /> {t('vo2max.goal')} {goal}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="section-header">
        <span className="section-title">{t('vo2max.addTitle')}</span>
      </div>
      <form className="search-input-row" onSubmit={handleAdd}>
        <Icon name="heart-pulse" size={18} color="var(--text-muted)" />
        <input
          className="search-input"
          inputMode="decimal"
          value={value}
          placeholder={t('vo2max.placeholder')}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="btn btn-small" disabled={saving || !value}>
          {t('vo2max.save')}
        </button>
      </form>
      <p className="hint">{t('vo2max.fromHealth')}</p>
      {error && <p className="hint error">{error}</p>}

      {/* Sans sexe ni date de naissance, aucun classement n'est possible : les seuils n'ont de sens
          que rapportés à une population. On le dit plutôt que d'inventer un verdict. */}
      {!band && (
        <p className="hint">{t('vo2max.needProfile')}</p>
      )}

      {band && (
        <>
          <div className="section-header">
            <span className="section-title">{t('vo2max.goalTitle')}</span>
          </div>
          <div className="card">
            <div className="row">
              <span className="row-icon-box weight-icon-box">
                <Icon name="target" size={20} />
              </span>
              <div className="name">
                {t('vo2max.goalValue').replace('{value}', goal)}
                <div className="hint" style={{ padding: 0 }}>
                  {category === 'excellent' ? t('vo2max.goalHoldHint') : t('vo2max.goalHint')}
                </div>
              </div>
            </div>
            <div className="vo2max-scale">
              {['poor', 'fair', 'average', 'good', 'excellent'].map((c) => (
                <span key={c} className={c === category ? `vo2max-scale-step ${c} active` : `vo2max-scale-step ${c}`}>
                  {t(`vo2max.category_${c}`)}
                </span>
              ))}
            </div>
            <p className="hint" style={{ paddingTop: 8 }}>{t('vo2max.norms')}</p>
          </div>
        </>
      )}

      {logs.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">{t('vo2max.history')}</span>
            <span className="section-hint">{logs.length}</span>
          </div>
          <div className="entry-list">
            {reversed.map((log) => (
              <div className="entry-card" key={log.id}>
                <div className="entry-card-body">
                  <div className="entry-card-name">{log.value.toFixed(1)}</div>
                  <div className="entry-card-sub">{formatDateSubtitle(log.date, lang)}</div>
                </div>
                <button
                  type="button"
                  className="entry-icon-btn entry-delete-btn"
                  onClick={() => handleDelete(log.id)}
                  aria-label={t('supplements.delete')}
                >
                  <Icon name="trash-2" size={16} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
