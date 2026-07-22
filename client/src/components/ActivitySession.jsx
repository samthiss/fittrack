import { useState } from 'react';
import { api } from '../api';
import Icon from './Icon';
import ExercisePicker from './ExercisePicker';
import MuscleGroupPicker from './MuscleGroupPicker';
import { useLanguage } from '../i18n/LanguageContext';

function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Progress ring around the elapsed time — fills up toward the activity's planned duration (not
// a hard cap: still shows a full ring and keeps counting past it, same as the kcal estimate).
function TimerRing({ elapsed, plannedSeconds, size = 176 }) {
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = plannedSeconds > 0 ? Math.min(1, elapsed / plannedSeconds) : 0;
  const offset = circumference * (1 - ratio);
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="gauge">
      <defs>
        <linearGradient id="sessionRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
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
        stroke="url(#sessionRingGrad)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: 'stroke-dashoffset 700ms ease' }}
      />
    </svg>
  );
}

export default function ActivitySession({ activity, exercises, onExit, onOpenExercise, onAddExercise, doneExerciseIds, elapsed, running, onToggleRunning, onResetElapsed }) {
  const { t } = useLanguage();
  const [showPicker, setShowPicker] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [sets, setSets] = useState(4);
  const [reps, setReps] = useState(10);
  const [weight, setWeight] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('');
  const [showMuscleGroupPicker, setShowMuscleGroupPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleAddExercise() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const created = await api.addActivityExercise(activity.id, {
        name: name.trim(),
        sets: Number(sets) || 3,
        reps: Number(reps) || 10,
        weight_kg: weight === '' ? null : Number(weight),
        muscle_group: muscleGroup.trim() || null,
      });
      onAddExercise(created);
      setName('');
      setSets(4);
      setReps(10);
      setWeight('');
      setMuscleGroup('');
      setShowAdd(false);
    } finally {
      setSaving(false);
    }
  }

  const elapsedMinutes = elapsed / 60;
  const estimatedKcal = activity.duration_minutes > 0 ? Math.min(activity.kcal, Math.round((activity.kcal * elapsedMinutes) / activity.duration_minutes)) : 0;
  const doneCount = exercises.filter((ex) => doneExerciseIds.has(ex.id)).length;

  return (
    <div>
      <div className="meal-detail-header">
        <button className="meal-detail-back-btn" onClick={onExit} aria-label={t('meal.back')}>
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="meal-detail-heading">
          <div className="day-nav-subtitle">{t('activityLog.inProgress')} · {activity.label || t(`activityType.${activity.type}`)}</div>
          <div className="meal-detail-title">{t('activityLog.sessionTitle')}</div>
        </div>
        <span className="activity-session-live">
          <i /> {t('activityLog.live')}
        </span>
      </div>

      <div className="activity-session-timer-card">
        <span className="activity-session-timer-label">{t('activityLog.elapsedTime')}</span>
        <div className="activity-session-ring-wrap">
          <TimerRing elapsed={elapsed} plannedSeconds={activity.duration_minutes * 60} />
          <div className="activity-session-ring-center">
            <div className="activity-session-timer-value">{formatElapsed(elapsed)}</div>
            <span className="activity-session-timer-unit">{t('activityLog.minutesShort')}</span>
          </div>
        </div>
        <div className="activity-session-timer-controls">
          <button type="button" className="weight-minus-btn" onClick={onResetElapsed} aria-label={t('activityLog.resetTimer')}>
            <Icon name="rotate-ccw" size={18} />
          </button>
          <button type="button" className="meal-add-cta" style={{ width: 'auto', padding: '13px 26px' }} onClick={onToggleRunning}>
            <Icon name={running ? 'pause' : 'play'} size={18} />
            {running ? t('activityLog.pause') : t('activityLog.resume')}
          </button>
        </div>
      </div>

      <div className="tile-grid">
        <div className="tile">
          <b style={{ color: 'var(--warning)' }}>{estimatedKcal}</b>
          <span>{t('activityLog.kcalBurned')}</span>
        </div>
        <div className="tile">
          <b>
            {doneCount}
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>/{exercises.length}</span>
          </b>
          <span>{t('activityLog.exercises')}</span>
        </div>
      </div>

      <h2>
        {t('activityLog.exercises')} · {doneCount}/{exercises.length}
      </h2>
      <div className="entry-list">
        {exercises.map((ex, i) => {
          const done = doneExerciseIds.has(ex.id);
          const isCurrent = !done && exercises.slice(0, i).every((e) => doneExerciseIds.has(e.id));
          return (
            <div className={isCurrent ? 'entry-card activity-session-exercise current' : 'entry-card activity-session-exercise'} key={ex.id} onClick={() => onOpenExercise(ex)}>
              <span className={done ? 'activity-session-exercise-check done' : 'activity-session-exercise-check'}>
                {done ? <Icon name="check" size={16} /> : i + 1}
              </span>
              <div className="entry-card-body">
                <div className="entry-card-name" style={{ color: done ? 'var(--txt)' : undefined }}>{ex.name}</div>
                <div className="entry-card-sub">
                  {ex.sets} {t('activityLog.setsShort')}
                  {ex.weight_kg != null ? ` · ${ex.weight_kg} kg` : ''}
                </div>
              </div>
              {isCurrent && <span className="activity-session-current-label">{t('activityLog.inProgress')}</span>}
              <Icon name="chevron-right" size={16} color="var(--text-muted)" />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button type="button" className="meal-add-cta meal-add-cta-white" style={{ flex: 1 }} onClick={() => setShowPicker(true)}>
          <Icon name="plus" size={18} />
          {t('activityLog.add')}
        </button>
        <button type="button" className="meal-add-cta" style={{ flex: 1 }} onClick={onExit}>
          <Icon name="check" size={20} />
          {t('activityLog.finishSession')}
        </button>
      </div>

      {showPicker && (
        <ExercisePicker
          onClose={() => setShowPicker(false)}
          onPick={async (ex) => {
            const created = await api.addActivityExercise(activity.id, {
              name: ex.name,
              muscle_group: ex.muscle_group,
              sets: ex.sets,
              reps: ex.reps,
              weight_kg: ex.weight_kg,
            });
            onAddExercise(created);
          }}
          onCreateNew={() => {
            setShowPicker(false);
            setShowAdd(true);
          }}
        />
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="meal-detail-header" style={{ marginBottom: 4 }}>
              <button type="button" className="meal-detail-back-btn" onClick={() => setShowAdd(false)} aria-label={t('meal.close')}>
                <Icon name="x" size={20} />
              </button>
              <div className="meal-detail-heading">
                <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('activityLog.addExercise')}</div>
              </div>
            </div>

            <h4 className="section-label" style={{ marginTop: 0 }}>{t('activityLog.exerciseName')}</h4>
            <div className="search-input-row">
              <input type="text" className="search-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('activityLog.exerciseName')} />
            </div>

            <h4 className="section-label">
              {t('activityLog.muscleGroup')} <span style={{ textTransform: 'none', fontWeight: 400 }}>({t('profile.optional')})</span>
            </h4>
            <button type="button" className="filter-pill" style={{ display: 'flex', width: '100%', justifyContent: 'space-between', boxSizing: 'border-box' }} onClick={() => setShowMuscleGroupPicker(true)}>
              <span>{muscleGroup || t('activityLog.muscleGroupPicker.none')}</span>
              <Icon name="chevron-right" size={16} color="var(--text-muted)" />
            </button>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <h4 className="section-label">{t('activityLog.sets')}</h4>
                <div className="search-input-row">
                  <input type="number" min="1" className="search-input" value={sets} onChange={(e) => setSets(e.target.value)} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <h4 className="section-label">{t('activityLog.reps')}</h4>
                <div className="search-input-row">
                  <input type="number" min="1" className="search-input" value={reps} onChange={(e) => setReps(e.target.value)} />
                </div>
              </div>
            </div>

            <h4 className="section-label">{t('activityLog.weightKg')}</h4>
            <div className="search-input-row">
              <input type="number" min="0" step="0.5" className="search-input" value={weight} onChange={(e) => setWeight(e.target.value)} />
              <span className="unit">kg</span>
            </div>
          </div>
          <button
            type="button"
            className="done-btn done-btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              handleAddExercise();
            }}
            disabled={saving || !name.trim()}
          >
            {saving ? t('activityLog.saving') : t('activityLog.add')}
          </button>
        </div>
      )}

      {showMuscleGroupPicker && (
        <MuscleGroupPicker
          value={muscleGroup}
          onClose={() => setShowMuscleGroupPicker(false)}
          onSelect={(label) => {
            setMuscleGroup(label || '');
            setShowMuscleGroupPicker(false);
          }}
        />
      )}
    </div>
  );
}
