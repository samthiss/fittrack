import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import SourceList from './SourceList';
import { useLanguage } from '../i18n/LanguageContext';

function GoalRow({ g, sources, expanded, onToggle, t }) {
  const pct = g.target > 0 ? Math.min(100, Math.max(0, (g.consumed / g.target) * 100)) : 0;
  // Floor nutrient (fiber, potassium...): the target is a minimum to reach, not a ceiling —
  // consuming more than the target is a good thing, so it's shown as met (green), never as "over".
  const goalMet = g.remaining <= 0;
  const canExpand = Boolean(sources && sources.length > 0);
  return (
    <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
      <div className={canExpand ? 'name clickable' : 'name'} onClick={canExpand ? onToggle : undefined}>
        <span>
          {g.label}
          {canExpand && <span className="micro-source-toggle">{expanded ? ' ▾' : ' ▸'}</span>}
        </span>
        <span className="rate" style={goalMet ? { color: 'var(--ok-green)' } : undefined}>
          {goalMet ? t('today.goalMet') : `${g.remaining.toFixed(0)} ${g.unit} ${t('today.remaining')}`}
        </span>
      </div>
      <div className="progress-track">
        <div className={goalMet ? 'progress-fill fill-ok' : 'progress-fill'} style={{ width: `${pct}%` }} />
      </div>
      <span className="hint" style={{ margin: 0 }}>
        {g.consumed.toFixed(0)} / {g.target.toFixed(0)} {g.unit}
      </span>
      {expanded && <SourceList sources={sources} unit={g.unit} />}
    </div>
  );
}

function LimitRow({ l, sources, expanded, onToggle, t }) {
  const pct = l.reference > 0 ? Math.min(100, Math.max(0, (l.consumed / l.reference) * 100)) : 0;
  const over = l.remaining < 0;
  const canExpand = Boolean(sources && sources.length > 0);
  return (
    <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
      <div className={canExpand ? 'name clickable' : 'name'} onClick={canExpand ? onToggle : undefined}>
        <span>
          {l.label}
          {canExpand && <span className="micro-source-toggle">{expanded ? ' ▾' : ' ▸'}</span>}
        </span>
        <span className="rate" style={over ? { color: 'var(--danger)' } : undefined}>
          {over
            ? `+${Math.abs(l.remaining).toFixed(0)} ${l.unit} ${t('today.above')}`
            : t('today.remainingBeforeLimit').replace('{remaining}', l.remaining.toFixed(0)).replace('{unit}', l.unit)}
        </span>
      </div>
      <div className="progress-track">
        <div className={over ? 'progress-fill fill-low' : 'progress-fill'} style={{ width: `${pct}%` }} />
      </div>
      <span className="hint" style={{ margin: 0 }}>
        {l.consumed.toFixed(0)} / {l.reference.toFixed(0)} {l.unit}
      </span>
      {expanded && <SourceList sources={sources} unit={l.unit} />}
    </div>
  );
}

function NoGoalRow({ m, sources, expanded, onToggle }) {
  const canExpand = Boolean(sources && sources.length > 0);
  return (
    <div className="row" style={{ flexDirection: canExpand ? 'column' : 'row', alignItems: 'stretch', gap: 4 }}>
      <div className={canExpand ? 'name clickable' : 'name'} onClick={canExpand ? onToggle : undefined}>
        <span>
          {m.label}
          {canExpand && <span className="micro-source-toggle">{expanded ? ' ▾' : ' ▸'}</span>}
        </span>
        {!canExpand && (
          <b>
            {m.consumed.toFixed(1)} {m.unit}
          </b>
        )}
      </div>
      {canExpand && (
        <span className="hint" style={{ margin: 0 }}>
          {m.consumed.toFixed(1)} {m.unit}
        </span>
      )}
      {expanded && <SourceList sources={sources} unit={m.unit} />}
    </div>
  );
}

export default function TodayReport({ date } = {}) {
  const { t } = useLanguage();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setReport(await api.getTodayReport(date));
    setLoading(false);
  }, [date]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading || !report) return <p className="hint">{t('today.computing')}</p>;

  const { limits, dailyGoals, noGoalMicros, microbiote, microSources } = report;

  function toggle(key) {
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  return (
    <div>
      {/* 1. Seuils à ne pas dépasser */}
      <h2>{t('today.limitsTitle')}</h2>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {limits.map((l) => (
          <LimitRow
            key={l.key}
            l={l}
            sources={microSources[l.key]}
            expanded={expandedKey === l.key}
            onToggle={() => toggle(l.key)}
            t={t}
          />
        ))}
      </div>

      {/* 2. Objectifs du jour */}
      <h2>{t('today.goalsTitle')}</h2>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {dailyGoals.map((g) => (
          <GoalRow
            key={g.key}
            g={g}
            sources={microSources[g.key]}
            expanded={expandedKey === g.key}
            onToggle={() => toggle(g.key)}
            t={t}
          />
        ))}
      </div>

      {/* 3. Autres nutriments — pas d'objectif journalier */}
      <h2>{t('today.otherNutrients')}</h2>
      <p className="hint" style={{ marginTop: -8 }}>{t('today.weeklyGoalHint')}</p>
      <div className="card">
        {noGoalMicros.map((m) => (
          <NoGoalRow
            key={m.key}
            m={m}
            sources={microSources[m.key]}
            expanded={expandedKey === m.key}
            onToggle={() => toggle(m.key)}
          />
        ))}
      </div>

      {/* 4. Microbiote */}
      <h2>{t('today.microbiote')}</h2>
      <div className="card">
        <div
          className={microbiote.fermentedFoods.length > 0 ? 'row clickable' : 'row'}
          onClick={microbiote.fermentedFoods.length > 0 ? () => toggle('fermented') : undefined}
        >
          <div className="name">
            <span>
              {t('today.fermentedToday')}
              {microbiote.fermentedFoods.length > 0 && (
                <span className="micro-source-toggle">{expandedKey === 'fermented' ? ' ▾' : ' ▸'}</span>
              )}
            </span>
            <span className="rate">{t('today.fermentedTarget')}</span>
          </div>
          <b>{microbiote.fermentedToday}</b>
        </div>
        {expandedKey === 'fermented' && (
          <div className="micro-source-list">
            {microbiote.fermentedFoods.map((label, i) => (
              <div className="micro-source-row" key={i}>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="row">
          <div className="name">
            <span>{t('today.plantDiversity')}</span>
          </div>
          <b>
            {microbiote.plantCount} / {microbiote.plantTarget}
          </b>
        </div>
        {microbiote.plantSuggestionToday && (
          <p className="hint micro-reco-line" style={{ marginTop: 10 }}>
            👉 {t('today.notEatenYet')} : {microbiote.plantSuggestionToday}.
          </p>
        )}
      </div>
    </div>
  );
}
