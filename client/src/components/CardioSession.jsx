import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Same ring as ActivitySession's TimerRing — kept as a separate copy rather than a shared
// component since the two sessions don't share a module and duplicating a ~30-line SVG is
// cheaper than introducing a new shared file for it.
function TimerRing({ elapsed, plannedSeconds, size = 176 }) {
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = plannedSeconds > 0 ? Math.min(1, elapsed / plannedSeconds) : 0;
  const offset = circumference * (1 - ratio);
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="gauge">
      <defs>
        <linearGradient id="cardioRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
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
        stroke="url(#cardioRingGrad)"
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

export default function CardioSession({ activity, onExit, elapsed, running, onToggleRunning, onResetElapsed }) {
  const { t } = useLanguage();

  const elapsedMinutes = elapsed / 60;
  const estimatedKcal = activity.duration_minutes > 0 ? Math.round((activity.kcal * elapsedMinutes) / activity.duration_minutes) : 0;

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
          <b>{Math.round(elapsedMinutes)} min</b>
          <span>{t('activityLog.duration')}</span>
        </div>
      </div>

      <button type="button" className="meal-add-cta" style={{ marginTop: 16 }} onClick={onExit}>
        <Icon name="check" size={20} />
        {t('activityLog.finishSession')}
      </button>
    </div>
  );
}
