import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import CircularGauge from './CircularGauge';
import Icon from './Icon';
import GlitchNumber from './GlitchNumber';
import { useLanguage } from '../i18n/LanguageContext';
import { todayStr, formatDateLabel, formatDateSubtitle } from '../data/dates';

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

const DEFAULT_WATER_GOAL_ML = 4000;

const MEAL_ICONS = {
  breakfast: 'sunrise',
  snack: 'apple',
  lunch: 'utensils',
  dinner: 'moon',
};

const WATER_PRESETS_ML = [250, 500, 700, 1000];

export default function HomeDashboard({
  dashboard,
  date,
  onPrevDay,
  onNextDay,
  onSelectMeal,
  water,
  onAddWater,
  onRemoveLastWater,
  defaultWaterMl,
  waterGoalMl,
  onOpenWeight,
  onOpenReport,
  onOpenWeightReport,
  onOpenTdeeSettings,
  supplements,
  onOpenSupplements,
  onToggleSupplement,
}) {
  const { t, lang } = useLanguage();
  const [supplementError, setSupplementError] = useState('');
  const [latestWeight, setLatestWeight] = useState(null);
  const [weightSaving, setWeightSaving] = useState(false);
  // Sticks to whatever the user last picked for the rest of the session — only resets to the
  // configured default (Réglages > Eau) when that default itself changes.
  const [waterAmount, setWaterAmount] = useState(defaultWaterMl);
  useEffect(() => {
    setWaterAmount(defaultWaterMl);
  }, [defaultWaterMl]);

  const refreshLatestWeight = useCallback(async () => {
    const logs = await api.getWeightLogs('90');
    setLatestWeight(logs.length > 0 ? logs[logs.length - 1].weight_kg : null);
  }, []);

  useEffect(() => {
    refreshLatestWeight();
  }, [refreshLatestWeight]);

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
  // Only what's actually due today is worth a tap here — "au besoin" supplements and the ones
  // scheduled for other weekdays live on the dedicated screen.
  const supplementList = (supplements?.supplements || []).filter((s) => s.dueToday);
  const supplementPct =
    supplements?.dueCount > 0 ? Math.round((supplements.takenCount / supplements.dueCount) * 100) : 0;
  const { targetIntake, consumedKcal, remainingKcal, burnedKcal, macros, meals, tdee, energyBalance } = dashboard;
  // Two states worth shouting about: the day's intake is spent, and the balance has tipped into
  // a surplus. Both turn their card red and pulsing rather than hiding in a sign change.
  const overTarget = remainingKcal < 0;
  const surplus = energyBalance ? energyBalance.balance < 0 : false;

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

      {tdee && (
        <>
          <div className="section-header">
            <span className="section-title">{t('balance.title')}</span>
            {onOpenTdeeSettings && (
              <button type="button" className="report-link" onClick={onOpenTdeeSettings}>
                {t('tdee.viewDetail')}
                <Icon name="chevron-right" size={14} />
              </button>
            )}
          </div>
          <div className="tdee-summary-row">
            <div className="card tdee-total-card tdee-summary-item">
              <span className="tdee-total-label">{t('tdee.total')}</span>
              <div className="tdee-total-line">
                <b className="tdee-total-value">
                  <GlitchNumber value={tdee.total} />
                </b>
                <span className="tdee-total-unit">kcal</span>
              </div>
            </div>
            <div className="card tdee-total-card tdee-summary-item">
              <span className="tdee-total-label">{t('balance.dailyTarget')}</span>
              <div className="tdee-total-line">
                <b className="tdee-total-value">
                  <GlitchNumber value={Math.round(targetIntake)} />
                </b>
                <span className="tdee-total-unit">kcal</span>
              </div>
            </div>
            {energyBalance && (
              <div className={`card tdee-total-card tdee-summary-item${surplus ? ' cp-alert' : ''}`}>
                <span className="tdee-total-label">
                  {surplus ? t('home.surplusAlert') : energyBalance.forecast ? t('balance.forecast') : t('balance.gap')}
                </span>
                <div className="tdee-total-line">
                  <b className="tdee-total-value">
                    {energyBalance.balance >= 0 ? '−' : '+'}
                    {Math.abs(energyBalance.balance)}
                  </b>
                  <span className="tdee-total-unit">kcal</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="section-header">
        <span className="section-title">{t('home.summary')}</span>
        {onOpenReport && (
          <button type="button" className="report-link" onClick={onOpenReport}>
            {t('home.viewReport')}
            <Icon name="chevron-right" size={14} />
          </button>
        )}
      </div>
      <div className={overTarget ? 'card resume-card cp-alert' : 'card resume-card'}>
        <div className="gauge-row">
          <div className="gauge-stat">
            <Icon name="utensils" size={22} color="var(--macro-carb)" />
            <b>
              <GlitchNumber value={Math.round(consumedKcal)} />
            </b>
            <span>{t('home.eaten')}</span>
          </div>
          <CircularGauge
            value={remainingKcal}
            max={targetIntake}
            label={t('home.remaining')}
          />
          <div className="gauge-stat">
            <Icon name="flame" size={22} color="var(--warning)" />
            <b>
              <GlitchNumber value={Math.round(burnedKcal)} />
            </b>
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
          <MacroMiniBar
            label={t('nutrient.fiber')}
            value={macros.fiber?.consumed || 0}
            max={macros.fiber?.target || 30}
            color="var(--macro-fiber)"
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
                {water.totalMl} / {waterGoalMl || DEFAULT_WATER_GOAL_ML} ml
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(100, Math.round((water.totalMl / (waterGoalMl || DEFAULT_WATER_GOAL_ML)) * 100))}%`,
                  background: 'var(--macro-water)',
                }}
              />
            </div>
          </div>
          <div className="resume-water-actions">
            {water.manualMl > 0 && (
              <button type="button" className="resume-water-btn" onClick={onRemoveLastWater} aria-label={t('home.removeWater')}>
                <Icon name="minus" size={17} />
              </button>
            )}
            <select
              className="resume-water-select"
              value={waterAmount}
              onChange={(e) => setWaterAmount(Number(e.target.value))}
              aria-label={t('home.waterAmount')}
            >
              {WATER_PRESETS_ML.map((ml) => (
                <option key={ml} value={ml}>
                  {ml >= 1000 ? `${ml / 1000}L` : `${ml}ml`}
                </option>
              ))}
            </select>
            <button type="button" className="resume-water-btn" onClick={() => onAddWater(waterAmount)} aria-label={t('home.addWater')}>
              <Icon name="plus" size={17} />
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
                <span>
                  <i style={{ background: 'var(--macro-fiber)' }} />
                  {Math.round(m.consumedFiber || 0)}g
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
        <span className="section-title">{t('supplements.title')}</span>
        <button type="button" className="report-link" onClick={onOpenSupplements}>
          {t('supplements.manage')}
          <Icon name="chevron-right" size={14} />
        </button>
      </div>
      <div className="card supplement-home-card" onClick={onOpenSupplements}>
        {supplementList.length === 0 ? (
          <div className="row">
            <span className="row-icon-box supplement-icon-box">
              <Icon name="pill" size={21} />
            </span>
            <div className="name">{t('supplements.emptyShort')}</div>
            <div className="field">
              <Icon name="plus" size={18} />
            </div>
          </div>
        ) : (
          <>
            <div className="resume-water-top">
              <span>{t('supplements.takenToday')}</span>
              <span>
                {supplements.takenCount} / {supplements.dueCount}
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${supplementPct}%`, background: 'var(--macro-protein)' }}
              />
            </div>
            <div className="supplement-home-list">
              {supplementList.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`supplement-home-chip${s.taken ? ' taken' : ''}${
                    !s.taken && s.takenCount > 0 ? ' partial' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    // A failed tick must not take the Journal down with it, but it must not
                    // vanish either: swallowing it here is exactly what makes a tap look like a
                    // dead button. The message lands under the card.
                    Promise.resolve(onToggleSupplement(s.id, !s.taken)).catch((err) =>
                      setSupplementError(err.message || String(err))
                    );
                  }}
                >
                  <span className="supplement-tag-check">
                    {s.taken ? (
                      <Icon name="check" size={12} color="var(--text-on-accent)" />
                    ) : (
                      s.takenCount > 0 && <b>{s.takenCount}</b>
                    )}
                  </span>
                  {s.name}
                  {s.times_per_day > 1 && (
                    <b>
                      {s.takenCount}/{s.times_per_day}
                    </b>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {supplementError && <p className="hint error">{supplementError}</p>}

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
