import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ActivitySession({ activity, exercises, onExit, onOpenExercise, doneExerciseIds }) {
  const { t } = useLanguage();
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!running) return undefined;
    intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

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
          <div className="day-nav-subtitle">{t('activityLog.inProgress')} · {t(`activityType.${activity.type}`)}</div>
          <div className="meal-detail-title">{t('activityLog.sessionTitle')}</div>
        </div>
        <span className="activity-session-live">
          <i /> {t('activityLog.live')}
        </span>
      </div>

      <div className="activity-session-timer-card">
        <span className="activity-session-timer-label">{t('activityLog.elapsedTime')}</span>
        <div className="activity-session-timer-value">{formatElapsed(elapsed)}</div>
        <div className="activity-session-timer-controls">
          <button type="button" className="weight-minus-btn" onClick={() => setRunning((r) => !r)}>
            <Icon name={running ? 'pause' : 'play'} size={20} />
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
            </div>
          );
        })}
      </div>

      <button type="button" className="meal-add-cta" onClick={onExit}>
        <Icon name="check" size={20} />
        {t('activityLog.finishSession')}
      </button>
    </div>
  );
}
