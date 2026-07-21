import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

const REST_SECONDS = 90;
const REST_STEP_SECONDS = 15;
const LB_PER_KG = 2.20462;

function formatRest(s) {
  const m = Math.floor(Math.max(0, s) / 60);
  const sec = Math.max(0, s) % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function RestRing({ restLeft, restTarget, size = 176 }) {
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = restTarget > 0 ? Math.min(1, Math.max(0, restLeft) / restTarget) : 0;
  const offset = circumference * (1 - ratio);
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="gauge">
      <defs>
        <linearGradient id="restRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c9bcff" />
          <stop offset="55%" stopColor="#a893ff" />
          <stop offset="100%" stopColor="#7c5cfc" />
        </linearGradient>
      </defs>
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--ink-600, var(--line))" strokeWidth="9" />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="url(#restRingGrad)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: 'stroke-dashoffset 300ms linear' }}
      />
    </svg>
  );
}

export default function ExerciseSession({ exercise, activityLabel, index, total, onBack, onComplete, onUpdateExercise }) {
  const { t } = useLanguage();
  const [completedSets, setCompletedSets] = useState(0);
  const [resting, setResting] = useState(false);
  const [restPaused, setRestPaused] = useState(false);
  const [restTarget, setRestTarget] = useState(REST_SECONDS);
  const [restLeft, setRestLeft] = useState(REST_SECONDS);
  const [sets, setSets] = useState(exercise.sets);
  const [weight, setWeight] = useState(exercise.weight_kg ?? 0);
  const [reps, setReps] = useState(exercise.reps);
  const [currentReps, setCurrentReps] = useState(exercise.reps);
  const [sheet, setSheet] = useState(null); // null | 'sets' | 'weight' | 'reps' | 'rest'
  const [sheetSets, setSheetSets] = useState(exercise.sets);
  const [sheetReps, setSheetReps] = useState(exercise.reps);
  const [sheetUnit, setSheetUnit] = useState('kg');
  const [sheetWeight, setSheetWeight] = useState(exercise.weight_kg ?? 0);
  const [sheetRestTarget, setSheetRestTarget] = useState(REST_SECONDS);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!resting || restPaused) return undefined;
    if (restLeft <= 0) {
      setResting(false);
      return undefined;
    }
    intervalRef.current = setInterval(() => setRestLeft((s) => s - 1), 1000);
    return () => clearInterval(intervalRef.current);
  }, [resting, restPaused, restLeft]);

  function persist(patch) {
    api.updateActivityExercise(exercise.id, patch).catch(() => {});
    onUpdateExercise?.(exercise.id, patch);
  }

  function validateSet() {
    const next = completedSets + 1;
    setCompletedSets(next);
    setCurrentReps(reps);
    if (next >= sets) {
      onComplete(exercise.id);
      return;
    }
    setRestLeft(restTarget);
    setRestPaused(false);
    setResting(true);
  }

  function openSheet(name) {
    setSheetSets(sets);
    setSheetReps(reps);
    setSheetWeight(sheetUnit === 'lb' ? Math.round(weight * LB_PER_KG * 10) / 10 : weight);
    setSheetRestTarget(restTarget);
    setSheet(name);
  }

  function confirmRestTarget() {
    setRestTarget(sheetRestTarget);
    if (!resting) setRestLeft(sheetRestTarget);
    setSheet(null);
  }

  function confirmSets() {
    setSets(sheetSets);
    persist({ sets: sheetSets });
    setSheet(null);
  }

  function confirmReps() {
    setReps(sheetReps);
    persist({ reps: sheetReps });
    setSheet(null);
  }

  function confirmWeight() {
    const kg = sheetUnit === 'lb' ? Math.round((sheetWeight / LB_PER_KG) * 10) / 10 : sheetWeight;
    setWeight(kg);
    persist({ weight_kg: kg });
    setSheet(null);
  }

  const currentSetNumber = Math.min(completedSets + 1, sets);

  return (
    <div>
      <div className="meal-detail-header">
        <button className="meal-detail-back-btn" onClick={onBack} aria-label={t('meal.back')}>
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="meal-detail-heading">
          <div className="day-nav-subtitle">
            {activityLabel} · {t('activityLog.exercise')} {index}/{total}
          </div>
          <div className="meal-detail-title">{exercise.name}</div>
        </div>
      </div>

      <div className="activity-session-timer-card">
        <span className="activity-session-timer-label">{t('activityLog.restTimer')}</span>
        <div className="activity-session-ring-wrap">
          <RestRing restLeft={resting ? restLeft : restTarget} restTarget={restTarget} />
          <div className="activity-session-ring-center">
            <div className="activity-session-timer-value">{formatRest(resting ? restLeft : restTarget)}</div>
            <span className="activity-session-timer-unit">{t('activityLog.restOf').replace('{time}', formatRest(restTarget))}</span>
          </div>
        </div>
        <div className="activity-session-timer-controls">
          <button type="button" className="weight-minus-btn" onClick={() => setRestLeft(restTarget)} disabled={!resting} aria-label={t('activityLog.resetTimer')}>
            <Icon name="rotate-ccw" size={18} />
          </button>
          <button
            type="button"
            className="meal-add-cta"
            style={{ width: 'auto', padding: '13px 26px', opacity: resting ? 1 : 0.5 }}
            disabled={!resting}
            onClick={() => setRestPaused((p) => !p)}
          >
            <Icon name={restPaused ? 'play' : 'pause'} size={18} />
            {restPaused ? t('activityLog.resume') : t('activityLog.pause')}
          </button>
          <button type="button" className="weight-minus-btn" onClick={() => openSheet('rest')} aria-label={t('activityLog.editRestTime')}>
            <Icon name="pencil" size={16} />
          </button>
        </div>
      </div>

      <div style={{ marginTop: 4 }}>
        <div className="day-nav-subtitle" style={{ marginBottom: 8 }}>
          {t('activityLog.exerciseSettings')}
        </div>
        <div className="filter-pill-row" style={{ marginTop: 0 }}>
          <button type="button" className="filter-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => openSheet('sets')}>
            <Icon name="layers" size={14} />
            {sets} {t('activityLog.setsShort')}
          </button>
          <button type="button" className="filter-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => openSheet('weight')}>
            <Icon name="weight" size={14} />
            {weight} kg
          </button>
          <button type="button" className="filter-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => openSheet('reps')}>
            <Icon name="repeat-2" size={14} />
            {reps} {t('activityLog.repsShort')}
          </button>
        </div>
      </div>

      <div style={{ color: 'var(--success)', fontSize: 12, fontWeight: 700, margin: '10px 0 6px' }}>
        {t('activityLog.setsDoneCount').replace('{done}', completedSets).replace('{total}', sets)}
      </div>
      <div className="entry-list">
        {Array.from({ length: sets }).map((_, i) => {
          const done = i < completedSets;
          const current = i === completedSets;
          return (
            <div className={current ? 'entry-card activity-session-exercise current' : 'entry-card'} key={i}>
              <span className={done ? 'activity-session-exercise-check done' : 'activity-session-exercise-check'}>
                {done ? <Icon name="check" size={16} /> : i + 1}
              </span>
              <div className="entry-card-body" style={{ cursor: 'default' }}>
                <div className="entry-card-name">{t('activityLog.setLabel').replace('{n}', i + 1)}</div>
              </div>
              {current ? (
                <span className="activites-row-kcal" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                  {weight} kg ×
                  <input
                    type="number"
                    min="1"
                    value={currentReps}
                    onChange={(e) => setCurrentReps(e.target.value)}
                    style={{ width: 40, background: 'var(--ink-900)', border: '1px solid var(--border-strong, var(--line))', borderRadius: 8, color: 'var(--txt)', textAlign: 'center', padding: '4px 2px' }}
                  />
                </span>
              ) : (
                <span className="activites-row-kcal">
                  {weight} kg × {reps}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!resting && (
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" className="weight-minus-btn" onClick={() => onComplete(exercise.id)} aria-label={t('activityLog.skipExercise')}>
            <Icon name="skip-forward" size={18} />
          </button>
          <button type="button" className="meal-add-cta" style={{ flex: 1 }} onClick={validateSet}>
            <Icon name="check" size={20} />
            {t('activityLog.validateSet')}
          </button>
        </div>
      )}

      {sheet === 'rest' && (
        <div className="modal-overlay bottom-sheet-overlay" onClick={() => setSheet(null)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-title">{t('activityLog.editRestTime')}</div>
            <div className="bottom-sheet-stepper">
              <button type="button" className="weight-minus-btn" onClick={() => setSheetRestTarget((n) => Math.max(REST_STEP_SECONDS, n - REST_STEP_SECONDS))}>
                <Icon name="minus" size={18} />
              </button>
              <span className="bottom-sheet-stepper-value">{formatRest(sheetRestTarget)}</span>
              <button type="button" className="weight-plus-btn" onClick={() => setSheetRestTarget((n) => n + REST_STEP_SECONDS)}>
                <Icon name="plus" size={18} />
              </button>
            </div>
            <div className="bottom-sheet-actions">
              <button type="button" className="meal-add-cta meal-add-cta-white" style={{ flex: 1 }} onClick={() => setSheet(null)}>
                <Icon name="x" size={18} />
                {t('common.cancel')}
              </button>
              <button type="button" className="meal-add-cta" style={{ flex: 1 }} onClick={confirmRestTarget}>
                <Icon name="check" size={18} />
                {t('activityLog.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet === 'sets' && (
        <div className="modal-overlay bottom-sheet-overlay" onClick={() => setSheet(null)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-title">{t('activityLog.sets')}</div>
            <div className="bottom-sheet-stepper">
              <button type="button" className="weight-minus-btn" onClick={() => setSheetSets((n) => Math.max(1, n - 1))}>
                <Icon name="minus" size={18} />
              </button>
              <span className="bottom-sheet-stepper-value">{sheetSets}</span>
              <button type="button" className="weight-plus-btn" onClick={() => setSheetSets((n) => n + 1)}>
                <Icon name="plus" size={18} />
              </button>
            </div>
            <div className="bottom-sheet-actions">
              <button type="button" className="meal-add-cta meal-add-cta-white" style={{ flex: 1 }} onClick={() => setSheet(null)}>
                <Icon name="x" size={18} />
                {t('common.cancel')}
              </button>
              <button type="button" className="meal-add-cta" style={{ flex: 1 }} onClick={confirmSets}>
                <Icon name="check" size={18} />
                {t('activityLog.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet === 'reps' && (
        <div className="modal-overlay bottom-sheet-overlay" onClick={() => setSheet(null)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-title">{t('activityLog.reps')}</div>
            <div className="bottom-sheet-stepper">
              <button type="button" className="weight-minus-btn" onClick={() => setSheetReps((n) => Math.max(1, n - 1))}>
                <Icon name="minus" size={18} />
              </button>
              <span className="bottom-sheet-stepper-value">{sheetReps}</span>
              <button type="button" className="weight-plus-btn" onClick={() => setSheetReps((n) => n + 1)}>
                <Icon name="plus" size={18} />
              </button>
            </div>
            <div className="bottom-sheet-actions">
              <button type="button" className="meal-add-cta meal-add-cta-white" style={{ flex: 1 }} onClick={() => setSheet(null)}>
                <Icon name="x" size={18} />
                {t('common.cancel')}
              </button>
              <button type="button" className="meal-add-cta" style={{ flex: 1 }} onClick={confirmReps}>
                <Icon name="check" size={18} />
                {t('activityLog.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet === 'weight' && (
        <div className="modal-overlay bottom-sheet-overlay" onClick={() => setSheet(null)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-header-row">
              <div className="bottom-sheet-title" style={{ margin: 0 }}>
                {t('activityLog.editWeightTitle')}
              </div>
              <button type="button" className="bottom-sheet-save-link" onClick={confirmWeight}>
                {t('common.save')}
              </button>
            </div>
            <div className="day-nav-subtitle" style={{ marginTop: 14, marginBottom: 6 }}>
              {t('activityLog.unit')}
            </div>
            <div className="filter-pill-row" style={{ marginTop: 0, marginBottom: 4 }}>
              <button type="button" className={sheetUnit === 'kg' ? 'filter-pill active' : 'filter-pill'} style={{ flex: 1, textAlign: 'center' }} onClick={() => setSheetUnit('kg')}>
                kg
              </button>
              <button type="button" className={sheetUnit === 'lb' ? 'filter-pill active' : 'filter-pill'} style={{ flex: 1, textAlign: 'center' }} onClick={() => setSheetUnit('lb')}>
                lb
              </button>
            </div>
            <div className="exercise-session-input-group" style={{ marginTop: 10, width: '100%', boxSizing: 'border-box' }}>
              <input type="number" min="0" step="0.5" value={sheetWeight} onChange={(e) => setSheetWeight(e.target.value)} style={{ width: '100%', textAlign: 'left' }} />
              <span>{sheetUnit}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
