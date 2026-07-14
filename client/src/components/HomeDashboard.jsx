import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import CircularGauge from './CircularGauge';
import ActivityLog from './ActivityLog';

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

const WEEKDAY_LABELS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const WATER_GOAL_ML = 4000;

function formatDateLabel(dateStr) {
  const todayStr = new Date().toISOString().slice(0, 10);
  if (dateStr === todayStr) return "Aujourd'hui";
  const d = new Date(`${dateStr}T00:00:00Z`);
  const yesterday = new Date(`${todayStr}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (dateStr === yesterday.toISOString().slice(0, 10)) return 'Hier';
  const tomorrow = new Date(`${todayStr}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (dateStr === tomorrow.toISOString().slice(0, 10)) return 'Demain';
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
        <button type="button" className="day-nav-btn" onClick={onPrevDay} aria-label="Jour précédent">
          ‹
        </button>
        <h1>{formatDateLabel(date)}</h1>
        <button type="button" className="day-nav-btn" onClick={onNextDay} aria-label="Jour suivant">
          ›
        </button>
      </header>

      {currentImprovement && (
        <div
          className={improvementItems.length > 1 ? 'insight-card clickable' : 'insight-card'}
          onClick={improvementItems.length > 1 ? nextImprovement : undefined}
        >
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
      )}

      <h2>Résumé</h2>
      <p className="hint" style={{ marginTop: -8 }}>
        Objectif : {Math.round(targetIntake)} kcal/jour
      </p>
      <div className="card resume-card">
        <div className="gauge-row">
          <div className="gauge-stat">
            <b>{Math.round(consumedKcal)}</b>
            <span>Mangées</span>
          </div>
          <CircularGauge
            value={remainingKcal}
            max={targetIntake}
            label={remainingKcal < 0 ? 'Dépassement' : 'Restantes'}
          />
          <div className="gauge-stat">
            <b>{Math.round(burnedKcal)}</b>
            <span>Brûlées</span>
          </div>
        </div>

        <div className="macro-bars-row">
          <MacroMiniBar label="Glucides" value={macros.carbs.consumed} max={macros.carbs.target} />
          <MacroMiniBar label="Protéines" value={macros.protein.consumed} max={macros.protein.target} />
          <MacroMiniBar label="Lipides" value={macros.fat.consumed} max={macros.fat.target} />
        </div>
      </div>

      <h2>Alimentation</h2>
      <div className="card">
        {meals.map((m) => (
          <div className="row meal-row" key={m.key} onClick={() => onSelectMeal(m.key)}>
            <div className="name">
              <span>{m.label} →</span>
              <span className="rate">
                {Math.round(m.consumedKcal)} / {Math.round(m.budgetKcal)} kcal
              </span>
            </div>
            <button
              type="button"
              className="round-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSelectMeal(m.key);
              }}
            >
              +
            </button>
          </div>
        ))}
      </div>

      <h2>Eau</h2>
      <div className="card">
        <div className="row">
          <div className="name">
            <span>💧 {water.manualMl} ml</span>
            <span className="rate">{Math.round(water.manualMl / 700)} × 700 ml</span>
          </div>
          <div className="field">
            {water.manualMl > 0 && (
              <button type="button" className="round-remove-btn" onClick={onRemoveLastWater}>
                −
              </button>
            )}
            <button type="button" className="round-add-btn" onClick={onAddWater}>
              +
            </button>
          </div>
        </div>

        <div
          className={water.drinkSources?.length > 0 ? 'row clickable' : 'row'}
          onClick={() => water.drinkSources?.length > 0 && setShowDrinkSources(true)}
        >
          <div className="name">
            <span>Eau provenant de l'alimentation</span>
            <span className="rate">lait, whey, etc. ajoutés en ml</span>
          </div>
          <div className="field">
            <b>{water.fromDrinksMl + water.fromCoffeeMl} ml</b>
          </div>
        </div>

        <div className="row">
          <div className="name">
            <span>Total</span>
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
            <h2>Eau provenant de l'alimentation</h2>
            {(water.drinkSources || []).map((s, i) => (
              <div className="micro-source-row" key={i}>
                <span>{s.label}</span>
                <span>{Math.round(s.value)} ml</span>
              </div>
            ))}
            <button type="button" className="done-btn" onClick={() => setShowDrinkSources(false)}>
              Fermer
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

      <h2>Poids</h2>
      <div className="card">
        <div className="row">
          <div className="name clickable" onClick={onOpenWeight}>
            <span className="weight-value">⚖️ {latestWeight != null ? `${latestWeight.toFixed(1)} kg` : '—'}</span>
          </div>
          <div className="field">
            <button
              type="button"
              className="round-remove-btn"
              onClick={() => handleAdjustWeight(-0.1)}
              disabled={weightSaving}
            >
              −
            </button>
            <button
              type="button"
              className="round-add-btn"
              onClick={() => handleAdjustWeight(0.1)}
              disabled={weightSaving}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
