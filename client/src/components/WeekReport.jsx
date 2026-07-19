import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import ImprovementInsights from './ImprovementInsights';
import SourceList from './SourceList';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

const STATUS_COLOR = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
};

export default function WeekReport({ period }) {
  const { t } = useLanguage();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setReport(await api.getWeekReport(period));
    setLoading(false);
  }, [period]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) return <p className="hint">{t('week.computing')}</p>;
  if (!report) return null;

  const periodLabel = period === 'month' ? t('week.periodThisMonth') : period === 'quarter' ? t('week.periodThisQuarter') : t('week.periodThisWeek');
  const periodWord = period === 'month' ? t('week.periodTheMonth') : period === 'quarter' ? t('week.periodTheQuarter') : t('week.periodTheWeek');
  const periodWeeksWord = period === 'quarter' ? t('week.periodQuarterWeeks') : t('week.periodMonthWeeks');

  if (report.insufficientData) {
    return (
      <div className="card">
        <p className="hint">{t('week.noDataFor').replace('{period}', periodLabel)}</p>
      </div>
    );
  }

  const { daysInRange, daysLogged, lowCoverageWarning, dailyAverageMicros, limitAverages, weeklyObjectives, microbiote, insights, microSources } =
    report;

  function toggle(key) {
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  return (
    <div>
      <p className="hint">
        {t('week.daysLogged').replace('{logged}', daysLogged).replace('{total}', daysInRange)}
      </p>
      {lowCoverageWarning && <p className="hint error">{lowCoverageWarning}</p>}

      <h2>{t('week.limitsAvgTitle')}</h2>
      <div className="report-card">
        {limitAverages.map((l) => {
          const sources = microSources[l.key];
          const canExpand = Boolean(sources && sources.length > 0);
          const expanded = expandedKey === l.key;
          const status = l.over ? 'danger' : l.pct >= 90 ? 'warning' : 'success';
          return (
            <div className="report-row" key={l.key}>
              <div className="report-row-top">
                <span className={canExpand ? 'report-row-label clickable' : 'report-row-label'} onClick={canExpand ? () => toggle(l.key) : undefined}>
                  {l.label}
                  {canExpand && <Icon name="chevron-right" size={14} color="var(--text-muted)" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />}
                </span>
                <span className={`report-row-value status-${status}`}>
                  {l.over
                    ? t('week.exceededAvg').replace('{diff}', (l.consumed - l.reference).toFixed(0)).replace('{unit}', l.unit)
                    : t('week.pctOfLimitAvg').replace('{pct}', Math.round(l.pct))}
                </span>
              </div>
              <div className="report-row-bar">
                <div className="report-row-bar-fill" style={{ width: `${Math.min(100, l.pct)}%`, background: STATUS_COLOR[status] }} />
              </div>
              <div className="report-row-sub">
                {l.consumed.toFixed(0)} / {l.reference.toFixed(0)} {l.unit} {t('week.perDay')}
              </div>
              {expanded && <SourceList sources={sources} unit={l.unit} />}
            </div>
          );
        })}
      </div>

      <h2>{t('week.dailyGoalsAvgTitle')}</h2>
      <p className="hint" style={{ marginTop: -8 }}>
        {t('week.sameAsTodayHint').replace('{period}', periodWord)}
      </p>
      <div className="report-card">
        {dailyAverageMicros.map((m) => {
          const sources = microSources[m.key];
          const canExpand = Boolean(sources && sources.length > 0);
          const expanded = expandedKey === m.key;
          const status = m.pct >= 100 ? 'success' : m.pct >= 70 ? 'warning' : 'danger';
          return (
            <div className="report-row" key={m.key}>
              <div className="report-row-top">
                <span className={canExpand ? 'report-row-label clickable' : 'report-row-label'} onClick={canExpand ? () => toggle(m.key) : undefined}>
                  {m.label}
                  {canExpand && <Icon name="chevron-right" size={14} color="var(--text-muted)" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />}
                </span>
                <span className={`report-row-value status-${status}`}>{Math.round(m.pct)}%</span>
              </div>
              <div className="report-row-bar">
                <div className="report-row-bar-fill" style={{ width: `${Math.min(100, m.pct)}%`, background: STATUS_COLOR[status] }} />
              </div>
              <div className="report-row-sub">
                {m.consumed.toFixed(1)} / {m.target.toFixed(0)} {m.unit}
              </div>
              {expanded && <SourceList sources={sources} unit={m.unit} />}
            </div>
          );
        })}
      </div>

      <h2>{t('week.weeklyGoalsTitle')}{period !== 'current' && period !== 'past' ? t('week.avgOfWeeks').replace('{weeks}', periodWeeksWord) : ''}</h2>
      <p className="hint" style={{ marginTop: -8 }}>
        {t('week.storedNutrientsHint')}
        {period !== 'current' && period !== 'past' ? t('week.judgedSeparately').replace('{period}', period === 'quarter' ? t('week.ofTheQuarter') : t('week.ofTheMonth')) : ''}
      </p>
      <div className="report-card">
        {weeklyObjectives.map((o) => {
          const sources = microSources[o.key];
          const canExpand = Boolean(sources && sources.length > 0);
          const expanded = expandedKey === o.key;
          const status = o.met ? 'success' : o.pct >= 70 ? 'warning' : 'danger';
          return (
            <div className="report-row" key={o.key}>
              <div className="report-row-top">
                <span className={canExpand ? 'report-row-label clickable' : 'report-row-label'} onClick={canExpand ? () => toggle(o.key) : undefined}>
                  {o.label}
                  {canExpand && <Icon name="chevron-right" size={14} color="var(--text-muted)" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />}
                </span>
                <span className={`report-row-value status-${status}`}>
                  {o.met && <Icon name="check" size={13} />}
                  {o.met ? t('week.goalMetAvg').replace('{period}', periodLabel) : `${Math.round(o.pct)}%`}
                </span>
              </div>
              <div className="report-row-bar">
                <div className="report-row-bar-fill" style={{ width: `${Math.min(100, o.pct)}%`, background: STATUS_COLOR[status] }} />
              </div>
              <div className="report-row-sub">
                {o.consumed.toFixed(0)} / {o.target.toFixed(0)} {o.unit}
              </div>
              {expanded && <SourceList sources={sources} unit={o.unit} />}
            </div>
          );
        })}
      </div>

      <h2>{t('week.microbiote')}</h2>
      <div className="report-card">
        <div className="report-row">
          <div className="report-row-top">
            <span className="report-row-label">{t('week.differentPlants')}</span>
            <span
              className={`report-row-value status-${
                microbiote.plantCount >= microbiote.plantTarget ? 'success' : microbiote.plantCount / microbiote.plantTarget >= 0.7 ? 'warning' : 'danger'
              }`}
            >
              {microbiote.plantCount} / {microbiote.plantTarget} plantes
            </span>
          </div>
          <div className="report-row-bar">
            <div
              className="report-row-bar-fill"
              style={{
                width: `${Math.min(100, (microbiote.plantCount / microbiote.plantTarget) * 100)}%`,
                background:
                  microbiote.plantCount >= microbiote.plantTarget
                    ? STATUS_COLOR.success
                    : microbiote.plantCount / microbiote.plantTarget >= 0.7
                    ? STATUS_COLOR.warning
                    : STATUS_COLOR.danger,
              }}
            />
          </div>
          <div className="report-row-sub">
            {period !== 'current' && period !== 'past' ? t('week.avgPerWeek').replace('{period}', periodLabel) : t('week.thisWeek')}
          </div>
          {microbiote.plantList.length > 0 && (
            <p className="hint" style={{ marginTop: 8 }}>
              {t('week.alreadyEaten')} : {microbiote.plantList.join(', ')}
            </p>
          )}
          {microbiote.plantSuggestions.length > 0 && (
            <p className="hint micro-reco-line">
              👉 {t('week.toProgress')} : {microbiote.plantSuggestions.join(', ')}.
            </p>
          )}
        </div>

        <div className="report-row">
          <div className="report-row-top" style={{ marginBottom: 0 }}>
            <span
              className={microbiote.fermentedFoods.length > 0 ? 'report-row-label clickable' : 'report-row-label'}
              onClick={microbiote.fermentedFoods.length > 0 ? () => toggle('fermented') : undefined}
            >
              {t('week.fermentedFoods')}
              {microbiote.fermentedFoods.length > 0 && (
                <Icon name="chevron-right" size={14} color="var(--text-muted)" style={{ transform: expandedKey === 'fermented' ? 'rotate(90deg)' : 'none' }} />
              )}
            </span>
            <span className="report-row-value">
              {microbiote.fermentedAvgPerDay.toFixed(1)} {t('week.perDayShort')}
            </span>
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
          {microbiote.prebioticSources.length > 0 && (
            <p className="hint" style={{ marginTop: 8 }}>
              {t('week.prebioticsEaten')} : {microbiote.prebioticSources.join(', ')}
            </p>
          )}
          {microbiote.polyphenolSources.length > 0 && (
            <p className="hint" style={{ marginTop: 4 }}>
              {t('week.polyphenolSources')} : {microbiote.polyphenolSources.join(', ')}
            </p>
          )}
        </div>
      </div>

      {period !== 'current' && (
        <>
          <h2>{t('week.improvements')}</h2>
          <ImprovementInsights insights={insights} />
        </>
      )}
    </div>
  );
}
