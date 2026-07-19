import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

export default function ActivityDetail({ activity, onBack, onStart, onDeleted }) {
  const { t } = useLanguage();
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [sets, setSets] = useState(4);
  const [reps, setReps] = useState(10);
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);

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
      });
      setName('');
      setSets(4);
      setReps(10);
      setWeight('');
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
            onClick={() => setShowAdd(true)}
            aria-label={t('activityLog.addExercise')}
          >
            <Icon name="plus" size={20} />
          </button>
        )}
      </div>

      <div style={{ padding: '18px 0 0' }}>
        <div className="day-nav-subtitle">{activity.duration_minutes} min</div>
        <h1 style={{ lineHeight: 1.15, marginTop: 2 }}>{t(`activityType.${activity.type}`)}</h1>
      </div>

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
          <h2>{t('activityLog.exercises')}</h2>
          {loading ? (
            <p className="hint">{t('weight.loading')}</p>
          ) : exercises.length === 0 ? (
            <p className="hint">{t('activityLog.noExercises')}</p>
          ) : (
            <div className="entry-list">
              {exercises.map((ex) => (
                <div className="entry-card" key={ex.id}>
                  <span className="meal-icon-box">
                    <Icon name="dumbbell" size={19} />
                  </span>
                  <div className="entry-card-body" style={{ cursor: 'default' }}>
                    <div className="entry-card-name">{ex.name}</div>
                    <div className="entry-card-sub">
                      {ex.sets} {t('activityLog.setsShort')}
                      {ex.weight_kg != null ? ` · ${ex.weight_kg} kg` : ''}
                    </div>
                  </div>
                  <b className="activites-row-kcal">{ex.reps} {t('activityLog.repsShort')}</b>
                  <button type="button" className="entry-icon-btn entry-delete-btn" onClick={() => handleDeleteExercise(ex.id)}>
                    <Icon name="trash-2" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="row" style={{ gap: 10, marginTop: 22 }}>
        <button type="button" className="weight-minus-btn" style={{ color: 'var(--danger)' }} onClick={handleDeleteActivity} aria-label={t('activityLog.delete')}>
          <Icon name="trash-2" size={18} />
        </button>
        {isForce && exercises.length > 0 && (
          <button type="button" className="meal-add-cta" style={{ flex: 1 }} onClick={() => onStart(exercises)}>
            <Icon name="play" size={18} />
            {t('activityLog.start')}
          </button>
        )}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{t('activityLog.addExercise')}</h2>
            <div className="row">
              <label>{t('activityLog.exerciseName')}</label>
              <div className="field">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('activityLog.exerciseName')} />
              </div>
            </div>
            <div className="row">
              <label>{t('activityLog.sets')}</label>
              <div className="field">
                <input type="number" min="1" value={sets} onChange={(e) => setSets(e.target.value)} />
              </div>
            </div>
            <div className="row">
              <label>{t('activityLog.reps')}</label>
              <div className="field">
                <input type="number" min="1" value={reps} onChange={(e) => setReps(e.target.value)} />
              </div>
            </div>
            <div className="row">
              <label>{t('activityLog.weightKg')}</label>
              <div className="field">
                <input type="number" min="0" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
            </div>
            <button type="button" className="btn btn-block" onClick={handleAddExercise} disabled={saving}>
              {saving ? t('activityLog.saving') : t('activityLog.add')}
            </button>
          </div>
          <button type="button" className="done-btn" onClick={() => setShowAdd(false)}>
            {t('activityLog.close')}
          </button>
        </div>
      )}
    </div>
  );
}
