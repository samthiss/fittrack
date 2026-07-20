import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import Icon from './Icon';
import ActivityDetail from './ActivityDetail';
import ActivitySession from './ActivitySession';
import ExerciseSession from './ExerciseSession';
import AddActivityModal from './AddActivityModal';
import { useLanguage } from '../i18n/LanguageContext';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const TYPE_ICONS = {
  force: 'dumbbell',
  velo_ville: 'bike',
  stepper: 'footprints',
};

function iconForType(type) {
  if (TYPE_ICONS[type]) return TYPE_ICONS[type];
  if (type?.startsWith('marche')) return 'footprints';
  return 'activity';
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isoDayKey(dateStr) {
  const jsDay = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  return DAY_ORDER[(jsDay + 6) % 7];
}

function mondayOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const jsDay = d.getUTCDay();
  const diff = (jsDay + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function shiftDateStr(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function ActivitesScreen() {
  const { t, lang } = useLanguage();
  const [date, setDate] = useState(todayStr());
  const [activityTypes, setActivityTypes] = useState([]);
  const [activities, setActivities] = useState([]);
  const [weekPresence, setWeekPresence] = useState({});
  const [recurringKeys, setRecurringKeys] = useState(new Set());
  const [planEntries, setPlanEntries] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [openActivity, setOpenActivity] = useState(null);
  const [session, setSession] = useState(null);
  const [sessionExercise, setSessionExercise] = useState(null);

  const weekDays = useMemo(() => {
    const monday = mondayOfWeek(date);
    return DAY_ORDER.map((key, i) => ({ key, date: shiftDateStr(monday, i) }));
  }, [date]);

  const refresh = useCallback(async () => {
    if (date === todayStr()) {
      await api.applyActivityPlanToLog(date);
    }
    const [types, logs, plan] = await Promise.all([api.getActivityTypes(), api.getActivities(date), api.getActivityPlan()]);
    setActivityTypes(types);
    setActivities(logs);
    setPlanEntries(plan.entries);
    const dayKey = isoDayKey(date);
    setRecurringKeys(
      new Set(
        plan.entries
          .filter((e) => e.day === dayKey)
          .map((e) => `${e.type}-${e.duration_minutes}`)
      )
    );
  }, [date]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(weekDays.map((d) => api.getActivities(d.date).then((logs) => [d.date, logs.length > 0]))).then(
      (pairs) => {
        if (cancelled) return;
        setWeekPresence((prev) => {
          const next = Object.fromEntries(pairs);
          for (const d of weekDays) {
            const dayKey = isoDayKey(d.date);
            if (planEntries.some((e) => e.day === dayKey)) next[d.date] = true;
          }
          return next;
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [weekDays, planEntries]);

  const totalKcal = activities.reduce((s, a) => s + a.kcal, 0);
  const totalMin = activities.reduce((s, a) => s + a.duration_minutes, 0);

  async function handleDelete(id) {
    await api.deleteActivity(id);
    await refresh();
  }

  const dateSubtitle = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

  const WEEKDAY_LETTERS =
    lang === 'en'
      ? { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' }
      : { mon: 'L', tue: 'M', wed: 'M', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };

  if (sessionExercise) {
    return (
      <ExerciseSession
        exercise={sessionExercise}
        onBack={() => setSessionExercise(null)}
        onComplete={(id) => {
          setSession((s) => ({ ...s, doneIds: new Set([...s.doneIds, id]) }));
          setSessionExercise(null);
        }}
      />
    );
  }

  if (session) {
    return (
      <ActivitySession
        activity={session.activity}
        exercises={session.exercises}
        doneExerciseIds={session.doneIds}
        onOpenExercise={setSessionExercise}
        onExit={() => {
          setSession(null);
          refresh();
        }}
      />
    );
  }

  if (openActivity) {
    const recurringDays = planEntries
      .filter((e) => e.type === openActivity.type && e.duration_minutes === openActivity.duration_minutes)
      .map((e) => e.day);
    return (
      <ActivityDetail
        activity={openActivity}
        recurringDays={recurringDays}
        onBack={() => setOpenActivity(null)}
        onStart={(exercises) => {
          setSession({ activity: openActivity, exercises, doneIds: new Set() });
          setOpenActivity(null);
        }}
        onDeleted={() => {
          setOpenActivity(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div>
      <header className="app-header activites-header">
        <div>
          <p className="day-nav-subtitle" style={{ margin: 0 }}>
            {dateSubtitle}
          </p>
          <h1>{t('nav.activities')}</h1>
        </div>
        <div className="activites-header-nav">
          <button type="button" className="meal-detail-back-btn" onClick={() => setDate((d) => shiftDateStr(d, -1))} aria-label={t('home.prevDay')}>
            <Icon name="chevron-left" size={20} />
          </button>
          <button type="button" className="meal-detail-back-btn" onClick={() => setDate((d) => shiftDateStr(d, 1))} aria-label={t('home.nextDay')}>
            <Icon name="chevron-right" size={20} />
          </button>
        </div>
      </header>

      <div className="activites-burn-card">
        <span className="activites-burn-icon">
          <Icon name="flame" size={27} />
        </span>
        <div>
          <div className="activites-burn-value">
            {Math.round(totalKcal)} <span>{t('activityLog.kcalBurned')}</span>
          </div>
          <div className="activites-burn-sub">
            {t('activityLog.summaryLine').replace('{count}', activities.length).replace('{min}', totalMin)}
          </div>
        </div>
      </div>

      <div className="activites-week-card">
        <div className="activites-week-row">
          {weekDays.map((d) => (
            <button
              type="button"
              key={d.key}
              className={d.date === date ? 'activites-week-day active' : 'activites-week-day'}
              onClick={() => setDate(d.date)}
            >
              <span className="activites-week-letter">{WEEKDAY_LETTERS[d.key]}</span>
              <span className="activites-week-number">{Number(d.date.slice(8, 10))}</span>
              <i className={weekPresence[d.date] ? 'activites-week-dot' : 'activites-week-dot empty'} />
            </button>
          ))}
        </div>
      </div>

      <h2>{t('activityLog.today')}</h2>
      <div className="meal-card-list">
        {activities.length === 0 && <p className="hint">{t('activityLog.none')}</p>}
        {activities.map((a) => (
          <div
            className={a.type === 'force' ? 'activites-row clickable' : 'activites-row'}
            key={a.id}
            onClick={() => a.type === 'force' && setOpenActivity(a)}
          >
            <span className="activites-row-icon">
              <Icon name={iconForType(a.type)} size={21} />
            </span>
            <div className="meal-card-body">
              <div className="meal-card-title">
                {a.label || (activityTypes.some((at) => at.type === a.type) ? t(`activityType.${a.type}`) : a.type)}
                {recurringKeys.has(`${a.type}-${a.duration_minutes}`) && (
                  <Icon name="repeat" size={14} color="var(--acc)" style={{ marginLeft: 6, verticalAlign: -2 }} />
                )}
              </div>
              <div className="meal-card-kcal">{a.duration_minutes} min</div>
            </div>
            <b className="activites-row-kcal">{Math.round(a.kcal)} kcal</b>
            {a.type === 'force' && <Icon name="chevron-right" size={16} color="var(--text-muted)" />}
            <button
              type="button"
              className="activites-row-delete"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(a.id);
              }}
              aria-label={t('activityLog.delete')}
            >
              <Icon name="trash-2" size={17} />
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="meal-add-cta" onClick={() => setShowAdd(true)}>
        <Icon name="plus" size={20} />
        {t('activityLog.addActivity')}
      </button>

      {showAdd && (
        <AddActivityModal
          activityTypes={activityTypes}
          date={date}
          todayDayKey={isoDayKey(date)}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
