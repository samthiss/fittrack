import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import ImprovementInsights from './ImprovementInsights';
import SourceList from './SourceList';
import { useLanguage } from '../i18n/LanguageContext';

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
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {limitAverages.map((l) => {
          const sources = microSources[l.key];
          const canExpand = Boolean(sources && sources.length > 0);
          const expanded = expandedKey === l.key;
          return (
            <div className="row" key={l.key} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
              <div className={canExpand ? 'name clickable' : 'name'} onClick={canExpand ? () => toggle(l.key) : undefined}>
                <span>
                  {l.label}
                  {canExpand && <span className="micro-source-toggle">{expanded ? ' ▾' : ' ▸'}</span>}
                </span>
                <span className="rate" style={l.over ? { color: 'var(--danger)' } : undefined}>
                  {l.over
                    ? t('week.exceededAvg').replace('{diff}', (l.consumed - l.reference).toFixed(0)).replace('{unit}', l.unit)
                    : t('week.pctOfLimitAvg').replace('{pct}', Math.round(l.pct))}
                </span>
              </div>
              <div className="progress-track">
                <div className={l.over ? 'progress-fill fill-low' : 'progress-fill'} style={{ width: `${Math.min(100, l.pct)}%` }} />
              </div>
              <span className="hint" style={{ margin: 0 }}>
                {l.consumed.toFixed(0)} / {l.reference.toFixed(0)} {l.unit} {t('week.perDay')}
              </span>
              {expanded && <SourceList sources={sources} unit={l.unit} />}
            </div>
          );
        })}
      </div>

      <h2>{t('week.dailyGoalsAvgTitle')}</h2>
      <p className="hint" style={{ marginTop: -8 }}>
        {t('week.sameAsTodayHint').replace('{period}', periodWord)}
      </p>
      <div className="card">
        {dailyAverageMicros.map((m) => {
          const sources = microSources[m.key];
          const canExpand = Boolean(sources && sources.length > 0);
          const expanded = expandedKey === m.key;
          return (
            <div className="row" key={m.key} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
              <div className={canExpand ? 'name clickable' : 'name'} onClick={canExpand ? () => toggle(m.key) : undefined}>
                <span>
                  {m.label}
                  {canExpand && <span className="micro-source-toggle">{expanded ? ' ▾' : ' ▸'}</span>}
                </span>
                <span className="rate">{Math.round(m.pct)}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.min(100, m.pct)}%` }} />
              </div>
              <span className="hint" style={{ margin: 0 }}>
                {m.consumed.toFixed(1)} / {m.target.toFixed(0)} {m.unit}
              </span>
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
      <div className="card">
        {weeklyObjectives.map((o) => {
          const sources = microSources[o.key];
          const canExpand = Boolean(sources && sources.length > 0);
          const expanded = expandedKey === o.key;
          return (
            <div className="row" key={o.key} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
              <div className={canExpand ? 'name clickable' : 'name'} onClick={canExpand ? () => toggle(o.key) : undefined}>
                <span>
                  {o.label}
                  {canExpand && <span className="micro-source-toggle">{expanded ? ' ▾' : ' ▸'}</span>}
                </span>
                <span className="rate" style={o.met ? { color: 'var(--ok-green)' } : undefined}>
                  {o.met
                    ? t('week.goalMetAvg').replace('{period}', periodLabel)
                    : `${Math.round(o.pct)}%`}
                </span>
              </div>
              <div className="progress-track">
                <div
                  className={o.met ? 'progress-fill fill-ok' : 'progress-fill'}
                  style={{ width: `${Math.min(100, o.pct)}%` }}
                />
              </div>
              <span className="hint" style={{ margin: 0 }}>
                {o.consumed.toFixed(0)} / {o.target.toFixed(0)} {o.unit}
              </span>
              {expanded && <SourceList sources={sources} unit={o.unit} />}
            </div>
          );
        })}
      </div>

      <h2>{t('week.microbiote')}</h2>
      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>
            {microbiote.plantCount} / {microbiote.plantTarget}
          </div>
          <p className="hint" style={{ margin: 0 }}>
            {t('week.differentPlants')} {period !== 'current' && period !== 'past' ? t('week.avgPerWeek').replace('{period}', periodLabel) : t('week.thisWeek')}
          </p>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(100, (microbiote.plantCount / microbiote.plantTarget) * 100)}%` }}
          />
        </div>

        {microbiote.plantList.length > 0 && (
          <p className="hint" style={{ marginTop: 10 }}>
            {t('week.alreadyEaten')} : {microbiote.plantList.join(', ')}
          </p>
        )}
        {microbiote.plantSuggestions.length > 0 && (
          <p className="hint micro-reco-line">
            👉 {t('week.toProgress')} : {microbiote.plantSuggestions.join(', ')}.
          </p>
        )}

        <div
          className={microbiote.fermentedFoods.length > 0 ? 'row clickable' : 'row'}
          style={{ marginTop: 10 }}
          onClick={microbiote.fermentedFoods.length > 0 ? () => toggle('fermented') : undefined}
        >
          <div className="name">
            <span>
              {t('week.fermentedFoods')}
              {microbiote.fermentedFoods.length > 0 && (
                <span className="micro-source-toggle">{expandedKey === 'fermented' ? ' ▾' : ' ▸'}</span>
              )}
            </span>
            <span className="rate">{t('week.fermentedTarget')}</span>
          </div>
          <b>{microbiote.fermentedAvgPerDay.toFixed(1)} {t('week.perDayShort')}</b>
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
          <p className="hint" style={{ marginTop: 10 }}>
            {t('week.prebioticsEaten')} : {microbiote.prebioticSources.join(', ')}
          </p>
        )}
        {microbiote.polyphenolSources.length > 0 && (
          <p className="hint" style={{ marginTop: 4 }}>
            {t('week.polyphenolSources')} : {microbiote.polyphenolSources.join(', ')}
          </p>
        )}
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
