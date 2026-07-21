import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
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

  function handleStop() {
    if (!window.confirm(t('activityLog.confirmEndSession'))) return;
    onExit();
  }

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
          <button type="button" className="weight-minus-btn" onClick={() => setElapsed(0)} aria-label={t('activityLog.resetTimer')}>
            <Icon name="rotate-ccw" size={18} />
          </button>
          <button type="button" className="meal-add-cta" style={{ width: 'auto', padding: '13px 26px' }} onClick={() => setRunning((r) => !r)}>
            <Icon name={running ? 'pause' : 'play'} size={18} />
            {running ? t('activityLog.pause') : t('activityLog.resume')}
          </button>
          <button type="button" className="weight-minus-btn activity-session-stop-btn" onClick={handleStop} aria-label={t('activityLog.stopSession')}>
            <Icon name="square" size={16} />
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

      <button type="button" className="meal-add-cta" onClick={onExit}>
        <Icon name="check" size={20} />
        {t('activityLog.finishSession')}
      </button>
    </div>
  );
}
