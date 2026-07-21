import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import SourceList from './SourceList';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

const STATUS_COLOR = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
};

function GoalRow({ g, sources, expanded, onToggle, t }) {
  const pct = g.target > 0 ? Math.min(100, Math.max(0, (g.consumed / g.target) * 100)) : 0;
  // Floor nutrient (fiber, potassium...): the target is a minimum to reach, not a ceiling —
  // consuming more than the target is a good thing, so it's shown as met (green), never as "over".
  const goalMet = g.remaining <= 0;
  const status = goalMet ? 'success' : pct >= 70 ? 'warning' : 'danger';
  const canExpand = Boolean(sources && sources.length > 0);
  return (
    <div className="report-row">
      <div className="report-row-top">
        <span className={canExpand ? 'report-row-label clickable' : 'report-row-label'} onClick={canExpand ? onToggle : undefined}>
          {g.label}
          {canExpand && <Icon name="chevron-right" size={14} color="var(--text-muted)" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />}
        </span>
        <span className={`report-row-value status-${status}`}>
          {goalMet ? t('today.goalMet') : `${g.remaining.toFixed(0)} ${g.unit} ${t('today.remaining')}`}
        </span>
      </div>
      <div className="report-row-bar">
        <div className="report-row-bar-fill" style={{ width: `${pct}%`, background: STATUS_COLOR[status] }} />
      </div>
      <div className="report-row-sub">
        {g.consumed.toFixed(0)} / {g.target.toFixed(0)} {g.unit}
      </div>
      {expanded && <SourceList sources={sources} unit={g.unit} />}
    </div>
  );
}

function LimitRow({ l, sources, expanded, onToggle, t }) {
  const pct = l.reference > 0 ? Math.min(100, Math.max(0, (l.consumed / l.reference) * 100)) : 0;
  const over = l.remaining < 0;
  const status = over ? 'danger' : pct >= 90 ? 'warning' : 'success';
  const canExpand = Boolean(sources && sources.length > 0);
  return (
    <div className="report-row">
      <div className="report-row-top">
        <span className={canExpand ? 'report-row-label clickable' : 'report-row-label'} onClick={canExpand ? onToggle : undefined}>
          {l.label}
          {canExpand && <Icon name="chevron-right" size={14} color="var(--text-muted)" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />}
        </span>
        <span className={`report-row-value status-${status}`}>
          {over
            ? `+${Math.abs(l.remaining).toFixed(0)} ${l.unit} ${t('today.above')}`
            : t('today.remainingBeforeLimit').replace('{remaining}', l.remaining.toFixed(0)).replace('{unit}', l.unit)}
        </span>
      </div>
      <div className="report-row-bar">
        <div className="report-row-bar-fill" style={{ width: `${pct}%`, background: STATUS_COLOR[status] }} />
      </div>
      <div className="report-row-sub">
        {l.consumed.toFixed(0)} / {l.reference.toFixed(0)} {l.unit}
      </div>
      {expanded && <SourceList sources={sources} unit={l.unit} />}
    </div>
  );
}

function NoGoalRow({ m, sources, expanded, onToggle }) {
  const canExpand = Boolean(sources && sources.length > 0);
  return (
    <div className="report-row">
      <div className="report-row-top" style={{ marginBottom: canExpand ? 6 : 0 }}>
        <span className={canExpand ? 'report-row-label clickable' : 'report-row-label'} onClick={canExpand ? onToggle : undefined}>
          {m.label}
          {canExpand && <Icon name="chevron-right" size={14} color="var(--text-muted)" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />}
        </span>
        <span className="report-row-value">
          {m.consumed.toFixed(1)} {m.unit}
        </span>
      </div>
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

  const { limits, dailyGoals, noGoalMicros, microbiote, microSources, kcal } = report;

  function toggle(key) {
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  return (
    <div>
      {kcal && (
        <>
          <div className="report-stat-row" style={{ marginTop: 18 }}>
            <div className="report-stat-tile">
              <div className="report-stat-tile-label">
                <Icon name={kcal.deficit >= 0 ? 'trending-down' : 'trending-up'} size={16} color="var(--success)" />
                {t('today.deficit')}
              </div>
              <div className="report-stat-tile-value">
                {kcal.deficit >= 0 ? '−' : '+'}
                {Math.round(Math.abs(kcal.deficit))} <span>kcal</span>
              </div>
            </div>
            <div className="report-stat-tile">
              <div className="report-stat-tile-label">
                <Icon name="flame" size={16} color="var(--warning)" />
                {t('today.totalBurned')}
              </div>
              <div className="report-stat-tile-value">
                {Math.round(kcal.totalBurned)} <span>kcal</span>
              </div>
            </div>
          </div>

          <div className="report-stat-row">
            <div className="report-stat-tile">
              <div className="report-stat-tile-label">
                <Icon name="dumbbell" size={16} color="var(--acc)" />
                {t('today.burnedActivities')}
              </div>
              <div className="report-stat-tile-value">
                {Math.round(kcal.activitiesKcal)} <span>kcal</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 1. Seuils à ne pas dépasser */}
      <h2>{t('today.limitsTitle')}</h2>
      <div className="report-card">
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
      <div className="report-card">
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
      <div className="report-card">
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
      <div className="report-card">
        <div className="report-row">
          <div className="report-row-top" style={{ marginBottom: 0 }}>
            <span
              className={microbiote.fermentedFoods.length > 0 ? 'report-row-label clickable' : 'report-row-label'}
              onClick={microbiote.fermentedFoods.length > 0 ? () => toggle('fermented') : undefined}
            >
              {t('today.fermentedToday')}
              {microbiote.fermentedFoods.length > 0 && (
                <Icon name="chevron-right" size={14} color="var(--text-muted)" style={{ transform: expandedKey === 'fermented' ? 'rotate(90deg)' : 'none' }} />
              )}
            </span>
            <span className={microbiote.fermentedToday >= 1 ? 'report-row-value status-success' : 'report-row-value'}>
              {microbiote.fermentedToday >= 1 && <Icon name="check" size={13} />}
              {microbiote.fermentedToday}
            </span>
          </div>
          <div className="report-row-sub" style={{ marginTop: 2 }}>{t('today.fermentedTarget')}</div>
          {expandedKey === 'fermented' && (
            <div className="micro-source-list">
              {microbiote.fermentedFoods.map((label, i) => (
                <div className="micro-source-row" key={i}>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="report-row">
          <div className="report-row-top" style={{ marginBottom: 0 }}>
            <span className="report-row-label">{t('today.plantDiversity')}</span>
            <span className="report-row-value">
              {microbiote.plantCount} / {microbiote.plantTarget}
            </span>
          </div>
          {microbiote.plantSuggestionToday && (
            <p className="hint micro-reco-line" style={{ marginTop: 7 }}>
              👉 {t('today.notEatenYet')} : {microbiote.plantSuggestionToday}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
