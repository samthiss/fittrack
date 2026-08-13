import { useState, useEffect, useReducer } from 'react';
import { api } from '../api';
import Icon from './Icon';
import ExerciseHistory from './ExerciseHistory';
import { useLanguage } from '../i18n/LanguageContext';
import { REP_RANGE_OPTIONS, REST_STEP_SECONDS, restSecondsFor } from '../data/restTargets';
import { computeRestLeft, formatClock } from '../data/sessionTiming';

const WEIGHT_STEP_OPTIONS = [1.25, 2.5, 5];
const WEIGHT_STEP_STORAGE_KEY = 'fittrack_weight_step';

// Same fixed rep-range choices as the set-target picker elsewhere (ActivityDetail,
// WorkoutTemplateEditor, ActivitySession) — quick-editing reps mid-session picks from the same
// vocabulary instead of free-stepping an arbitrary number, and it's what the per-range rest
// setting is keyed on.
const REP_CHOICE_OPTIONS = REP_RANGE_OPTIONS;
function repChoiceToNumber(opt) {
  if (opt === 'Max') return 1;
  return parseInt(opt, 10);
}
// Highlights whichever choice the current numeric reps value came from (falls inside the range,
// or Max for the 1-rep placeholder) — reps itself stays a plain number under the hood.
function repChoiceMatches(opt, value) {
  if (opt === 'Max') return value === 1;
  const [lo, hi] = opt.split('-').map(Number);
  return value >= lo && value <= hi;
}
// A per-set target is "5-9" / "5-9↑" / "5-9↓" — this strips the arrow to match it back to one
// of REP_CHOICE_OPTIONS, and the pair below re-attaches whatever arrow it had after editing.
function stripArrow(target) {
  return (target || '').replace(/[↑↓]$/, '');
}
function arrowOf(target) {
  const m = /[↑↓]$/.exec(target || '');
  return m ? m[0] : '';
}

const formatRest = formatClock;

