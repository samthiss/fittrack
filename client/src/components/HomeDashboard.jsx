import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import CircularGauge from './CircularGauge';
import ActivityLog from './ActivityLog';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function MacroMiniBar({ label, value, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="macro-mini">
      <span className="macro-mini-label">{label}</span>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="macro-mini-value">
        {Math.round(value)} / {Math.round(max)} g
      </span>
    </div>
  );
}

const WATER_GOAL_ML = 4000;

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
  activityTypes,
  activities,
  onAddActivity,
  onDeleteActivity,
  onOpenWeight,
}) {
  const { t } = useLanguage();
  const [showDrinkSources, setShowDrinkSources] = useState(false);
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
          <Icon name="chevron-left" size={15} />
        </button>
        <h1>{formatDateLabel(date, t)}</h1>
        <button type="button" className="day-nav-btn" onClick={onNextDay} aria-label={t('home.nextDay')}>
          <Icon name="chevron-right" size={15} />
        </button>
      </header>

      {currentImprovement && (
        <div
          className={improvementItems.length > 1 ? 'insight-card clickable' : 'insight-card'}
          onClick={improvementItems.length > 1 ? nextImprovement : undefined}
        >
          <div className="insight-card-icon">
            <Icon name="sparkles" size={20} color="var(--accent)" />
          </div>
          <div className="insight-card-content">
            <h3 className="insight-card-title">{currentImprovement.label}</h3>
            <p className="insight-card-body">{currentImprovement.detail}</p>
            {improvementItems.length > 1 && (
              <div className="insight-dots">
                {improvementItems.map((item, i) => (
                  <span key={item.key} className={i === currentImprovementIndex ? 'insight-dot active' : 'insight-dot'} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <h2>{t('home.summary')}</h2>
      <div className="card resume-card">
        <p className="resume-goal">
          {t('home.goal')} · <b>{Math.round(targetIntake)} {t('home.perDay')}</b>
        </p>
        <div className="gauge-row">
          <div className="gauge-stat">
            <b>{Math.round(consumedKcal)}</b>
            <span>{t('home.eaten')}</span>
          </div>
          <CircularGauge
            value={remainingKcal}
            max={targetIntake}
            label={remainingKcal < 0 ? t('home.over') : t('home.remaining')}
          />
          <div className="gauge-stat">
            <b>{Math.round(burnedKcal)}</b>
            <span>{t('home.burned')}</span>
          </div>
        </div>

        <div className="macro-bars-row">
          <MacroMiniBar label={t('nutrient.carbs')} value={macros.carbs.consumed} max={macros.carbs.target} />
          <MacroMiniBar label={t('nutrient.protein')} value={macros.protein.consumed} max={macros.protein.target} />
          <MacroMiniBar label={t('nutrient.fat')} value={macros.fat.consumed} max={macros.fat.target} />
        </div>
      </div>

      <h2>{t('home.food')}</h2>
      <div className="card" style={{ padding: 0 }}>
        {meals.map((m, i) => {
          const pct = m.budgetKcal > 0 ? Math.min(100, Math.round((m.consumedKcal / m.budgetKcal) * 100)) : 0;
          return (
            <div
              className="row meal-row"
              key={m.key}
              onClick={() => onSelectMeal(m.key)}
              style={{ borderBottom: i < meals.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
            >
              <div className="name meal-row-name">
                <span>
                  {t(`mealName.${m.key}`)} <Icon name="chevron-right" size={14} color="var(--text-muted)" />
                </span>
                <span className="rate">
                  {Math.round(m.consumedKcal)} / {Math.round(m.budgetKcal)} kcal
                </span>
                <div className="progress-track" style={{ marginTop: 7 }}>
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <button
                type="button"
                className="round-add-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMeal(m.key);
                }}
              >
                <Icon name="plus" size={17} color="var(--text-on-accent)" />
              </button>
            </div>
          );
        })}
      </div>

      <h2>{t('home.water')}</h2>
      <div className="card">
        <div className="row">
          <span className="row-icon-box water-icon-box">
            <Icon name="droplet" size={18} color="var(--macro-water)" />
          </span>
          <div className="name">
            <span>{water.manualMl} ml</span>
            <span className="rate">{Math.round(water.manualMl / 700)} × 700 ml</span>
          </div>
          <div className="field">
            {water.manualMl > 0 && (
              <button type="button" className="round-remove-btn" onClick={onRemoveLastWater}>
                <Icon name="minus" size={15} />
              </button>
            )}
            <button type="button" className="round-add-btn" onClick={onAddWater}>
              <Icon name="plus" size={15} color="var(--text-on-accent)" />
            </button>
          </div>
        </div>

        <div
          className={water.drinkSources?.length > 0 ? 'row clickable' : 'row'}
          onClick={() => water.drinkSources?.length > 0 && setShowDrinkSources(true)}
        >
          <div className="name">
            <span>{t('home.waterFromFood')}</span>
            <span className="rate">{t('home.waterFromFoodHint')}</span>
          </div>
          <div className="field">
            <b>{water.fromDrinksMl + water.fromCoffeeMl} ml</b>
          </div>
        </div>

        <div className="row">
          <div className="name">
            <span>{t('home.total')}</span>
          </div>
          <div className="field">
            <b>{water.totalMl} / {WATER_GOAL_ML} ml</b>
          </div>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(100, Math.round((water.totalMl / WATER_GOAL_ML) * 100))}%` }}
          />
        </div>
      </div>

      {showDrinkSources && (
        <div className="modal-overlay" onClick={() => setShowDrinkSources(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{t('home.waterFromFood')}</h2>
            {(water.drinkSources || []).map((s, i) => (
              <div className="micro-source-row" key={i}>
                <span>{s.label}</span>
                <span>{Math.round(s.value)} ml</span>
              </div>
            ))}
            <button type="button" className="done-btn" onClick={() => setShowDrinkSources(false)}>
              {t('home.close')}
            </button>
          </div>
        </div>
      )}

      <ActivityLog
        activityTypes={activityTypes}
        activities={activities}
        onAdd={onAddActivity}
        onDelete={onDeleteActivity}
      />

      <h2>{t('home.weight')}</h2>
      <div className="card">
        <div className="row">
          <span className="row-icon-box weight-icon-box">
            <Icon name="scale" size={24} color="var(--purple-500)" />
          </span>
          <div className="name clickable" onClick={onOpenWeight}>
            <span className="weight-value">{latestWeight != null ? `${latestWeight.toFixed(1)} kg` : '—'}</span>
          </div>
          <div className="field">
            <button
              type="button"
              className="round-remove-btn"
              onClick={() => handleAdjustWeight(-0.1)}
              disabled={weightSaving}
            >
              <Icon name="minus" size={15} />
            </button>
            <button
              type="button"
              className="round-add-btn"
              onClick={() => handleAdjustWeight(0.1)}
              disabled={weightSaving}
            >
              <Icon name="plus" size={15} color="var(--text-on-accent)" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
