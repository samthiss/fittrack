import { useEffect, useReducer } from 'react';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';
import { computeSessionElapsed, computeRestLeft, formatClock } from '../data/sessionTiming';

// Shown above the tab bar while a workout is running and the user is on another tab. Without it a
// session is invisible from anywhere but Activités: the timers keep running (they're timestamp-
// based, and the session is owned by App), but there'd be nothing to say so, and no way back other
// than remembering to tap the tab.
export default function SessionBanner({ session, sessionExercise, onResume }) {
  const { t } = useLanguage();
  const [, forceRender] = useReducer((x) => x + 1, 0);

  const progress = sessionExercise ? session?.exerciseProgress?.[sessionExercise.id] : null;
  const resting = Boolean(progress?.resting);

  // Redraw every second — but only while something is actually counting. A paused rest and a
  // paused session stopwatch both show a value frozen by their own state, not by us stopping.
  const ticking = Boolean(session) && (resting ? !progress.restPaused : session.running);
  useEffect(() => {
    if (!ticking) return undefined;
    const id = setInterval(forceRender, 1000);
    function onVisible() {
      if (document.visibilityState === 'visible') forceRender();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ticking]);

  if (!session) return null;

  // Resting is the time-critical number — it's the one with a deadline, so it wins the display.
  const label = resting
    ? t('activityLog.restTimer')
    : session.activity.label || t(`activityType.${session.activity.type}`);
  const value = formatClock(resting ? computeRestLeft(progress) : computeSessionElapsed(session));

  return (
    <button type="button" className={resting ? 'session-banner resting' : 'session-banner'} onClick={onResume}>
      <span className="session-banner-dot" />
      <span className="session-banner-body">
        <span className="session-banner-label">{label}</span>
        {sessionExercise && !resting && <span className="session-banner-sub">{sessionExercise.name}</span>}
      </span>
      <span className="session-banner-time">{value}</span>
      <Icon name="chevron-right" size={17} color="var(--text-muted)" />
    </button>
  );
}
