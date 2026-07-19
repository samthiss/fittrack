import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

const RANGES = ['7', '14', '30', '60', '90'];

function fmt1(n) {
  return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
}

function WeightAreaChart({ series }) {
  if (!series || series.length < 2) return null;
  const width = 320;
  const height = 120;
  const values = series.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = span * 0.15;
  const toY = (v) => height - 24 - ((v - min + pad) / (span + pad * 2)) * (height - 24);
  const stepX = series.length > 1 ? width / (series.length - 1) : 0;
  const points = series.map((d, i) => [i * stepX, toY(d.value)]);
  const linePoints = points.map(([x, y]) => `${x} ${y}`).join(' L ');
  const areaPath = `M ${points[0][0]} ${points[0][1]} L ${linePoints} L ${points[points.length - 1][0]} ${height} L ${points[0][0]} ${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: `${height}px`, display: 'block' }}>
      <defs>
        <linearGradient id="wReportGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(139,118,249,0.35)" />
          <stop offset="100%" stopColor="rgba(139,118,249,0)" />
        </linearGradient>
        <linearGradient id="wReportLine" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c9bcff" />
          <stop offset="55%" stopColor="#a893ff" />
          <stop offset="100%" stopColor="#7c5cfc" />
        </linearGradient>
      </defs>
      <path d={`M ${points[0][0]} ${points[0][1]} L ${linePoints}`} fill="none" stroke="url(#wReportLine)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d={areaPath} fill="url(#wReportGrad)" />
      <circle cx={last[0]} cy={last[1]} r="4.5" fill="var(--purple-500)" />
    </svg>
  );
}

export default function WeightReport({ onBack }) {
  const { t } = useLanguage();
  const [range, setRange] = useState('30');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setReport(await api.getWeightReport(range));
    setLoading(false);
  }, [range]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading || !report) return <p className="hint">{t('weight.loading')}</p>;

  const { weight, weightLoss, weightStart, weightCurrent } = report;
  const trendDelta = weight?.delta ?? 0;
  const trendUp = trendDelta > 0;

  return (
    <div>
      <div className="meal-detail-header">
        <button className="meal-detail-back-btn" onClick={onBack} aria-label={t('meal.back')}>
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="meal-detail-heading">
          <div className="day-nav-subtitle">{t('weight.title')}</div>
          <div className="meal-detail-title">{t('weight.reportTitle')}</div>
        </div>
      </div>

      <div className="weight-report-hero">
        <div>
          <div className="resume-goal" style={{ textAlign: 'left', margin: 0 }}>
            {t('weight.currentWeight')}
          </div>
          <div className="weight-report-hero-value">
            {weightCurrent != null ? fmt1(weightCurrent) : '—'} <span>kg</span>
          </div>
        </div>
        {report.insufficientData ? null : (
          <div style={{ textAlign: 'right' }}>
            <div className="resume-goal" style={{ textAlign: 'right', margin: 0 }}>
              {t(`weight.range${range}`)}
            </div>
            <div
              className="weight-report-hero-trend"
              style={{ color: trendUp ? 'var(--danger)' : 'var(--success)' }}
            >
              <Icon name={trendUp ? 'trending-up' : 'trending-down'} size={17} />
              {trendDelta >= 0 ? '+' : '−'}
              {fmt1(Math.abs(trendDelta))} kg
            </div>
          </div>
        )}
      </div>

      <div className="filter-pill-row" style={{ marginBottom: 8 }}>
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            className={range === r ? 'filter-pill active' : 'filter-pill'}
            onClick={() => setRange(r)}
          >
            {t(`weight.range${r}`)}
          </button>
        ))}
      </div>

      {report.insufficientData ? (
        <div className="card">
          <p className="hint">
            {t('weight.needMoreEntries')}
            {report.daysLogged > 0 ? t('weight.soFar').replace('{count}', report.daysLogged) : ''}.
          </p>
        </div>
      ) : (
        <div className="report-bar-chart-card">
          <WeightAreaChart series={weight.series} />
          <div className="weight-report-chart-labels">
            <span>{fmt1(weight.min)} kg</span>
            <span>{fmt1(weight.last)} kg</span>
          </div>
        </div>
      )}

      <h2>{t('weight.lostTitle')}</h2>
      <div className="weight-report-loss-grid">
        {['d7', 'd14', 'd30', 'd60', 'd90'].map((key, i) => (
          <div className="weight-report-loss-tile" key={key}>
            <div className="weight-report-loss-label">{t(`weight.range${RANGES[i]}`)}</div>
            <div className={weightLoss[key] != null && weightLoss[key] <= 0 ? 'weight-report-loss-value good' : 'weight-report-loss-value'}>
              {weightLoss[key] != null ? `${weightLoss[key] >= 0 ? '+' : '−'}${fmt1(Math.abs(weightLoss[key]))}` : '—'}
            </div>
            <div className="weight-report-loss-unit">kg</div>
          </div>
        ))}
        <div className="weight-report-loss-tile total">
          <div className="weight-report-loss-label">{t('weight.total')}</div>
          <div className="weight-report-loss-value accent">
            {weightLoss.total != null ? `${weightLoss.total >= 0 ? '+' : '−'}${fmt1(Math.abs(weightLoss.total))}` : '—'}
          </div>
          <div className="weight-report-loss-unit">kg</div>
        </div>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <div className="weight-report-mini-tile">
          <div className="weight-report-loss-label">{t('weight.start')}</div>
          <div className="weight-report-mini-value">{weightStart != null ? `${fmt1(weightStart)} kg` : '—'}</div>
        </div>
        <div className="weight-report-mini-tile">
          <div className="weight-report-loss-label">{t('weight.current')}</div>
          <div className="weight-report-mini-value">{weightCurrent != null ? `${fmt1(weightCurrent)} kg` : '—'}</div>
        </div>
      </div>
    </div>
  );
}
