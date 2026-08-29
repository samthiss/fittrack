import { useState } from 'react';
import { api } from '../api';
import Icon from './Icon';
import ExercisePicker from './ExercisePicker';
import MuscleGroupPicker from './MuscleGroupPicker';
import { useLanguage } from '../i18n/LanguageContext';

// A per-set target row is edited as { value: '5-9' | '8-12' | '10-15' | '15-20' | 'Max', dir:
// 'up' | 'down' | null } (a fixed choice instead of free text, so every template stays
// consistent/parseable) and flattened to a single string like "5-9↑" only at save time.
const SET_TARGET_OPTIONS = ['5-9', '8-12', '10-15', '15-20', 'Max'];
function serializeSetTarget(row) {
  if (!row.value) return '';
  return row.dir === 'up' ? `${row.value}↑` : row.dir === 'down' ? `${row.value}↓` : row.value;
}
// Inverse of serializeSetTarget, for pre-filling the edit form from an already-saved exercise.
function parseSetTarget(target) {
  if (target.endsWith('↑')) return { value: target.slice(0, -1), dir: 'up' };
  if (target.endsWith('↓')) return { value: target.slice(0, -1), dir: 'down' };
  return { value: target, dir: null };
}

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
          <stop offset="0%" stopColor="#a6f4ff" />
          <stop offset="55%" stopColor="#12d8ff" />
          <stop offset="100%" stopColor="#ff2bd6" />
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

