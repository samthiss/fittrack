import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import Icon from './Icon';
import ActivityDetail from './ActivityDetail';
import ActivitySession from './ActivitySession';
import ExerciseSession from './ExerciseSession';
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
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState('');
  const [newDuration, setNewDuration] = useState(30);
  const [newRecurring, setNewRecurring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openActivity, setOpenActivity] = useState(null);
  const [session, setSession] = useState(null);
  const [sessionExercise, setSessionExercise] = useState(null);

  const weekDays = useMemo(() => {
    const monday = mondayOfWeek(date);
    return DAY_ORDER.map((key, i) => ({ key, date: shiftDateStr(monday, i) }));
  }, [date]);

  const refresh = useCallback(async () => {
    const [types, logs, plan] = await Promise.all([api.getActivityTypes(), api.getActivities(date), api.getActivityPlan()]);
    setActivityTypes(types);
    setActivities(logs);
    if (!newType && types.length > 0) setNewType(types[0].type);
    const dayKey = isoDayKey(date);
    setRecurringKeys(
      new Set(
        plan.entries
          .filter((e) => e.day === dayKey)
          .map((e) => `${e.type}-${e.duration_minutes}`)
      )
    );
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(weekDays.map((d) => api.getActivities(d.date).then((logs) => [d.date, logs.length > 0]))).then(
      (pairs) => {
        if (cancelled) return;
        setWeekPresence(Object.fromEntries(pairs));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [weekDays]);

  const totalKcal = activities.reduce((s, a) => s + a.kcal, 0);
  const totalMin = activities.reduce((s, a) => s + a.duration_minutes, 0);

  async function handleAdd() {
    if (!newType || !newDuration || saving) return;
    setSaving(true);
    try {
      await api.addActivity({ date, type: newType, duration_minutes: Number(newDuration) });
      if (newRecurring) {
        await api.addActivityPlan({ days: [isoDayKey(date)], type: newType, duration_minutes: Number(newDuration) });
      }
      setShowAdd(false);
      setNewDuration(30);
      setNewRecurring(false);
      await refresh();
    } finally {
      setSaving(false);
    }
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
    return (
      <ActivityDetail
        activity={openActivity}
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
                {activityTypes.some((at) => at.type === a.type) ? t(`activityType.${a.type}`) : a.type}
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
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{t('activityLog.addActivity')}</h2>
            <h4 className="section-label">{t('activityLog.activity')}</h4>
            <div className="type-list-row" style={{ flexWrap: 'wrap' }}>
              {activityTypes.map((at) => (
                <button
                  key={at.type}
                  type="button"
                  className={newType === at.type ? 'type-pill active' : 'type-pill'}
                  onClick={() => setNewType(at.type)}
                >
                  {t(`activityType.${at.type}`)}
                </button>
              ))}
            </div>

            <h4 className="section-label">{t('activityLog.duration')}</h4>
            <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
              <button type="button" className="weight-minus-btn" onClick={() => setNewDuration((d) => Math.max(5, d - 5))}>
                <Icon name="minus" size={18} />
              </button>
              <div style={{ textAlign: 'center', minWidth: 70 }}>
                <span className="weight-value">{newDuration}</span> <span className="rate">min</span>
              </div>
              <button type="button" className="weight-plus-btn" onClick={() => setNewDuration((d) => d + 5)}>
                <Icon name="plus" size={18} />
              </button>
            </div>

            <label className="recurring-toggle-row">
              <input type="checkbox" checked={newRecurring} onChange={(e) => setNewRecurring(e.target.checked)} />
              <span>{t('addFood.recurringMeal')}</span>
            </label>

            <button type="button" className="btn btn-block" onClick={handleAdd} disabled={saving}>
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
