import { useEffect, useState } from 'react';
import { api } from '../api';
import { useLanguage } from '../i18n/LanguageContext';
import Icon from './Icon';

const GOAL_KEYS = ['lose', 'maintain', 'gain'];
const SEX_KEYS = ['male', 'female', 'other'];
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const STEPS = ['goal', 'profile', 'training', 'result'];

const MACRO_PRESETS = [
  { key: 'balanced', protein: 30, carbs: 35 },
  { key: 'highProtein', protein: 40, carbs: 30 },
  { key: 'lowCarb', protein: 35, carbs: 15 },
];

function iconForActivity(type) {
  if (type === 'force') return 'dumbbell';
  if (type === 'velo_ville') return 'bike';
  if (type === 'stepper') return 'footprints';
  if (type?.startsWith('marche')) return 'footprints';
  return 'activity';
}

// Spreads N sessions/week as evenly as possible across the 7 plan-days (e.g. 3 -> mon/wed/sat).
function distributeDays(frequency) {
  const f = Math.max(1, Math.min(7, Math.round(frequency)));
  if (f >= 7) return [...DAY_ORDER];
  const step = 7 / f;
  const days = new Set();
  for (let i = 0; i < f; i++) days.add(DAY_ORDER[Math.round(i * step) % 7]);
  return [...days];
}

// Mifflin-St Jeor — the standard, widely-used BMR estimate from sex/weight/height/age.
function estimateBmr(sex, weightKg, heightCm, age) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === 'male') return base + 5;
  if (sex === 'female') return base - 161;
  return base - 78; // 'other' — midpoint of the male/female offsets
}