export default function ActivitySession({ activity, exercises, onExit, onOpenExercise, onAddExercise, onUpdateExercise, doneExerciseIds, elapsed, running, onToggleRunning, onResetElapsed }) {
  const { t } = useLanguage();
  const [showPicker, setShowPicker] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingExerciseId, setEditingExerciseId] = useState(null);
  const [name, setName] = useState('');
  const [sets, setSets] = useState(4);
  const [reps, setReps] = useState(10);
  const [setTargets, setSetTargets] = useState([]);
  const [weight, setWeight] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('');
  const [showMuscleGroupPicker, setShowMuscleGroupPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  function resetExerciseForm() {
    setName('');
    setSets(4);
    setReps(10);
    setSetTargets([]);
    setWeight('');
    setMuscleGroup('');
    setEditingExerciseId(null);
  }

  function openAddExercise() {
    resetExerciseForm();
    setShowAdd(true);
  }

  function openEditExercise(ex) {
    setEditingExerciseId(ex.id);
    setName(ex.name);
    setMuscleGroup(ex.muscle_group || '');
    setWeight(ex.weight_kg != null ? String(ex.weight_kg) : '');
    setSetTargets(ex.set_targets && ex.set_targets.length > 0 ? ex.set_targets.map(parseSetTarget) : []);
    setSets(ex.sets);
    setReps(ex.reps);
    setShowAdd(true);
  }

  async function handleAddExercise() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const cleanTargets = setTargets.map(serializeSetTarget).filter(Boolean);
      const payload = {
        name: name.trim(),
        sets: cleanTargets.length > 0 ? cleanTargets.length : Number(sets) || 3,
        reps: Number(reps) || 10,
        weight_kg: weight === '' ? null : Number(weight),
        muscle_group: muscleGroup.trim() || null,
        set_targets: cleanTargets.length > 0 ? cleanTargets : null,
      };
      if (editingExerciseId) {
        const updated = await api.updateActivityExercise(editingExerciseId, payload);
        onUpdateExercise?.(editingExerciseId, updated);
      } else {
        const created = await api.addActivityExercise(activity.id, payload);
        onAddExercise(created);
      }
      resetExerciseForm();
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
                  {ex.set_targets && ex.set_targets.length > 0 ? ex.set_targets.length : ex.sets} {t('activityLog.setsShort')}
                  {ex.weight_kg != null ? ` · ${ex.weight_kg} kg` : ''}
                </div>
              </div>
              {isCurrent && <span className="activity-session-current-label">{t('activityLog.inProgress')}</span>}
              <button
                type="button"
                className="entry-icon-btn"
                style={{ flex: 'none' }}
                onClick={(e) => {
                  e.stopPropagation();
                  openEditExercise(ex);
                }}
                aria-label={t('activityLog.editExercise')}
              >
                <Icon name="pencil" size={15} />
              </button>
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
              set_targets: ex.set_targets,
            });
            onAddExercise(created);
          }}
          onCreateNew={() => {
            setShowPicker(false);
            openAddExercise();
          }}
        />
      )}

      {showAdd && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowAdd(false);
            resetExerciseForm();
          }}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="meal-detail-header" style={{ marginBottom: 4 }}>
              <button
                type="button"
                className="meal-detail-back-btn"
                onClick={() => {
                  setShowAdd(false);
                  resetExerciseForm();
                }}
                aria-label={t('meal.close')}
              >
                <Icon name="x" size={20} />
              </button>
              <div className="meal-detail-heading">
                <div className="meal-detail-title" style={{ fontSize: 21 }}>
                  {editingExerciseId ? t('activityLog.editExercise') : t('activityLog.addExercise')}
                </div>
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

            {setTargets.length === 0 && (
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
            )}

            <h4 className="section-label">
              {t('activityLog.setTargets')} <span style={{ textTransform: 'none', fontWeight: 400 }}>({t('profile.optional')})</span>
            </h4>
            <p className="hint" style={{ padding: '0 0 8px' }}>{t('activityLog.setTargetsHint')}</p>
            {setTargets.map((row, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div className="day-nav-subtitle" style={{ marginBottom: 6 }}>
                  S{i + 1}
                </div>
                <select
                  className="filter-select"
                  style={{ width: '100%', marginTop: 0, marginBottom: 6 }}
                  value={row.value}
                  onChange={(e) => {
                    const opt = e.target.value;
                    setSetTargets((rows) => rows.map((r, ri) => (ri === i ? { value: opt, dir: opt === 'Max' ? null : r.dir } : r)));
                  }}
                >
                  {SET_TARGET_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 8 }}>
                  {row.value !== 'Max' && (
                    <>
                      <button
                        type="button"
                        className="entry-icon-btn"
                        style={row.dir === 'up' ? { background: 'var(--acc)', color: '#fff', borderColor: 'transparent' } : undefined}
                        aria-label="up"
                        onClick={() => setSetTargets((rows) => rows.map((r, ri) => (ri === i ? { ...r, dir: r.dir === 'up' ? null : 'up' } : r)))}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="entry-icon-btn"
                        style={row.dir === 'down' ? { background: 'var(--acc)', color: '#fff', borderColor: 'transparent' } : undefined}
                        aria-label="down"
                        onClick={() => setSetTargets((rows) => rows.map((r, ri) => (ri === i ? { ...r, dir: r.dir === 'down' ? null : 'down' } : r)))}
                      >
                        ↓
                      </button>
                    </>
                  )}
                  <div style={{ flex: 1 }} />
                  <button type="button" className="entry-icon-btn entry-delete-btn" onClick={() => setSetTargets((rows) => rows.filter((_, ri) => ri !== i))}>
                    <Icon name="trash-2" size={16} />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="recurring-feature-row"
              style={{ justifyContent: 'center', width: '100%', marginBottom: 12, font: 'inherit', cursor: 'pointer' }}
              onClick={() => setSetTargets((rows) => [...rows, { value: '5-9', dir: null }])}
            >
              <Icon name="plus" size={16} color="var(--acc)" />
              <span className="recurring-feature-title" style={{ color: 'var(--acc)' }}>
                S{setTargets.length + 1}
              </span>
            </button>

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
            {saving ? t('activityLog.saving') : editingExerciseId ? t('meal.save') : t('activityLog.add')}
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
