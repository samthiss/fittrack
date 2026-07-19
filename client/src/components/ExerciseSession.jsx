import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

const REST_SECONDS = 90;

function formatRest(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function ExerciseSession({ exercise, onBack, onComplete }) {
  const { t } = useLanguage();
  const [completedSets, setCompletedSets] = useState(0);
  const [resting, setResting] = useState(false);
  const [restLeft, setRestLeft] = useState(REST_SECONDS);
  const [weight, setWeight] = useState(exercise.weight_kg ?? '');
  const [reps, setReps] = useState(exercise.reps);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!resting) return undefined;
    if (restLeft <= 0) {
      setResting(false);
      return undefined;
    }
    intervalRef.current = setInterval(() => setRestLeft((s) => s - 1), 1000);
    return () => clearInterval(intervalRef.current);
  }, [resting, restLeft]);

  function validateSet() {
    const next = completedSets + 1;
    setCompletedSets(next);
    if (next >= exercise.sets) {
      onComplete(exercise.id);
      return;
    }
    setRestLeft(REST_SECONDS);
    setResting(true);
  }

  const currentSetNumber = Math.min(completedSets + 1, exercise.sets);

  return (
    <div>
      <div className="meal-detail-header">
        <button className="meal-detail-back-btn" onClick={onBack} aria-label={t('meal.back')}>
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="meal-detail-heading">
          <div className="day-nav-subtitle">{t('activityLog.exercise')}</div>
          <div className="meal-detail-title">{exercise.name}</div>
        </div>
      </div>

      <div className="activity-session-timer-card">
        <span className="activity-session-timer-label">{resting ? t('activityLog.restTimer') : t('activityLog.currentSet').replace('{n}', currentSetNumber).replace('{total}', exercise.sets)}</span>
        {resting ? (
          <>
            <div className="activity-session-timer-value">{formatRest(restLeft)}</div>
            <div className="activity-session-timer-controls">
              <button type="button" className="weight-minus-btn" onClick={() => setResting(false)}>
                <Icon name="skip-forward" size={20} />
              </button>
            </div>
          </>
        ) : (
          <div className="exercise-session-set-inputs">
            <div className="exercise-session-input-group">
              <input type="number" min="0" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} />
              <span>kg</span>
            </div>
            <span className="exercise-session-x">×</span>
            <div className="exercise-session-input-group">
              <input type="number" min="1" value={reps} onChange={(e) => setReps(e.target.value)} />
              <span>{t('activityLog.repsShort')}</span>
            </div>
          </div>
        )}
      </div>

      <h2>
        {t('activityLog.sets')} · {completedSets}/{exercise.sets}
      </h2>
      <div className="entry-list">
        {Array.from({ length: exercise.sets }).map((_, i) => {
          const done = i < completedSets;
          const current = i === completedSets;
          return (
            <div className={current ? 'entry-card activity-session-exercise current' : 'entry-card'} key={i}>
              <span className={done ? 'activity-session-exercise-check done' : 'activity-session-exercise-check'}>
                {done ? <Icon name="check" size={16} /> : i + 1}
              </span>
              <div className="entry-card-body" style={{ cursor: 'default' }}>
                <div className="entry-card-name">
                  {t('activityLog.setLabel').replace('{n}', i + 1)}
                </div>
              </div>
              <span className="activites-row-kcal">
                {done || current ? `${weight || exercise.weight_kg || 0} kg × ${reps}` : `${exercise.weight_kg ?? '—'} kg × ${exercise.reps}`}
              </span>
            </div>
          );
        })}
      </div>

      {!resting && (
        <button type="button" className="meal-add-cta" onClick={validateSet}>
          <Icon name="check" size={20} />
          {t('activityLog.validateSet')}
        </button>
      )}
    </div>
  );
}