export default function Onboarding({ onDone }) {
  const { t, lang } = useLanguage();
  const [step, setStep] = useState('goal');
  const [activityTypes, setActivityTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { targetIntake, macros: {protein,carbs,fat} }
  const [showMacros, setShowMacros] = useState(false);

  // --- step 1: goal ---
  const [goalType, setGoalType] = useState('lose');

  // --- step 2: profile ---
  const [sex, setSex] = useState('male');
  const [age, setAge] = useState(29);
  const [heightCm, setHeightCm] = useState(175);
  const [weightKg, setWeightKg] = useState(75);
  const [targetWeightKg, setTargetWeightKg] = useState(70);
  const [stepsPerDay, setStepsPerDay] = useState(7500);

  // --- step 3: training ---
  const [workoutType, setWorkoutType] = useState('');
  const [workoutDuration, setWorkoutDuration] = useState(45);
  const [workoutFrequency, setWorkoutFrequency] = useState(3);
  const [workouts, setWorkouts] = useState([]);

  // --- macro split (used for the final target + the "Ajuster les macros" screen) ---
  const [proteinPct, setProteinPct] = useState(30);
  const [carbsPct, setCarbsPct] = useState(35);
  const fatPct = Math.max(0, 100 - proteinPct - carbsPct);

  useEffect(() => {
    api.getActivityTypes().then((types) => {
      setActivityTypes(types);
      if (types.length > 0) setWorkoutType(types[0].type);
    });
  }, []);

  const stepIndex = STEPS.indexOf(step);

  function addWorkout() {
    if (!workoutType) return;
    setWorkouts((w) => [...w, { type: workoutType, duration_minutes: workoutDuration, frequency: workoutFrequency }]);
  }

  function removeWorkout(index) {
    setWorkouts((w) => w.filter((_, i) => i !== index));
  }

  async function finishAndCompute() {
    setSaving(true);
    try {
      const bmr = Math.round(estimateBmr(sex, weightKg, heightCm, age));
      const stepsKcal = stepsPerDay * 0.04 * (weightKg / 70);
      const workoutsKcalPerDay = workouts.reduce((sum, w) => {
        const rate = activityTypes.find((a) => a.type === w.type)?.kcal_per_hour || 0;
        return sum + ((w.duration_minutes / 60) * rate * w.frequency) / 7;
      }, 0);
      const dailyMovementKcal = Math.round(stepsKcal + workoutsKcalPerDay);
      const digestionKcal = Math.round(bmr * 0.08);

      const birthdateGuess = new Date();
      birthdateGuess.setUTCFullYear(birthdateGuess.getUTCFullYear() - Number(age));
      const birthdate = birthdateGuess.toISOString().slice(0, 10);

      await api.updateProfile({
        bmr,
        daily_movement_kcal: dailyMovementKcal,
        digestion_kcal: digestionKcal,
        goal: goalType,
        goal_kcal: 500,
        sex,
        birthdate,
        height_cm: Number(heightCm),
        weight_kg: Number(weightKg),
        target_weight_kg: Number(targetWeightKg),
        steps_per_day: Number(stepsPerDay),
        protein_pct: proteinPct,
        carbs_pct: carbsPct,
      });

      for (const w of workouts) {
        await api.addActivityPlan({
          days: distributeDays(w.frequency),
          type: w.type,
          duration_minutes: w.duration_minutes,
        });
      }

      const summary = await api.getSummary(new Date().toISOString().slice(0, 10));
      const targetIntake = summary.targetIntake;
      setResult({
        targetIntake,
        macros: {
          protein: Math.round((targetIntake * proteinPct) / 100 / 4),
          carbs: Math.round((targetIntake * carbsPct) / 100 / 4),
          fat: Math.round((targetIntake * fatPct) / 100 / 9),
        },
      });
      setStep('result');
    } finally {
      setSaving(false);
    }
  }

  // Re-saves just the macro split and recomputes the displayed grams — targetIntake itself
  // doesn't change (macros are a % of the same kcal budget).
  async function saveMacros() {
    setSaving(true);
    try {
      await api.updateProfile({ protein_pct: proteinPct, carbs_pct: carbsPct });
      setResult((r) => ({
        ...r,
        macros: {
          protein: Math.round((r.targetIntake * proteinPct) / 100 / 4),
          carbs: Math.round((r.targetIntake * carbsPct) / 100 / 4),
          fat: Math.round((r.targetIntake * fatPct) / 100 / 9),
        },
      }));
      setShowMacros(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleFinishOnboarding() {
    await api.completeOnboarding();
    onDone();
  }

  function Progress() {
    return (
      <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
        {STEPS.map((s, i) => (
          <span
            key={s}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 3,
              background: i <= stepIndex ? 'var(--gradient-brand)' : 'var(--ink-700, var(--border-subtle))',
            }}
          />
        ))}
      </div>
    );
  }

  // --- macro-adjust sub-screen ---
  if (showMacros && result) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="meal-detail-header">
            <button type="button" className="meal-detail-back-btn" onClick={() => setShowMacros(false)} aria-label={t('meal.back')}>
              <Icon name="chevron-left" size={20} />
            </button>
            <div className="meal-detail-heading">
              <div className="day-nav-subtitle">{t('onboarding.goalKcal').replace('{kcal}', Math.round(result.targetIntake))}</div>
              <div className="meal-detail-title">{t('onboarding.adjustMacros')}</div>
            </div>
          </div>

          <div className="filter-pill-row" style={{ marginTop: 0 }}>
            {MACRO_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={proteinPct === p.protein && carbsPct === p.carbs ? 'filter-pill active' : 'filter-pill'}
                onClick={() => {
                  setProteinPct(p.protein);
                  setCarbsPct(p.carbs);
                }}
              >
                {t(`onboarding.macroPreset.${p.key}`)}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
            {[
              { label: t('nutrient.protein'), color: 'var(--macro-protein)', pct: proteinPct, grams: Math.round((result.targetIntake * proteinPct) / 100 / 4) },
              { label: t('nutrient.carbs'), color: 'var(--macro-carb)', pct: carbsPct, grams: Math.round((result.targetIntake * carbsPct) / 100 / 4) },
              { label: t('nutrient.fat'), color: 'var(--macro-fat)', pct: fatPct, grams: Math.round((result.targetIntake * fatPct) / 100 / 9) },
            ].map((m) => (
              <div key={m.label}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 600 }}>
                    <i style={{ width: 10, height: 10, borderRadius: 3, background: m.color, display: 'inline-block' }} />
                    {m.label}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <b style={{ color: 'var(--text-primary)' }}>{m.grams} g</b> · {Math.round(m.pct)}%
                  </span>
                </div>
                <div style={{ position: 'relative', height: 8, borderRadius: 5, background: 'var(--ink-700, var(--border-subtle))' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, m.pct)}%`, borderRadius: 5, background: m.color }} />
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 18,
              padding: '16px 18px',
              marginTop: 22,
            }}
          >
            <div>
              <div className="hint" style={{ margin: 0 }}>{t('onboarding.totalMacros')}</div>
              <div className="weight-value" style={{ fontSize: 22 }}>
                {Math.round(result.targetIntake)} <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>kcal</span>
              </div>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: proteinPct + carbsPct <= 100 ? 'var(--success)' : 'var(--danger)' }}>
              <Icon name="circle-check" size={16} />
              {Math.round(proteinPct + carbsPct + fatPct)}%
            </span>
          </div>
        </div>
        <button type="button" className="done-btn done-btn-primary" onClick={(e) => { e.stopPropagation(); saveMacros(); }} disabled={saving}>
          <Icon name="check" size={20} />
          {saving ? t('addFood.saving') : t('meal.save')}
        </button>
      </div>
    );
  }

  // --- step 4: result ---
  if (step === 'result' && result) {
    return (
      <div className="modal-overlay">
        <div className="modal-content" style={{ textAlign: 'center' }}>
          <Progress />
          <span
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              background: 'var(--gradient-brand)',
              color: 'var(--text-on-accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--glow-accent)',
              marginBottom: 14,
            }}
          >
            <Icon name="party-popper" size={28} />
          </span>
          <div className="meal-detail-title" style={{ fontSize: 24 }}>{t('onboarding.planReadyTitle')}</div>
          <p className="hint" style={{ marginTop: 6 }}>{t('onboarding.planReadySub')}</p>

          <div className="settings-goal-card" style={{ marginTop: 18, textAlign: 'center' }}>
            <div className="section-label" style={{ margin: '0 0 4px' }}>{t('onboarding.dailyGoal')}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 700 }}>
              {Math.round(result.targetIntake).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')}{' '}
              <span style={{ fontSize: 15, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>kcal</span>
            </div>
            <div className="portion-tile-row" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              <div className="portion-tile">
                <b style={{ color: 'var(--macro-protein)' }}>{result.macros.protein}g</b>
                <span>{t('nutrient.protein')}</span>
              </div>
              <div className="portion-tile">
                <b style={{ color: 'var(--macro-carb)' }}>{result.macros.carbs}g</b>
                <span>{t('nutrient.carbs')}</span>
              </div>
              <div className="portion-tile">
                <b style={{ color: 'var(--macro-fat)' }}>{result.macros.fat}g</b>
                <span>{t('nutrient.fat')}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn-ghost btn-block"
            style={{ marginTop: 14 }}
            onClick={() => setShowMacros(true)}
          >
            {t('onboarding.adjustMacros')}
          </button>

          {goalType !== 'maintain' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'var(--accent-soft)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 16,
                padding: '14px 16px',
                marginTop: 14,
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  flex: 'none',
                  borderRadius: 11,
                  background: 'rgba(126,224,184,0.16)',
                  color: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="flag" size={19} />
              </span>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {t('onboarding.targetHint')
                  .replace('{weight}', targetWeightKg)
                  .replace('{pace}', '0.5')}
              </div>
            </div>
          )}
        </div>
        <button type="button" className="done-btn done-btn-primary" onClick={(e) => { e.stopPropagation(); handleFinishOnboarding(); }}>
          <Icon name="zap" size={20} />
          {t('onboarding.start')}
        </button>
      </div>
    );
  }

  // --- step 1: goal ---
  if (step === 'goal') {
    const GOAL_ICONS = { lose: 'trending-down', maintain: 'minus', gain: 'trending-up' };
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <Progress />
          <div className="meal-detail-title" style={{ fontSize: 24 }}>{t('onboarding.goalTitle')}</div>
          <p className="hint" style={{ marginTop: 4, marginBottom: 22 }}>{t('onboarding.goalSub')}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {GOAL_KEYS.map((g) => (
              <div
                key={g}
                className={goalType === g ? 'recurring-feature-row active' : 'recurring-feature-row'}
                onClick={() => setGoalType(g)}
              >
                <span className="recurring-feature-icon">
                  <Icon name={GOAL_ICONS[g]} size={22} />
                </span>
                <div className="recurring-feature-body">
                  <div className="recurring-feature-title" style={{ fontSize: 16 }}>{t(`settings.goalType.${g}`)}</div>
                  <div className="recurring-feature-desc">{t(`onboarding.goalDesc.${g}`)}</div>
                </div>
                <span className={goalType === g ? 'recurring-feature-check checked round' : 'recurring-feature-check round'}>
                  <Icon name="check" size={15} />
                </span>
              </div>
            ))}
          </div>
        </div>
        <button type="button" className="done-btn done-btn-primary" onClick={(e) => { e.stopPropagation(); setStep('profile'); }}>
          {t('onboarding.continue')}
          <Icon name="arrow-right" size={20} />
        </button>
      </div>
    );
  }

  // --- step 2: profile ---
  if (step === 'profile') {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <Progress />
          <div className="meal-detail-title" style={{ fontSize: 24 }}>{t('onboarding.profileTitle')}</div>
          <p className="hint" style={{ marginTop: 4, marginBottom: 18 }}>{t('onboarding.profileSub')}</p>

          <div className="type-list-row" style={{ margin: '0 0 16px' }}>
            {SEX_KEYS.map((s) => (
              <button key={s} type="button" className={sex === s ? 'type-pill active' : 'type-pill'} onClick={() => setSex(s)}>
                {t(`profile.sex.${s}`)}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="hint" style={{ padding: 0, marginBottom: 6 }}>{t('onboarding.age')}</div>
              <div className="search-input-row">
                <input type="number" min="10" max="100" className="search-input" style={{ textAlign: 'center' }} value={age} onChange={(e) => setAge(e.target.value)} />
                <span className="unit">{t('onboarding.years')}</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="hint" style={{ padding: 0, marginBottom: 6 }}>{t('profile.height')}</div>
              <div className="search-input-row">
                <input type="number" min="0" className="search-input" style={{ textAlign: 'center' }} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
                <span className="unit">cm</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="hint" style={{ padding: 0, marginBottom: 6 }}>{t('profile.weight')}</div>
              <div className="search-input-row">
                <input type="number" min="0" step="0.1" className="search-input" style={{ textAlign: 'center' }} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
                <span className="unit">kg</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="hint" style={{ padding: 0, marginBottom: 6 }}>{t('onboarding.targetWeight')}</div>
              <div className="search-input-row">
                <input type="number" min="0" step="0.1" className="search-input" style={{ textAlign: 'center' }} value={targetWeightKg} onChange={(e) => setTargetWeightKg(e.target.value)} />
                <span className="unit">kg</span>
              </div>
            </div>
          </div>

          <div className="hint" style={{ padding: 0, marginBottom: 6 }}>{t('onboarding.stepsPerDay')}</div>
          <div className="search-input-row">
            <Icon name="footprints" size={18} color="var(--text-muted)" />
            <input type="number" min="0" step="100" className="search-input" value={stepsPerDay} onChange={(e) => setStepsPerDay(e.target.value)} />
            <span className="unit">{t('onboarding.steps')}</span>
          </div>
        </div>
        <button type="button" className="done-btn done-btn-primary" onClick={(e) => { e.stopPropagation(); setStep('training'); }}>
          {t('onboarding.continue')}
          <Icon name="arrow-right" size={20} />
        </button>
      </div>
    );
  }

  // --- step 3: training ---
  const durationOptions = [15, 30, 45, 60, 75, 90];
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <Progress />
        <div className="meal-detail-title" style={{ fontSize: 24 }}>{t('onboarding.trainingTitle')}</div>
        <p className="hint" style={{ marginTop: 4, marginBottom: 18 }}>{t('onboarding.trainingSub')}</p>

        <h4 className="section-label" style={{ marginTop: 0 }}>{t('onboarding.sessionType')}</h4>
        <div className="search-input-row" style={{ height: 52 }}>
          <span className="entry-icon-btn" style={{ border: 0, background: 'var(--gradient-brand)', color: 'var(--text-on-accent)' }}>
            <Icon name={iconForActivity(workoutType)} size={17} />
          </span>
          <select
            value={workoutType}
            onChange={(e) => setWorkoutType(e.target.value)}
            style={{ flex: 1, background: 'none', border: 0, fontSize: 15, fontWeight: 600 }}
          >
            {activityTypes.map((a) => (
              <option key={a.type} value={a.type}>{t(`activityType.${a.type}`)}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="hint" style={{ padding: 0, marginBottom: 6 }}>{t('onboarding.duration')}</div>
            <div className="qty-stepper-row">
              <button type="button" className="weight-minus-btn" onClick={() => setWorkoutDuration((d) => Math.max(5, d - 15))}>
                <Icon name="minus" size={15} />
              </button>
              <div className="qty-stepper-value">
                <span className="weight-value" style={{ fontSize: 16 }}>{workoutDuration}</span> <span className="rate">min</span>
              </div>
              <button type="button" className="weight-plus-btn qty-stepper-plus" onClick={() => setWorkoutDuration((d) => Math.min(180, d + 15))}>
                <Icon name="plus" size={15} />
              </button>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="hint" style={{ padding: 0, marginBottom: 6 }}>{t('onboarding.perWeek')}</div>
            <div className="qty-stepper-row">
              <button type="button" className="weight-minus-btn" onClick={() => setWorkoutFrequency((f) => Math.max(1, f - 1))}>
                <Icon name="minus" size={15} />
              </button>
              <div className="qty-stepper-value">
                <span className="weight-value" style={{ fontSize: 16 }}>{workoutFrequency}</span> <span className="rate">×</span>
              </div>
              <button type="button" className="weight-plus-btn qty-stepper-plus" onClick={() => setWorkoutFrequency((f) => Math.min(7, f + 1))}>
                <Icon name="plus" size={15} />
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="recurring-feature-row"
          style={{ justifyContent: 'center', width: '100%', marginTop: 16, font: 'inherit', color: 'var(--acc)', background: 'var(--accent-soft)', borderColor: 'var(--acc)' }}
          onClick={addWorkout}
        >
          <Icon name="plus" size={19} />
          <span className="recurring-feature-title" style={{ color: 'var(--acc)' }}>{t('onboarding.add')}</span>
        </button>

        {workouts.length > 0 && (
          <>
            <h4 className="section-label">
              {t('onboarding.added')} · {workouts.length}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {workouts.map((w, i) => (
                <div className="entry-card" key={i}>
                  <span className="entry-icon-btn" style={{ border: 0, background: 'var(--accent-soft)', color: 'var(--acc)' }}>
                    <Icon name={iconForActivity(w.type)} size={19} />
                  </span>
                  <div className="entry-card-body">
                    <div className="entry-card-name">{t(`activityType.${w.type}`)}</div>
                    <div className="entry-card-sub">
                      {w.duration_minutes} min · {w.frequency}×/{t('onboarding.week')}
                    </div>
                  </div>
                  <button type="button" className="entry-icon-btn" onClick={() => removeWorkout(i)} aria-label={t('planner.remove')}>
                    <Icon name="x" size={16} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <button type="button" className="done-btn done-btn-primary" disabled={saving} onClick={(e) => { e.stopPropagation(); finishAndCompute(); }}>
        {saving ? t('addFood.saving') : t('onboarding.continue')}
        {!saving && <Icon name="arrow-right" size={20} />}
      </button>
    </div>
  );
}
