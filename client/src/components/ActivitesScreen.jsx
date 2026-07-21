import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import Icon from './Icon';
import ActivityDetail from './ActivityDetail';
import ActivitySession from './ActivitySession';
import ExerciseSession from './ExerciseSession';
import AddActivityModal from './AddActivityModal';
import PlanGroupModal from './PlanGroupModal';
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

// Data (activityTypes/activities/planEntries/date) is owned by App.jsx and passed in as props —
// same pattern as the Journal dashboard — so switching tabs and back doesn't remount this
// component's state to empty and flash "0 kcal" while it refetches from scratch.
export default function ActivitesScreen({ date, onDateChange, activityTypes, activities, planEntries, onRefresh }) {
  const { t, lang } = useLanguage();
  const [weekPresence, setWeekPresence] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [openActivity, setOpenActivity] = useState(null);
  const [session, setSession] = useState(null);
  const [sessionExercise, setSessionExercise] = useState(null);
  const [openPlanGroup, setOpenPlanGroup] = useState(null);
  const refresh = onRefresh;

  const weekDays = useMemo(() => {
    const monday = mondayOfWeek(date);
    return DAY_ORDER.map((key, i) => ({ key, date: shiftDateStr(monday, i) }));
  }, [date]);

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

  // A recurring plan entry only becomes a real activity_logs row once its day is actually
  // "today" (see refresh()). For any other date (future, or a past day the user never opened
  // the app on), show it here as an editable preview so the recurrence is still visible and can
  // still be renamed, rescheduled, or removed before it ever materializes. Grouped by group_id
  // (not one row per plan entry) since a group can have several day-rows.
  const loggedGroupIds = new Set(activities.filter((a) => a.plan_group_id).map((a) => a.plan_group_id));
  const scheduledGroups = [];
  const seenGroupIds = new Set();
  for (const e of planEntries) {
    if (e.day !== isoDayKey(date) || loggedGroupIds.has(e.group_id) || seenGroupIds.has(e.group_id)) continue;
    seenGroupIds.add(e.group_id);
    scheduledGroups.push({
      groupId: e.group_id,
      type: e.type,
      duration_minutes: e.duration_minutes,
      label: e.label,
      days: planEntries.filter((p) => p.group_id === e.group_id).map((p) => p.day),
    });
  }

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
    const exIndex = session.exercises.findIndex((e) => e.id === sessionExercise.id);
    return (
      <ExerciseSession
        exercise={sessionExercise}
        activityLabel={session.activity.label || t(`activityType.${session.activity.type}`)}
        index={exIndex + 1}
        total={session.exercises.length}
        onBack={() => setSessionExercise(null)}
        onComplete={(id) => {
          setSession((s) => ({ ...s, doneIds: new Set([...s.doneIds, id]) }));
          setSessionExercise(null);
        }}
        onUpdateExercise={(id, patch) => {
          setSession((s) => ({
            ...s,
            exercises: s.exercises.map((e) => (e.id === id ? { ...e, ...patch } : e)),
          }));
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
    const recurringDays = openActivity.plan_group_id
      ? planEntries.filter((e) => e.group_id === openActivity.plan_group_id).map((e) => e.day)
      : [];
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
        onUpdated={refresh}
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
          <button type="button" className="meal-detail-back-btn" onClick={() => onDateChange(shiftDateStr(date, -1))} aria-label={t('home.prevDay')}>
            <Icon name="chevron-left" size={20} />
          </button>
          <button type="button" className="meal-detail-back-btn" onClick={() => onDateChange(shiftDateStr(date, 1))} aria-label={t('home.nextDay')}>
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
              onClick={() => onDateChange(d.date)}
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
        {activities.length === 0 && scheduledGroups.length === 0 && <p className="hint">{t('activityLog.none')}</p>}
        {scheduledGroups.map((g) => {
          const at = activityTypes.find((t2) => t2.type === g.type);
          const kcal = at ? Math.round(at.kcal_per_hour * (g.duration_minutes / 60)) : null;
          return (
            <div
              className="activites-row clickable"
              key={`plan-${g.groupId}`}
              style={{ opacity: 0.7 }}
              onClick={() => setOpenPlanGroup(g)}
            >
              <span className="activites-row-icon">
                <Icon name={iconForType(g.type)} size={21} />
              </span>
              <div className="meal-card-body">
                <div className="meal-card-title">
                  {g.label || t(`activityType.${g.type}`)}
                  <Icon name="repeat" size={14} color="var(--acc)" style={{ marginLeft: 6, verticalAlign: -2 }} />
                </div>
                <div className="meal-card-kcal">
                  {g.duration_minutes} min · {t('activityLog.scheduled')}
                </div>
              </div>
              {kcal != null && <b className="activites-row-kcal">≈ {kcal} kcal</b>}
              <Icon name="chevron-right" size={16} color="var(--text-muted)" />
            </div>
          );
        })}
        {activities.map((a) => (
          <div
            className="activites-row clickable"
            key={a.id}
            onClick={() => setOpenActivity(a)}
          >
            <span className="activites-row-icon">
              <Icon name={iconForType(a.type)} size={21} />
            </span>
            <div className="meal-card-body">
              <div className="meal-card-title">
                {a.label || (activityTypes.some((at) => at.type === a.type) ? t(`activityType.${a.type}`) : a.type)}
                {a.plan_group_id && (
                  <Icon name="repeat" size={14} color="var(--acc)" style={{ marginLeft: 6, verticalAlign: -2 }} />
                )}
              </div>
              <div className="meal-card-kcal">{a.duration_minutes} min</div>
            </div>
            <b className="activites-row-kcal">{Math.round(a.kcal)} kcal</b>
            <Icon name="chevron-right" size={16} color="var(--text-muted)" />
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

      <button type="button" className="meal-add-cta" style={{ marginTop: 18 }} onClick={() => setShowAdd(true)}>
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

      {openPlanGroup && (
        <PlanGroupModal
          group={openPlanGroup}
          onClose={() => setOpenPlanGroup(null)}
          onSaved={() => {
            setOpenPlanGroup(null);
            refresh();
          }}
          onDeleted={() => {
            setOpenPlanGroup(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