// "mar. 5 août" — a past session is placed by its day, not by how long ago it was.
function formatSessionDate(dateStr, lang) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${dateStr}T00:00:00Z`));
}

function RestRing({ restLeft, restTarget, size = 176 }) {
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = restTarget > 0 ? Math.min(1, Math.max(0, restLeft) / restTarget) : 0;
  const offset = circumference * (1 - ratio);
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="gauge">
      <defs>
        <linearGradient id="restRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
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
        stroke="url(#restRingGrad)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: 'stroke-dashoffset 300ms linear' }}
      />
    </svg>
  );
}

export default function ExerciseSession({ exercise, activityLabel, index, total, restByReps, progress, onProgressChange, onBack, onComplete, onUpdateExercise }) {
  const { t, lang } = useLanguage();
  // The last time this movement was done, excluding the session in progress so an exercise never
  // compares against itself. By name, so it spans every past workout rather than this one's row.
  const [lastSession, setLastSession] = useState(null);
  const [recordBanner, setRecordBanner] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  // Clears itself: the banner belongs to the set that just earned it, not to the rest of the
  // exercise. Every record makes a new object, so a second one during the same exercise restarts
  // the countdown rather than inheriting what was left of the first.
  useEffect(() => {
    if (!recordBanner) return undefined;
    const id = setTimeout(() => setRecordBanner(null), 6000);
    return () => clearTimeout(id);
  }, [recordBanner]);

  useEffect(() => {
    let cancelled = false;
    api
      .getExerciseHistory(exercise.name, { excludeActivityId: exercise.activity_log_id, limit: 1 })
      .then((history) => {
        if (!cancelled) setLastSession(history.sessions[0] ?? null);
      })
      .catch(() => {
        // No history to show is the normal state for a new exercise; a failed lookup is the same
        // from the screen's point of view.
      });
    return () => {
      cancelled = true;
    };
  }, [exercise.name, exercise.activity_log_id]);
  const initialRest = restSecondsFor(restByReps, { setTarget: exercise.set_targets?.[0], reps: exercise.reps });
  // Everything about how far into the exercise we are — the rest countdown included — is held by
  // the parent and passed back in, so backing out to the exercise list (which unmounts this
  // screen) doesn't wipe it. Absent progress means the exercise hasn't been started yet.
  //   completedSets/setHistory: sets done so far, and the weight/reps each was validated with,
  //     frozen at that moment — adjusting the weight pill afterward must only affect the
  //     current/upcoming sets, not rewrite history for sets already done.
  //   restRemainingFrozen: remaining seconds as of restStartedAt (or the frozen value itself while
  //     paused/idle); the displayed value is computeRestLeft(...), recomputed live from Date.now().
  //   restOverridden: set once the user edits the rest time by hand mid-exercise — from then on
  //     the per-rep-range setting stops overwriting it, so a deliberate choice isn't undone by
  //     moving to the next set.
  const freshProgress = {
    completedSets: 0,
    setHistory: [],
    resting: false,
    restPaused: false,
    restTarget: initialRest,
    restRemainingFrozen: initialRest,
    restStartedAt: null,
    restOverridden: false,
  };
  const { completedSets, setHistory, resting, restPaused, restTarget, restRemainingFrozen, restStartedAt, restOverridden } =
    progress ?? freshProgress;
  // Patches merge onto the *latest* progress, not onto this render's copy: the rest-countdown
  // interval below outlives renders, so a patch it fires at 0:00 would otherwise write back
  // whatever setHistory/completedSets it captured when the interval was created — silently undoing
  // a set edited while the rest was running.
  function updateProgress(patch) {
    onProgressChange(exercise.id, (prev) => ({ ...(prev ?? freshProgress), ...patch }));
  }
  const [, forceRender] = useReducer((x) => x + 1, 0);
  const restLeft = computeRestLeft({ resting, restPaused, restTarget, restRemainingFrozen, restStartedAt });
  const [sets, setSets] = useState(exercise.sets);
  const [weight, setWeight] = useState(exercise.weight_kg ?? 0);
  const [reps, setReps] = useState(exercise.reps);
  // The `exercise` prop is a one-time snapshot from the parent (never refreshed while this screen
  // stays open) — sets/weight/reps already had their own local state for this reason; set_targets
  // needs the same treatment so editing a set's target actually updates what's on screen.
  const [setTargets, setSetTargetsState] = useState(exercise.set_targets || null);
  const [sheet, setSheet] = useState(null); // null | 'sets' | 'weight' | 'reps' | 'rest' | 'doneSet'
  // Which already-validated set the 'doneSet' sheet is editing — a set can be misremembered or
  // mis-tapped, and the row is the natural place to fix it after the fact.
  const [editingSetIndex, setEditingSetIndex] = useState(null);
  const [sheetSets, setSheetSets] = useState(exercise.sets);
  const [sheetReps, setSheetReps] = useState(exercise.reps);
  // Which rep-choice pill is highlighted — tracked directly instead of inferred from sheetReps
  // (range-matching a number back to a pill was fragile: overlapping ranges like "5-9"/"8-12"
  // could both/neither match depending on the value).
  const [sheetRepsChoice, setSheetRepsChoice] = useState(null);
  const [sheetWeight, setSheetWeight] = useState(exercise.weight_kg ?? 0);
  const [sheetRestTarget, setSheetRestTarget] = useState(initialRest);
  // How much the weight +/- buttons move by — a personal preference, kept on the device rather
  // than round-tripping through the server for something this minor.
  const [weightStep, setWeightStep] = useState(() => Number(localStorage.getItem(WEIGHT_STEP_STORAGE_KEY)) || 2.5);
  function chooseWeightStep(step) {
    setWeightStep(step);
    localStorage.setItem(WEIGHT_STEP_STORAGE_KEY, String(step));
  }

  useEffect(() => {
    if (!resting || restPaused || !restStartedAt) return undefined;
    function tick() {
      const left = computeRestLeft({ resting, restPaused, restTarget, restRemainingFrozen, restStartedAt });
      if (left <= 0) {
        updateProgress({ resting: false });
      } else {
        forceRender();
      }
    }
    // Tick once on mount too: coming back from the exercise list, the rest may well have run out
    // while this screen was unmounted, and waiting a full second to notice would show a live-looking
    // 0:00.
    tick();
    const id = setInterval(tick, 1000);
    function onVisible() {
      if (document.visibilityState === 'visible') tick();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [resting, restPaused, restStartedAt, restTarget, restRemainingFrozen]);

  // Rest configured for the set about to be done (Réglages > Temps de repos). Applied only while
  // idle: the countdown that follows a set belongs to the set just finished, so re-targeting it
  // mid-rest would move the goalposts (and the ring) under a running timer.
  const autoRest = restSecondsFor(restByReps, { setTarget: setTargets?.[completedSets], reps });
  useEffect(() => {
    if (resting || restOverridden || autoRest === restTarget) return;
    updateProgress({ restTarget: autoRest, restRemainingFrozen: autoRest });
  }, [autoRest, resting, restOverridden, restTarget]);

  function persist(patch) {
    api.updateActivityExercise(exercise.id, patch).catch(() => {});
    onUpdateExercise?.(exercise.id, patch);
  }

  // What was actually lifted, sent as each set is validated (and again if it's corrected
  // afterwards — the route overwrites by set index). Fire-and-forget like the rest of this
  // screen's writes: setHistory is already kept locally and survives a restart via localStorage,
  // so a failed request costs the long-term record, never the session in progress.
  function recordSet(setIndex, entry) {
    api
      .saveExerciseSet(exercise.id, setIndex, { weight_kg: entry.weight, reps: entry.reps })
      .then((saved) => {
        // The server compares the set against every other set of this movement and says whether it
        // beat anything. Worth showing only right now, while the user is still at the bar — so it
        // appears as a banner that clears itself rather than as a permanent mark on the row.
        if (saved?.achieved?.length > 0) setRecordBanner({ kinds: saved.achieved });
      })
      .catch(() => {});
  }

  function validateSet() {
    const next = completedSets + 1;
    const nextHistory = [...setHistory, { weight, reps }];
    recordSet(completedSets, { weight, reps });
    if (next >= sets) {
      updateProgress({ completedSets: next, setHistory: nextHistory, resting: false });
      onComplete(exercise.id);
      return;
    }
    updateProgress({
      completedSets: next,
      setHistory: nextHistory,
      restRemainingFrozen: restTarget,
      restStartedAt: Date.now(),
      restPaused: false,
      resting: true,
    });
  }

  function openSheet(name) {
    setSheetSets(sets);
    // With a per-set scheme, "reps" here edits the CURRENT set's own target (what's actually
    // shown on that set's row) rather than the flat exercise-wide reps number, which had nothing
    // to do with what any individual row displayed.
    const currentTarget = setTargets?.[completedSets];
    if (currentTarget) {
      setSheetReps(reps);
      setSheetRepsChoice(REP_CHOICE_OPTIONS.find((o) => o === stripArrow(currentTarget)) ?? null);
    } else {
      setSheetReps(reps);
      setSheetRepsChoice(REP_CHOICE_OPTIONS.find((o) => repChoiceMatches(o, reps)) ?? null);
    }
    setSheetWeight(weight);
    setSheetRestTarget(restTarget);
    setSheet(name);
  }

  // Editing a set that's already been validated. Seeded from what that set actually recorded
  // (setHistory), not from the current weight/reps — the whole point of freezing history is that
  // the two can differ.
  function openDoneSetSheet(i) {
    const done = setHistory[i] || { weight, reps };
    setEditingSetIndex(i);
    setSheetWeight(done.weight);
    setSheetReps(done.reps);
    setSheet('doneSet');
  }

  // Rewrites that one row of history and nothing else: not the exercise's current weight/reps, not
  // the other sets. The correction goes to the server too, over the set it's fixing.
  function confirmDoneSet() {
    const kg = Number(sheetWeight) || 0;
    updateProgress({
      setHistory: setHistory.map((entry, i) => (i === editingSetIndex ? { weight: kg, reps: sheetReps } : entry)),
    });
    recordSet(editingSetIndex, { weight: kg, reps: sheetReps });
    setEditingSetIndex(null);
    setSheet(null);
  }

  function confirmRestTarget() {
    updateProgress({
      restTarget: sheetRestTarget,
      restOverridden: true,
      ...(resting ? {} : { restRemainingFrozen: sheetRestTarget }),
    });
    setSheet(null);
  }

  function confirmSets() {
    setSets(sheetSets);
    persist({ sets: sheetSets });
    setSheet(null);
  }

  function confirmReps() {
    setReps(sheetReps);
    if (setTargets?.[completedSets] && sheetRepsChoice) {
      const nextTargets = setTargets.map((target, i) =>
        i === completedSets ? `${sheetRepsChoice}${arrowOf(target)}` : target
      );
      setSetTargetsState(nextTargets);
      persist({ reps: sheetReps, set_targets: nextTargets });
    } else {
      persist({ reps: sheetReps });
    }
    setSheet(null);
  }

  function confirmWeight() {
    const kg = Number(sheetWeight) || 0;
    setWeight(kg);
    persist({ weight_kg: kg });
    setSheet(null);
  }

  const currentSetNumber = Math.min(completedSets + 1, sets);

  return (
    <div>
      <div className="meal-detail-header">
        <button className="meal-detail-back-btn" onClick={onBack} aria-label={t('meal.back')}>
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="meal-detail-heading">
          <div className="day-nav-subtitle">
            {activityLabel} · {t('activityLog.exercise')} {index}/{total}
          </div>
          <div className="meal-detail-title">{exercise.name}</div>
        </div>
      </div>

      <div className="activity-session-timer-card">
        <span className="activity-session-timer-label">{t('activityLog.restTimer')}</span>
        <div className="activity-session-ring-wrap">
          <RestRing restLeft={restLeft} restTarget={restTarget} />
          <div className="activity-session-ring-center">
            <div className="activity-session-timer-value">{formatRest(restLeft)}</div>
            <span className="activity-session-timer-unit">{t('activityLog.restOf').replace('{time}', formatRest(restTarget))}</span>
          </div>
        </div>
        <div className="activity-session-timer-controls">
          <button
            type="button"
            className="weight-minus-btn"
            onClick={() => updateProgress({ restRemainingFrozen: restTarget, restStartedAt: restPaused ? null : Date.now() })}
            disabled={!resting}
            aria-label={t('activityLog.resetTimer')}
          >
            <Icon name="rotate-ccw" size={18} />
          </button>
          <button
            type="button"
            className="meal-add-cta"
            style={{ width: 'auto', padding: '13px 26px', opacity: resting ? 1 : 0.5 }}
            disabled={!resting}
            onClick={() => {
              if (restPaused) {
                updateProgress({ restStartedAt: Date.now(), restPaused: false });
              } else {
                updateProgress({ restRemainingFrozen: restLeft, restStartedAt: null, restPaused: true });
              }
            }}
          >
            <Icon name={restPaused ? 'play' : 'pause'} size={18} />
            {restPaused ? t('activityLog.resume') : t('activityLog.pause')}
          </button>
          <button type="button" className="weight-minus-btn" onClick={() => openSheet('rest')} aria-label={t('activityLog.editRestTime')}>
            <Icon name="pencil" size={16} />
          </button>
        </div>
        {resting && (
          <button type="button" className="btn-ghost" style={{ display: 'block', margin: '10px auto 0' }} onClick={() => updateProgress({ resting: false })}>
            {t('activityLog.skipRest')}
          </button>
        )}
      </div>

      <div style={{ marginTop: 4 }}>
        <div className="day-nav-subtitle" style={{ marginBottom: 8 }}>
          {t('activityLog.exerciseSettings')}
        </div>
        <div className="filter-pill-row" style={{ marginTop: 0 }}>
          <button type="button" className="filter-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => openSheet('sets')}>
            <Icon name="layers" size={14} />
            {sets} {t('activityLog.setsShort')}
          </button>
          <button type="button" className="filter-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => openSheet('weight')}>
            <Icon name="weight" size={14} />
            {weight} kg
          </button>
          <button type="button" className="filter-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => openSheet('reps')}>
            <Icon name="repeat-2" size={14} />
            {reps} {t('activityLog.repsShort')}
          </button>
        </div>
      </div>

      {/* The whole point of validating sets one at a time: knowing what the same movement went for
          last time, right where the next weight is chosen. Absent on the first ever session of an
          exercise, and never a placeholder — an empty line here would just be noise. */}
      {recordBanner && (
        <div className="strength-record-banner" role="status">
          <Icon name="trophy" size={16} />
          <span>
            {recordBanner.kinds.includes('top_weight')
              ? t('strength.newRecordWeight')
              : t('strength.newRecordEstimate')}
          </span>
        </div>
      )}

      {/* Tapping it opens the full history: the line answers "what did I do last time", and the
          next question it provokes is "and before that". */}
      {lastSession && (
        <button type="button" className="exercise-last-time" onClick={() => setShowHistory(true)}>
          <Icon name="history" size={13} />
          <span>
            <b>{t('activityLog.lastTime').replace('{date}', formatSessionDate(lastSession.date, lang))}</b>{' '}
            {lastSession.sets.map((s) => `${s.weight_kg ?? 0} kg × ${s.reps}`).join(' · ')}
          </span>
          <Icon name="chevron-right" size={14} />
        </button>
      )}

      {showHistory && <ExerciseHistory exerciseName={exercise.name} onClose={() => setShowHistory(false)} />}

      <div style={{ color: 'var(--success)', fontSize: 12, fontWeight: 700, margin: '10px 0 6px' }}>
        {t('activityLog.setsDoneCount').replace('{done}', completedSets).replace('{total}', sets)}
      </div>
      <div className="entry-list">
        {Array.from({ length: sets }).map((_, i) => {
          const done = i < completedSets;
          const current = i === completedSets;
          return (
            <div
              className={current ? 'entry-card activity-session-exercise current' : 'entry-card'}
              key={i}
              onClick={done ? () => openDoneSetSheet(i) : undefined}
              style={done ? { cursor: 'pointer' } : undefined}
            >
              <span className={done ? 'activity-session-exercise-check done' : 'activity-session-exercise-check'}>
                {done ? <Icon name="check" size={16} /> : i + 1}
              </span>
              <div className="entry-card-body" style={{ cursor: done ? 'pointer' : 'default' }}>
                <div className="entry-card-name">{t('activityLog.setLabel').replace('{n}', i + 1)}</div>
              </div>
              {done ? (
                <span className="activites-row-kcal" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {setHistory[i]?.weight ?? weight} kg × {setHistory[i]?.reps ?? reps}
                  <Icon name="pencil" size={13} color="var(--text-muted)" />
                </span>
              ) : setTargets?.[i] ? (
                <span className="activites-row-kcal">
                  {weight} kg / {setTargets[i]}
                </span>
              ) : (
                <span className="activites-row-kcal">
                  {weight} kg × {reps}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!resting && (
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" className="weight-minus-btn" onClick={() => onComplete(exercise.id)} aria-label={t('activityLog.skipExercise')}>
            <Icon name="skip-forward" size={18} />
          </button>
          <button type="button" className="meal-add-cta" style={{ flex: 1 }} onClick={validateSet}>
            <Icon name="check" size={20} />
            {t('activityLog.validateSet')}
          </button>
        </div>
      )}

      {sheet === 'doneSet' && (
        <div className="modal-overlay bottom-sheet-overlay" onClick={() => setSheet(null)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-header-row">
              <div className="bottom-sheet-title" style={{ margin: 0 }}>
                {t('activityLog.editDoneSetTitle').replace('{n}', (editingSetIndex ?? 0) + 1)}
              </div>
              <button type="button" className="bottom-sheet-save-link" onClick={confirmDoneSet}>
                {t('common.save')}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
              <button
                type="button"
                className="weight-minus-btn"
                onClick={() => setSheetWeight((w) => Math.max(0, Math.round((Number(w) - weightStep) * 100) / 100))}
              >
                <Icon name="minus" size={18} />
              </button>
              <div className="exercise-session-input-group" style={{ flex: 1, boxSizing: 'border-box' }}>
                <input type="number" min="0" step="0.5" value={sheetWeight} onChange={(e) => setSheetWeight(e.target.value)} style={{ width: '100%', textAlign: 'left' }} />
                <span>kg</span>
              </div>
              <button
                type="button"
                className="weight-plus-btn"
                onClick={() => setSheetWeight((w) => Math.round((Number(w) + weightStep) * 100) / 100)}
              >
                <Icon name="plus" size={18} />
              </button>
            </div>
            {/* A finished set recorded a real rep count, not a target range — so this steps a plain
                number rather than offering the REP_CHOICE_OPTIONS pills used for targets. */}
            <div className="day-nav-subtitle" style={{ marginTop: 18, marginBottom: 6 }}>
              {t('activityLog.reps')}
            </div>
            <div className="bottom-sheet-stepper">
              <button type="button" className="weight-minus-btn" onClick={() => setSheetReps((n) => Math.max(1, Number(n) - 1))}>
                <Icon name="minus" size={18} />
              </button>
              <span className="bottom-sheet-stepper-value">{sheetReps}</span>
              <button type="button" className="weight-plus-btn" onClick={() => setSheetReps((n) => Number(n) + 1)}>
                <Icon name="plus" size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet === 'rest' && (
        <div className="modal-overlay bottom-sheet-overlay" onClick={() => setSheet(null)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-title">{t('activityLog.editRestTime')}</div>
            <div className="bottom-sheet-stepper">
              <button type="button" className="weight-minus-btn" onClick={() => setSheetRestTarget((n) => Math.max(REST_STEP_SECONDS, n - REST_STEP_SECONDS))}>
                <Icon name="minus" size={18} />
              </button>
              <span className="bottom-sheet-stepper-value">{formatRest(sheetRestTarget)}</span>
              <button type="button" className="weight-plus-btn" onClick={() => setSheetRestTarget((n) => n + REST_STEP_SECONDS)}>
                <Icon name="plus" size={18} />
              </button>
            </div>
            <div className="bottom-sheet-actions">
              <button type="button" className="meal-add-cta meal-add-cta-white" style={{ flex: 1 }} onClick={() => setSheet(null)}>
                <Icon name="x" size={18} />
                {t('common.cancel')}
              </button>
              <button type="button" className="meal-add-cta" style={{ flex: 1 }} onClick={confirmRestTarget}>
                <Icon name="check" size={18} />
                {t('activityLog.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet === 'sets' && (
        <div className="modal-overlay bottom-sheet-overlay" onClick={() => setSheet(null)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-title">{t('activityLog.sets')}</div>
            <div className="bottom-sheet-stepper">
              <button type="button" className="weight-minus-btn" onClick={() => setSheetSets((n) => Math.max(1, n - 1))}>
                <Icon name="minus" size={18} />
              </button>
              <span className="bottom-sheet-stepper-value">{sheetSets}</span>
              <button type="button" className="weight-plus-btn" onClick={() => setSheetSets((n) => n + 1)}>
                <Icon name="plus" size={18} />
              </button>
            </div>
            <div className="bottom-sheet-actions">
              <button type="button" className="meal-add-cta meal-add-cta-white" style={{ flex: 1 }} onClick={() => setSheet(null)}>
                <Icon name="x" size={18} />
                {t('common.cancel')}
              </button>
              <button type="button" className="meal-add-cta" style={{ flex: 1 }} onClick={confirmSets}>
                <Icon name="check" size={18} />
                {t('activityLog.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet === 'reps' && (
        <div className="modal-overlay bottom-sheet-overlay" onClick={() => setSheet(null)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-title">{t('activityLog.reps')}</div>
            <div className="rep-choice-row">
              {REP_CHOICE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={opt === sheetRepsChoice ? 'rep-choice-pill active' : 'rep-choice-pill'}
                  onClick={() => {
                    setSheetRepsChoice(opt);
                    setSheetReps(repChoiceToNumber(opt));
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
            <div className="bottom-sheet-actions">
              <button type="button" className="meal-add-cta meal-add-cta-white" style={{ flex: 1 }} onClick={() => setSheet(null)}>
                <Icon name="x" size={18} />
                {t('common.cancel')}
              </button>
              <button type="button" className="meal-add-cta" style={{ flex: 1 }} onClick={confirmReps}>
                <Icon name="check" size={18} />
                {t('activityLog.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet === 'weight' && (
        <div className="modal-overlay bottom-sheet-overlay" onClick={() => setSheet(null)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-header-row">
              <div className="bottom-sheet-title" style={{ margin: 0 }}>
                {t('activityLog.editWeightTitle')}
              </div>
              <button type="button" className="bottom-sheet-save-link" onClick={confirmWeight}>
                {t('common.save')}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
              <button
                type="button"
                className="weight-minus-btn"
                onClick={() => setSheetWeight((w) => Math.max(0, Math.round((Number(w) - weightStep) * 100) / 100))}
              >
                <Icon name="minus" size={18} />
              </button>
              <div className="exercise-session-input-group" style={{ flex: 1, boxSizing: 'border-box' }}>
                <input type="number" min="0" step="0.5" value={sheetWeight} onChange={(e) => setSheetWeight(e.target.value)} style={{ width: '100%', textAlign: 'left' }} />
                <span>kg</span>
              </div>
              <button
                type="button"
                className="weight-plus-btn"
                onClick={() => setSheetWeight((w) => Math.round((Number(w) + weightStep) * 100) / 100)}
              >
                <Icon name="plus" size={18} />
              </button>
            </div>
            <div className="day-nav-subtitle" style={{ marginTop: 18, marginBottom: 6 }}>
              {t('activityLog.weightStep')}
            </div>
            <div className="filter-pill-row" style={{ marginTop: 0 }}>
              {WEIGHT_STEP_OPTIONS.map((step) => (
                <button
                  key={step}
                  type="button"
                  className={weightStep === step ? 'filter-pill active' : 'filter-pill'}
                  style={{ flex: 1, textAlign: 'center' }}
                  onClick={() => chooseWeightStep(step)}
                >
                  {step} kg
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
