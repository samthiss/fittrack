import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import CircularGauge from './CircularGauge';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// The 4 fixed meals have a translated mealName.* key; any extra "en-cas" slot (key starting with
// "snack_") only has the free-text label the user gave it in Réglages > Repas du jour.
const BASE_MEAL_KEYS = ['breakfast', 'snack', 'lunch', 'dinner'];
function mealTitle(key, label, t) {
  return BASE_MEAL_KEYS.includes(key) ? t(`mealName.${key}`) : label;
}

function MacroMiniBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="macro-mini">
      <span className="macro-mini-label">{label}</span>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="macro-mini-value">
        {Math.round(value)} / {Math.round(max)} g
      </span>
    </div>
  );
}

const WATER_GOAL_ML = 4000;

const MEAL_ICONS = {
  breakfast: 'sunrise',
  snack: 'apple',
  lunch: 'utensils',
  dinner: 'moon',
};

function formatDateSubtitle(dateStr, lang) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const formatted = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(d);
  return formatted;
}

function formatDateLabel(dateStr, t) {
  const WEEKDAY_LABELS = [
    t('home.weekdaySun'),
    t('home.weekdayMon'),
    t('home.weekdayTue'),
    t('home.weekdayWed'),
    t('home.weekdayThu'),
    t('home.weekdayFri'),
    t('home.weekdaySat'),
  ];
  const todayStr = new Date().toISOString().slice(0, 10);
  if (dateStr === todayStr) return t('home.today');
  const d = new Date(`${dateStr}T00:00:00Z`);
  const yesterday = new Date(`${todayStr}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (dateStr === yesterday.toISOString().slice(0, 10)) return t('home.yesterday');
  const tomorrow = new Date(`${todayStr}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (dateStr === tomorrow.toISOString().slice(0, 10)) return t('home.tomorrow');
  const weekday = WEEKDAY_LABELS[d.getUTCDay()];
  return `${weekday} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

export default function HomeDashboard({
  dashboard,
  date,
  onPrevDay,
  onNextDay,
  onSelectMeal,
  water,
  onAddWater,
  onRemoveLastWater,
  onOpenWeight,
  onOpenReport,
  onOpenWeightReport,
}) {
  const { t, lang } = useLanguage();
  const [improvementIndex, setImprovementIndex] = useState(0);
  const [latestWeight, setLatestWeight] = useState(null);
  const [weightSaving, setWeightSaving] = useState(false);

  const refreshLatestWeight = useCallback(async () => {
    const logs = await api.getWeightLogs('90');
    setLatestWeight(logs.length > 0 ? logs[logs.length - 1].weight_kg : null);
  }, []);

  useEffect(() => {
    refreshLatestWeight();
  }, [refreshLatestWeight]);

  const previousDayImprovements = dashboard?.previousDayImprovements;
  useEffect(() => {
    setImprovementIndex(0);
  }, [previousDayImprovements?.date]);

  async function handleAdjustWeight(delta) {
    if (weightSaving) return;
    const next = Math.round(((latestWeight ?? 70) + delta) * 10) / 10;
    if (next <= 0) return;
    setWeightSaving(true);
    try {
      await api.addWeightLog({ date: todayStr(), weight_kg: next });
      await refreshLatestWeight();
    } finally {
      setWeightSaving(false);
    }
  }

  if (!dashboard) return null;
  const { targetIntake, consumedKcal, remainingKcal, burnedKcal, macros, meals } = dashboard;
  const improvementItems = previousDayImprovements?.items || [];
  const currentImprovementIndex = improvementItems.length > 0 ? improvementIndex % improvementItems.length : 0;
  const currentImprovement = improvementItems[currentImprovementIndex];

  function nextImprovement() {
    setImprovementIndex((i) => (i + 1) % improvementItems.length);
  }

  return (
    <div>
      <header className="app-header day-nav-header">
        <button type="button" className="day-nav-btn" onClick={onPrevDay} aria-label={t('home.prevDay')}>
          <Icon name="chevron-left" size={20} />
        </button>
        <div>
          <h1 style={{ textAlign: 'center' }}>{formatDateLabel(date, t)}</h1>
          <p className="day-nav-subtitle">{formatDateSubtitle(date, lang)}</p>
        </div>
        <button type="button" className="day-nav-btn" onClick={onNextDay} aria-label={t('home.nextDay')}>
          <Icon name="chevron-right" size={20} />
        </button>
      </header>

      {currentImprovement && (
        <div
          className={improvementItems.length > 1 ? 'insight-card clickable' : 'insight-card'}
          onClick={improvementItems.length > 1 ? nextImprovement : undefined}
        >
          <div className="insight-card-icon">
            <Icon name="sparkles" size={19} color="var(--acc)" />
          </div>
          <div className="insight-card-content">
            <h3 className="insight-card-title">{currentImprovement.label}</h3>
            <p className="insight-card-body">{currentImprovement.detail}</p>
            <div className="insight-bottom-row">
              {improvementItems.length > 1 ? (
                <div className="insight-dots">
                  {improvementItems.map((item, i) => (
                    <span key={item.key} className={i === currentImprovementIndex ? 'insight-dot active' : 'insight-dot'} />
                  ))}
                </div>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="report-link"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenReport?.();
                }}
              >
                {t('home.viewReport')}
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="section-header">
        <span className="section-title">{t('home.summary')}</span>
        <span className="section-hint">
          {t('home.goal')} <b>{Math.round(targetIntake)}</b> {t('home.perDay')}
        </span>
      </div>
      <div className="card resume-card">
        <div className="gauge-row">
          <div className="gauge-stat">
            <Icon name="utensils" size={22} color="var(--macro-carb)" />
            <b>{Math.round(consumedKcal)}</b>
            <span>{t('home.eaten')}</span>
          </div>
          <CircularGauge
            value={remainingKcal}
            max={targetIntake}
            label={t('home.remaining')}
          />
          <div className="gauge-stat">
            <Icon name="flame" size={22} color="var(--warning)" />
            <b>{Math.round(burnedKcal)}</b>
            <span>{t('home.burned')}</span>
          </div>
        </div>

        <div className="macro-bars-row">
          <MacroMiniBar
            label={t('nutrient.carbs')}
            value={macros.carbs.consumed}
            max={macros.carbs.target}
            color="var(--macro-carb)"
          />
          <MacroMiniBar
            label={t('nutrient.protein')}
            value={macros.protein.consumed}
            max={macros.protein.target}
            color="var(--macro-protein)"
          />
          <MacroMiniBar
            label={t('nutrient.fat')}
            value={macros.fat.consumed}
            max={macros.fat.target}
            color="var(--macro-fat)"
          />
        </div>

        <div className="resume-water-row">
          <span className="resume-water-icon">
            <Icon name="droplet" size={19} />
          </span>
          <div className="resume-water-body">
            <div className="resume-water-top">
              <span>{t('home.water')}</span>
              <span>
                {water.totalMl} / {WATER_GOAL_ML} ml
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, Math.round((water.totalMl / WATER_GOAL_ML) * 100))}%`, background: 'var(--macro-water)' }}
              />
            </div>
          </div>
          <div className="resume-water-actions">
            {water.manualMl > 0 && (
              <button type="button" className="resume-water-btn" onClick={onRemoveLastWater} aria-label={t('home.removeWater')}>
                <Icon name="minus" size={14} />
              </button>
            )}
            <button type="button" className="resume-water-btn" onClick={onAddWater} aria-label={t('home.addWater')}>
              <Icon name="plus" size={14} />
            </button>
          </div>
        </div>
      </div>

      <h2>{t('home.food')}</h2>
      <div className="meal-card-list">
        {meals.map((m) => (
          <div className="meal-card" key={m.key} onClick={() => onSelectMeal(m.key)}>
            <span className="meal-icon-box">
              <Icon name={MEAL_ICONS[m.key] || 'utensils'} size={21} />
            </span>
            <div className="meal-card-body">
              <div className="meal-card-title">{mealTitle(m.key, m.label, t)}</div>
              <div className="meal-card-kcal">{Math.round(m.consumedKcal)} kcal</div>
              <div className="meal-card-macros">
                <span>
                  <i style={{ background: 'var(--macro-protein)' }} />
                  {Math.round(m.consumedProtein || 0)}g
                </span>
                <span>
                  <i style={{ background: 'var(--macro-carb)' }} />
                  {Math.round(m.consumedCarbs || 0)}g
                </span>
                <span>
                  <i style={{ background: 'var(--macro-fat)' }} />
                  {Math.round(m.consumedFat || 0)}g
                </span>
              </div>
            </div>
            <button
              type="button"
              className="meal-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSelectMeal(m.key, true);
              }}
            >
              <Icon name="plus" size={22} color="var(--text-on-accent)" />
            </button>
          </div>
        ))}
      </div>

      <div className="section-header">
        <span className="section-title">{t('home.weight')}</span>
        <button type="button" className="report-link" onClick={onOpenWeightReport}>
          {t('home.viewReport')}
          <Icon name="chevron-right" size={14} />
        </button>
      </div>
      <div className="card">
        <div className="row">
          <span className="row-icon-box weight-icon-box">
            <Icon name="scale" size={21} />
          </span>
          <div className="name clickable" onClick={onOpenWeight}>
            <span className="weight-value">{latestWeight != null ? `${latestWeight.toFixed(1)} kg` : '—'}</span>
          </div>
          <div className="field">
            <button
              type="button"
              className="weight-minus-btn"
              onClick={() => handleAdjustWeight(-0.1)}
              disabled={weightSaving}
            >
              <Icon name="minus" size={18} />
            </button>
            <button
              type="button"
              className="weight-plus-btn"
              onClick={() => handleAdjustWeight(0.1)}
              disabled={weightSaving}
            >
              <Icon name="plus" size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
