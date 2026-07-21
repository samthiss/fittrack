import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Icon from './Icon';
import ExercisePicker from './ExercisePicker';
import { useLanguage } from '../i18n/LanguageContext';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_LABEL = { mon: 'L', tue: 'M', wed: 'M', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
const WEEKDAY_LABEL_EN = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' };

export default function ActivityDetail({ activity, recurringDays = [], onBack, onStart, onDeleted, onUpdated }) {
  const { t, lang } = useLanguage();
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [label, setLabel] = useState(activity.label || '');
  const [showEdit, setShowEdit] = useState(false);
  const [editDuration, setEditDuration] = useState(activity.duration_minutes);
  const [editKcal, setEditKcal] = useState(Math.round(activity.kcal));
  const [editRecurring, setEditRecurring] = useState(recurringDays.length > 0);
  const [editDays, setEditDays] = useState(new Set(recurringDays));
  const [editSaving, setEditSaving] = useState(false);
  const [name, setName] = useState('');
  const [sets, setSets] = useState(4);
  const [reps, setReps] = useState(10);
  const [weight, setWeight] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setExercises(await api.getActivityExercises(activity.id));
    setLoading(false);
  }, [activity.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isForce = activity.type === 'force';

  async function handleAddExercise() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await api.addActivityExercise(activity.id, {
        name: name.trim(),
        sets: Number(sets) || 3,
        reps: Number(reps) || 10,
        weight_kg: weight === '' ? null : Number(weight),
        muscle_group: muscleGroup.trim() || null,
      });
      setName('');
      setSets(4);
      setReps(10);
      setWeight('');
      setMuscleGroup('');
      setShowAdd(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteExercise(id) {
    await api.deleteActivityExercise(id);
    await refresh();
  }

  async function handleDeleteActivity() {
    await api.deleteActivity(activity.id);
    onDeleted();
  }

  async function handleSaveTemplate() {
    if (!templateName.trim() || savingTemplate) return;
    setSavingTemplate(true);
    try {
      await api.createWorkoutTemplate({
        name: templateName.trim(),
        exercises: exercises.map((ex) => ({ name: ex.name, sets: ex.sets, reps: ex.reps, weight_kg: ex.weight_kg, muscle_group: ex.muscle_group })),
      });
      setShowSaveTemplate(false);
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 3000);
    } finally {
      setSavingTemplate(false);
    }
  }

  function toggleEditDay(key) {
    setEditDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSaveEdit() {
    if (editSaving) return;
    setEditSaving(true);
    try {
      const trimmed = label.trim();
      const finalDuration = Number(editDuration) || activity.duration_minutes;
      const finalKcal = Number(editKcal) || activity.kcal;
      const recurringDaysPayload = editRecurring ? [...editDays] : [];
      const updated = await api.updateActivity(activity.id, {
        label: trimmed,
        duration_minutes: finalDuration,
        kcal: finalKcal,
        recurringDays: recurringDaysPayload,
      });
      activity.label = trimmed || null;
      activity.duration_minutes = updated.duration_minutes;
      activity.kcal = updated.kcal;
      activity.plan_group_id = updated.plan_group_id;
      setLabel(trimmed);
      setShowEdit(false);
      onUpdated?.();
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div>
      <div className="activity-detail-hero">
        <span className="activity-detail-hero-icon">
          <Icon name={isForce ? 'dumbbell' : 'activity'} size={32} />
        </span>
        <button type="button" className="activity-detail-hero-btn activity-detail-hero-btn-back" onClick={onBack} aria-label={t('meal.back')}>
          <Icon name="chevron-left" size={20} />
        </button>
        {isForce && (
          <button
            type="button"
            className="activity-detail-hero-btn activity-detail-hero-btn-add"
            onClick={() => setShowPicker(true)}
            aria-label={t('activityLog.addExercise')}
          >
            <Icon name="plus" size={20} />
          </button>
        )}
      </div>

      <div style={{ padding: '18px 0 0' }}>
        <div className="day-nav-subtitle">{activity.duration_minutes} min</div>
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <h1 style={{ lineHeight: 1.15, marginTop: 2 }}>{label || t(`activityType.${activity.type}`)}</h1>
          <button
            type="button"
            className="entry-icon-btn"
            onClick={() => setShowEdit(true)}
            aria-label={t('activityLog.editName')}
          >
            <Icon name="pencil" size={16} />
          </button>
        </div>
        {label && <p className="hint" style={{ marginTop: 2 }}>{t(`activityType.${activity.type}`)}</p>}
      </div>

      {recurringDays.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h4 className="section-label">{t('activityLog.recurringDays')}</h4>
          <div className="day-chip-row">
            {DAY_ORDER.map((key) => (
              <span
                key={key}
                className={recurringDays.includes(key) ? 'day-chip active' : 'day-chip'}
              >
                {(lang === 'en' ? WEEKDAY_LABEL_EN : WEEKDAY_LABEL)[key]}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="tile-grid" style={{ marginTop: 16 }}>
        <div className="tile">
          <b style={{ color: 'var(--warning)' }}>{Math.round(activity.kcal)}</b>
          <span>{t('activityLog.kcalBurned')}</span>
        </div>
        <div className="tile">
          <b>{activity.duration_minutes} min</b>
          <span>{t('activityLog.duration')}</span>
        </div>
        {isForce && (
          <div className="tile">
            <b>{exercises.length}</b>
            <span>{t('activityLog.exercises')}</span>
          </div>
        )}
      </div>

      {isForce && (
        <>
          <div className="row" style={{ alignItems: 'center', marginTop: 8 }}>
            <h2 style={{ margin: 0 }}>{t('activityLog.exercises')}</h2>
            {exercises.length > 0 && (
              <button
                type="button"
                className="report-link"
                style={{ marginLeft: 'auto' }}
                onClick={() => {
                  setTemplateName(label || t(`activityType.${activity.type}`));
                  setShowSaveTemplate(true);
                }}
              >
                <Icon name="bookmark" size={14} />
                {t('activityLog.saveAsTemplate')}
              </button>
            )}
          </div>
          {templateSaved && <p className="hint success">{t('activityLog.templateSaved')}</p>}
          {loading ? (
            <p className="hint">{t('weight.loading')}</p>
          ) : exercises.length === 0 ? (
            <p className="hint">{t('activityLog.noExercises')}</p>
          ) : (
            <div className="entry-list">
              {exercises.map((ex, i) => (
                <div className="entry-card" key={ex.id}>
                  <span className="meal-icon-box">
                    <b style={{ fontSize: 14, fontWeight: 700 }}>{i + 1}</b>
                  </span>
                  <div className="entry-card-body" style={{ cursor: 'default' }}>
                    {ex.muscle_group && <div className="entry-card-sub" style={{ marginTop: 0, marginBottom: 2 }}>{ex.muscle_group}</div>}
                    <div className="entry-card-name">{ex.name}</div>
                    <div className="entry-card-sub">
                      {ex.sets} {t('activityLog.setsShort')} × {ex.reps} {t('activityLog.repsShort')}
                      {ex.weight_kg != null ? ` · ${ex.weight_kg} kg` : ''}
                    </div>
                  </div>
                  <button type="button" className="entry-icon-btn entry-delete-btn" onClick={() => handleDeleteExercise(ex.id)}>
                    <Icon name="trash-2" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="row" style={{ gap: 10, marginTop: 16 }}>
            <button type="button" className="meal-add-cta meal-add-cta-white" style={{ flex: 1 }} onClick={() => setShowPicker(true)}>
              <Icon name="plus" size={18} />
              {t('activityLog.addExercise')}
            </button>
            {exercises.length > 0 && (
              <button type="button" className="meal-add-cta" style={{ flex: 1 }} onClick={() => onStart(exercises)}>
                <Icon name="play" size={18} />
                {t('activityLog.start')}
              </button>
            )}
          </div>
        </>
      )}

      <div className="row" style={{ gap: 10, marginTop: 16 }}>
        <button type="button" className="weight-minus-btn" style={{ color: 'var(--danger)' }} onClick={handleDeleteActivity} aria-label={t('activityLog.delete')}>
          <Icon name="trash-2" size={18} />
        </button>
        {!isForce && (
          <span className="hint" style={{ margin: 0 }}>{t('activityLog.delete')}</span>
        )}
      </div>

      {showEdit && (
        <div className="modal-overlay" onClick={() => setShowEdit(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="meal-detail-header" style={{ marginBottom: 4 }}>
              <button type="button" className="meal-detail-back-btn" onClick={() => setShowEdit(false)} aria-label={t('meal.close')}>
                <Icon name="x" size={20} />
              </button>
              <div className="meal-detail-heading">
                <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('activityLog.editName')}</div>
              </div>
            </div>

            <h4 className="section-label">{t('activityLog.workoutName')}</h4>
            <div className="search-input-row">
              <Icon name="pencil" size={18} color="var(--text-muted)" />
              <input
                type="text"
                className="search-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('activityLog.workoutNamePlaceholder')}
                autoFocus
              />
            </div>

            <h4 className="section-label">{t('activityLog.duration')}</h4>
            <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
              <button type="button" className="weight-minus-btn" onClick={() => setEditDuration((d) => Math.max(5, Number(d) - 5))}>
                <Icon name="minus" size={18} />
              </button>
              <div style={{ textAlign: 'center', minWidth: 70 }}>
                <span className="weight-value">{editDuration}</span> <span className="rate">min</span>
              </div>
              <button type="button" className="weight-plus-btn" onClick={() => setEditDuration((d) => Number(d) + 5)}>
                <Icon name="plus" size={18} />
              </button>
            </div>

            <h4 className="section-label">{t('activityLog.kcalBurned')}</h4>
            <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
              <button type="button" className="weight-minus-btn" onClick={() => setEditKcal((k) => Math.max(0, Number(k) - 10))}>
                <Icon name="minus" size={18} />
              </button>
              <div style={{ textAlign: 'center', minWidth: 70 }}>
                <span className="weight-value">{editKcal}</span> <span className="rate">kcal</span>
              </div>
              <button type="button" className="weight-plus-btn" onClick={() => setEditKcal((k) => Number(k) + 10)}>
                <Icon name="plus" size={18} />
              </button>
            </div>

            <h4 className="section-label">{t('activityLog.recurrence')}</h4>
            <label className="recurring-toggle-row">
              <input type="checkbox" checked={editRecurring} onChange={(e) => setEditRecurring(e.target.checked)} />
              <span>{t('activityLog.recurringActivity')}</span>
            </label>
            {editRecurring && (
              <div className="day-chip-row" style={{ marginTop: 10 }}>
                {DAY_ORDER.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={editDays.has(key) ? 'day-chip active' : 'day-chip'}
                    onClick={() => toggleEditDay(key)}
                  >
                    {(lang === 'en' ? WEEKDAY_LABEL_EN : WEEKDAY_LABEL)[key]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="done-btn done-btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              handleSaveEdit();
            }}
            disabled={editSaving}
          >
            {editSaving ? t('activityLog.saving') : t('activityLog.save')}
          </button>
        </div>
      )}

      {showPicker && (
        <ExercisePicker
          onClose={() => setShowPicker(false)}
          onPick={async (ex) => {
            await api.addActivityExercise(activity.id, {
              name: ex.name,
              muscle_group: ex.muscle_group,
              sets: ex.sets,
              reps: ex.reps,
              weight_kg: ex.weight_kg,
            });
            await refresh();
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
            <div className="search-input-row">
              <input
                type="text"
                className="search-input"
                value={muscleGroup}
                onChange={(e) => setMuscleGroup(e.target.value)}
                placeholder={t('activityLog.muscleGroupPlaceholder')}
              />
            </div>

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

      {showSaveTemplate && (
        <div className="modal-overlay" onClick={() => setShowSaveTemplate(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="meal-detail-header" style={{ marginBottom: 4 }}>
              <button type="button" className="meal-detail-back-btn" onClick={() => setShowSaveTemplate(false)} aria-label={t('meal.close')}>
                <Icon name="x" size={20} />
              </button>
              <div className="meal-detail-heading">
                <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('activityLog.saveAsTemplate')}</div>
              </div>
            </div>

            <h4 className="section-label" style={{ marginTop: 0 }}>{t('activityLog.templateName')}</h4>
            <div className="search-input-row">
              <input
                type="text"
                className="search-input"
                autoFocus
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t('activityLog.templateNamePlaceholder')}
              />
            </div>

            <div className="entry-list">
              {exercises.map((ex) => (
                <div className="entry-card" key={ex.id}>
                  <span className="meal-icon-box">
                    <Icon name="dumbbell" size={19} />
                  </span>
                  <div className="entry-card-body" style={{ cursor: 'default' }}>
                    <div className="entry-card-name">{ex.name}</div>
                    <div className="entry-card-sub">
                      {ex.sets} {t('activityLog.setsShort')} × {ex.reps} {t('activityLog.repsShort')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="done-btn done-btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              handleSaveTemplate();
            }}
            disabled={savingTemplate || !templateName.trim()}
          >
            <Icon name="check" size={20} />
            {savingTemplate ? t('activityLog.saving') : t('meal.save')}
          </button>
        </div>
      )}
    </div>
  );
}
