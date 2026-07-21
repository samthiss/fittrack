import { useEffect, useState } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

const GOAL_KEYS = ['lose', 'maintain', 'gain'];
const PACE_OPTIONS = [500, 750, 1000];
const SEX_KEYS = ['male', 'female', 'other'];
const MEAL_ICONS = { breakfast: 'sunrise', lunch: 'utensils', dinner: 'moon' };
const SNACK_TIMES = ['morning', 'afternoon', 'evening'];

// profile.extra_snacks holds every en-cas customization: extra slots ({key:'snack_<n>', label,
// time}) and, optionally, an override entry for the base slot ({key:'snack', time, removed}) —
// the base slot can be given a time-of-day or removed entirely, same as any extra one.
function parseSnackConfig(profile) {
  let list = [];
  if (profile?.extra_snacks) {
    try {
      const parsed = JSON.parse(profile.extra_snacks);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const baseOverride = list.find((s) => s && s.key === 'snack');
  const extras = list.filter((s) => s && typeof s.key === 'string' && s.key.startsWith('snack_') && typeof s.label === 'string' && s.label.trim());
  const slots = [];
  if (!baseOverride?.removed) {
    slots.push({ key: 'snack', label: null, time: baseOverride?.time ?? null, isBase: true });
  }
  for (const s of extras) slots.push({ key: s.key, label: s.label, time: s.time ?? null, isBase: false });
  return slots; // every currently-active snack slot (base + extras), in insertion order
}

// breakfast, any 'morning' snacks, lunch, any 'afternoon' snacks, dinner, any 'evening' snacks,
// then any snacks left untagged — mirrors the server's mealsFor() ordering.
function orderedMealKeys(snacks) {
  const byTime = (time) => snacks.filter((s) => s.time === time).map((s) => s.key);
  return ['breakfast', ...byTime('morning'), 'lunch', ...byTime('afternoon'), 'dinner', ...byTime('evening'), ...byTime(null)];
}

function defaultShare(key, snackCount) {
  if (key === 'breakfast') return 0.15;
  if (key === 'lunch') return 0.35;
  if (key === 'dinner') return 0.45;
  return snackCount > 0 ? 0.05 / snackCount : 0;
}

function parseMealShares(profile, snacks) {
  const allKeys = ['breakfast', 'lunch', 'dinner', ...snacks.map((s) => s.key)];
  if (profile?.meal_shares) {
    try {
      const parsed = JSON.parse(profile.meal_shares);
      if (allKeys.every((k) => typeof parsed[k] === 'number')) return parsed;
    } catch {
      // malformed — fall through to defaults
    }
  }
  const shares = {};
  for (const k of ['breakfast', 'lunch', 'dinner']) shares[k] = defaultShare(k, snacks.length);
  for (const s of snacks) shares[s.key] = defaultShare('snack', snacks.length);
  return shares;
}

function mealLabel(key, snacks, t) {
  if (['breakfast', 'lunch', 'dinner'].includes(key)) return t(`mealName.${key}`);
  const snack = snacks.find((s) => s.key === key);
  if (!snack) return key;
  return snack.isBase ? t('mealName.snack') : snack.label;
}

function iconForActivity(type) {
  if (type === 'force') return 'dumbbell';
  if (type === 'velo_ville') return 'bike';
  if (type === 'stepper') return 'footprints';
  if (type?.startsWith('marche')) return 'footprints';
  return 'activity';
}

// A small "Réglages" back-header, identical across every sub-screen.
function SubHeader({ title, onBack, t }) {
  return (
    <div className="meal-detail-header" style={{ marginBottom: 4 }}>
      <button type="button" className="meal-detail-back-btn" onClick={onBack} aria-label={t('meal.back')}>
        <Icon name="chevron-left" size={20} />
      </button>
      <div className="meal-detail-heading">
        <div className="day-nav-subtitle">{t('nav.settings')}</div>
        <div className="meal-detail-title" style={{ fontSize: 21 }}>{title}</div>
      </div>
    </div>
  );
}

export default function Settings({
  profile,
  summary,
  activityTypes,
  email,
  mustChangePassword,
  onSaveProfile,
  onUpdateActivityType,
  onLogout,
}) {
  const { t, lang, setLang } = useLanguage();
  const [screen, setScreen] = useState('home');

  // --- Shared profile-field state (sourced once from `profile`, saved piecemeal per screen) ---
  const [bmr, setBmr] = useState('');
  const [movement, setMovement] = useState('');
  const [digestion, setDigestion] = useState('');
  const [sex, setSex] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [targetWeightKg, setTargetWeightKg] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setBmr(profile.bmr);
      setMovement(profile.daily_movement_kcal);
      setDigestion(profile.digestion_kcal);
      setSex(profile.sex || '');
      setBirthdate(profile.birthdate || '');
      setHeightCm(profile.height_cm ?? '');
      setWeightKg(profile.weight_kg ?? '');
      setTargetWeightKg(profile.target_weight_kg ?? '');
      setBodyFatPct(profile.body_fat_pct ?? '');
    }
  }, [profile]);

  async function handleSaveInfo() {
    if (saving) return;
    setSaving(true);
    try {
      await onSaveProfile({ sex: sex || null, birthdate: birthdate || null });
      setScreen('home');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMeasurements() {
    if (saving) return;
    setSaving(true);
    try {
      await onSaveProfile({
        height_cm: heightCm !== '' ? Number(heightCm) : null,
        weight_kg: weightKg !== '' ? Number(weightKg) : undefined,
        target_weight_kg: targetWeightKg !== '' ? Number(targetWeightKg) : null,
        body_fat_pct: bodyFatPct !== '' ? Number(bodyFatPct) : null,
      });
      setScreen('home');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMetabolism() {
    if (saving) return;
    setSaving(true);
    try {
      await onSaveProfile({
        bmr: Number(bmr),
        daily_movement_kcal: Number(movement),
        digestion_kcal: Number(digestion),
      });
      setScreen('home');
    } finally {
      setSaving(false);
    }
  }

  // --- Repas du jour screen state (per-meal kcal budget + en-cas slots, base included) ---
  const [mealKcal, setMealKcal] = useState({ breakfast: 0, snack: 0, lunch: 0, dinner: 0 });
  const [snacks, setSnacks] = useState([]);
  const [mealsSaved, setMealsSaved] = useState(false);
  const mealOrder = orderedMealKeys(snacks);

  useEffect(() => {
    if (profile && summary) {
      const snackList = parseSnackConfig(profile);
      const shares = parseMealShares(profile, snackList);
      const target = summary.targetIntake || 0;
      const next = {};
      for (const key of ['breakfast', 'lunch', 'dinner', ...snackList.map((s) => s.key)]) next[key] = Math.round(target * (shares[key] ?? 0));
      setSnacks(snackList);
      setMealKcal(next);
    }
  }, [profile, summary]);

  const mealKcalTotal = mealOrder.reduce((s, k) => s + (Number(mealKcal[k]) || 0), 0);

  function addSnack() {
    const key = `snack_${Date.now()}`;
    const n = snacks.length + 1; // "En-cas 2", "En-cas 3"... (base counts as "1")
    setSnacks((list) => [...list, { key, label: `${t('mealName.snack')} ${n}`, time: null, isBase: false }]);
    setMealKcal((v) => ({ ...v, [key]: 0 }));
  }

  function removeSnack(key) {
    setSnacks((list) => list.filter((s) => s.key !== key));
    setMealKcal((v) => {
      const next = { ...v };
      delete next[key];
      return next;
    });
  }

  function updateSnack(key, patch) {
    setSnacks((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  async function handleSaveMeals() {
    if (saving) return;
    setSaving(true);
    try {
      const target = summary?.targetIntake || 0;
      const allKeys = ['breakfast', 'lunch', 'dinner', ...snacks.map((s) => s.key)];
      const shares = {};
      for (const key of allKeys) shares[key] = target > 0 ? (Number(mealKcal[key]) || 0) / target : 0;

      const baseSnack = snacks.find((s) => s.isBase);
      const extraPayload = snacks.filter((s) => !s.isBase).map((s) => ({ key: s.key, label: s.label, time: s.time }));
      const extra_snacks = baseSnack
        ? baseSnack.time
          ? [{ key: 'snack', time: baseSnack.time }, ...extraPayload]
          : extraPayload
        : [{ key: 'snack', removed: true }, ...extraPayload];

      await onSaveProfile({ meal_shares: shares, extra_snacks });
      // Stay on this screen (rather than jumping back to Réglages) so adjustments can keep going.
      setMealsSaved(true);
      setTimeout(() => setMealsSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  // --- Goal screen state ---
  const [goalType, setGoalType] = useState('lose');
  const [pace, setPace] = useState(750);
  const [autoTarget, setAutoTarget] = useState(true);
  const [manualKcal, setManualKcal] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    if (profile) {
      setGoalType(profile.goal);
      if (profile.goal_kcal) setPace(profile.goal_kcal);
      setAutoTarget(profile.manual_target_kcal == null);
      setManualKcal(profile.manual_target_kcal ?? '');
    }
  }, [profile]);

  async function handleSaveGoalScreen() {
    if (savingGoal) return;
    setSavingGoal(true);
    try {
      await onSaveProfile({
        goal: goalType,
        goal_kcal: pace,
        manual_target_kcal: autoTarget ? null : Number(manualKcal) || 0,
      });
      setScreen('home');
    } finally {
      setSavingGoal(false);
    }
  }

  // --- Activity settings screen state ---
  const [activitySearch, setActivitySearch] = useState('');
  const [activityValues, setActivityValues] = useState({});

  useEffect(() => {
    const next = {};
    for (const a of activityTypes) next[a.type] = a.kcal_per_hour;
    setActivityValues(next);
  }, [activityTypes]);

  function handleActivityBlur(type) {
    const value = Number(activityValues[type]);
    const original = activityTypes.find((a) => a.type === type)?.kcal_per_hour;
    if (value >= 0 && value !== original) onUpdateActivityType(type, value);
  }

  // --- Password screen ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwStatus, setPwStatus] = useState(null);
  const [pwLoading, setPwLoading] = useState(false);

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      setPwStatus({ text: t('account.passwordTooShort'), error: true });
      return;
    }
    setPwLoading(true);
    setPwStatus(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPwStatus({ text: t('account.passwordUpdated'), error: false });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPwStatus({ text: err.message || t('account.passwordChangeFailed'), error: true });
    } finally {
      setPwLoading(false);
    }
  }

  if (!profile) return null;

  const initials = (email || '?').slice(0, 2).toUpperCase();
  const targetIntake = summary?.targetIntake;

  // --- Informations screen (sex + birthdate) ---
  if (screen === 'info') {
    return (
      <div>
        <SubHeader title={t('settings.info')} onBack={() => setScreen('home')} t={t} />

        <h4 className="section-label" style={{ marginTop: 0 }}>{t('profile.sex')}</h4>
        <div className="type-list-row" style={{ marginTop: 0 }}>
          {SEX_KEYS.map((s) => (
            <button key={s} type="button" className={sex === s ? 'type-pill active' : 'type-pill'} onClick={() => setSex(s)}>
              {t(`profile.sex.${s}`)}
            </button>
          ))}
        </div>

        <h4 className="section-label">{t('profile.birthdate')}</h4>
        <div className="search-input-row">
          <input type="date" className="search-input" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
        </div>

        <button
          type="button"
          className="meal-add-cta"
          style={{ marginTop: 20, marginBottom: 20 }}
          onClick={handleSaveInfo}
          disabled={saving}
        >
          <Icon name="check" size={20} />
          {saving ? t('addFood.saving') : t('meal.save')}
        </button>
      </div>
    );
  }

  // --- Poids & Mensurations screen ---
  if (screen === 'measurements') {
    return (
      <div>
        <SubHeader title={t('settings.measurements')} onBack={() => setScreen('home')} t={t} />

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h4 className="section-label" style={{ marginTop: 0 }}>{t('profile.height')}</h4>
            <div className="search-input-row">
              <input type="number" min="0" step="any" className="search-input" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
              <span className="unit">cm</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <h4 className="section-label" style={{ marginTop: 0 }}>{t('profile.weight')}</h4>
            <div className="search-input-row">
              <input type="number" min="0" step="any" className="search-input" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
              <span className="unit">kg</span>
            </div>
          </div>
        </div>

        <h4 className="section-label">{t('onboarding.targetWeight')}</h4>
        <div className="search-input-row">
          <input type="number" min="0" step="any" className="search-input" value={targetWeightKg} onChange={(e) => setTargetWeightKg(e.target.value)} />
          <span className="unit">kg</span>
        </div>

        <h4 className="section-label">
          {t('profile.bodyFat')} <span style={{ textTransform: 'none', fontWeight: 400 }}>({t('profile.optional')})</span>
        </h4>
        <div className="search-input-row">
          <input type="number" min="0" max="100" step="any" className="search-input" value={bodyFatPct} onChange={(e) => setBodyFatPct(e.target.value)} />
          <span className="unit">%</span>
        </div>

        <button
          type="button"
          className="meal-add-cta"
          style={{ marginTop: 20, marginBottom: 20 }}
          onClick={handleSaveMeasurements}
          disabled={saving}
        >
          <Icon name="check" size={20} />
          {saving ? t('addFood.saving') : t('meal.save')}
        </button>
      </div>
    );
  }

  // --- Métabolisme screen ---
  if (screen === 'metabolism') {
    return (
      <div>
        <SubHeader title={t('settings.metabolism')} onBack={() => setScreen('home')} t={t} />

        <h4 className="section-label" style={{ marginTop: 0 }}>{t('profile.bmr')}</h4>
        <div className="search-input-row">
          <input type="number" min="0" step="any" className="search-input" value={bmr} onChange={(e) => setBmr(e.target.value)} />
          <span className="unit">kcal</span>
        </div>

        <h4 className="section-label">{t('profile.movement')}</h4>
        <div className="search-input-row">
          <input type="number" min="0" step="any" className="search-input" value={movement} onChange={(e) => setMovement(e.target.value)} />
          <span className="unit">kcal</span>
        </div>

        <h4 className="section-label">{t('profile.digestion')}</h4>
        <div className="search-input-row">
          <input type="number" min="0" step="any" className="search-input" value={digestion} onChange={(e) => setDigestion(e.target.value)} />
          <span className="unit">kcal</span>
        </div>

        <button
          type="button"
          className="meal-add-cta"
          style={{ marginTop: 20, marginBottom: 20 }}
          onClick={handleSaveMetabolism}
          disabled={saving}
        >
          <Icon name="check" size={20} />
          {saving ? t('addFood.saving') : t('meal.save')}
        </button>
      </div>
    );
  }

  // --- Repas du jour screen (per-meal kcal budget) ---
  if (screen === 'meals') {
    const target = summary?.targetIntake || 0;
    const onTarget = target > 0 && Math.abs(mealKcalTotal - target) <= 25;
    return (
      <div>
        <SubHeader title={t('settings.meals')} onBack={() => setScreen('home')} t={t} />
        <p className="hint" style={{ marginTop: -4 }}>{t('settings.mealsHint')}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {mealOrder.map((key) => {
            const snack = snacks.find((s) => s.key === key) || null;
            const pct = target > 0 ? (mealKcal[key] / target) * 100 : 0;
            return (
              <div key={key}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  {snack && !snack.isBase ? (
                    <input
                      type="text"
                      value={snack.label}
                      onChange={(e) => updateSnack(key, { label: e.target.value })}
                      style={{ background: 'none', border: 0, padding: 0, fontSize: 14.5, fontWeight: 600, flex: 1 }}
                    />
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 600 }}>
                      <Icon name={MEAL_ICONS[key] || 'apple'} size={17} color="var(--acc)" />
                      {mealLabel(key, snacks, t)}
                    </span>
                  )}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                    <b style={{ fontSize: 13.5 }}>{Math.round(mealKcal[key] || 0)} kcal</b>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 34, textAlign: 'right' }}>{Math.round(pct)}%</span>
                    {snack && (
                      <button type="button" className="entry-icon-btn entry-delete-btn" style={{ width: 28, height: 28 }} onClick={() => removeSnack(key)} aria-label={t('planner.remove')}>
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </span>
                </div>
                <input
                  type="range"
                  className="gauge-slider"
                  min="0"
                  max={Math.max(target, 100)}
                  step="10"
                  value={mealKcal[key] || 0}
                  onChange={(e) => setMealKcal((v) => ({ ...v, [key]: e.target.value }))}
                  style={{ background: `linear-gradient(to right, var(--acc) ${pct}%, var(--ink-700, var(--border-subtle)) ${pct}%)` }}
                />
                {snack && (
                  <div className="type-list-row" style={{ marginTop: 8 }}>
                    {SNACK_TIMES.map((time) => (
                      <button
                        key={time}
                        type="button"
                        className={snack.time === time ? 'type-pill active' : 'type-pill'}
                        onClick={() => updateSnack(key, { time: snack.time === time ? null : time })}
                      >
                        {t(`settings.snackTime.${time}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="recurring-feature-row"
          style={{ justifyContent: 'center', width: '100%', marginTop: 16, font: 'inherit', cursor: 'pointer' }}
          onClick={addSnack}
        >
          <Icon name="plus" size={18} color="var(--acc)" />
          <span className="recurring-feature-title" style={{ color: 'var(--acc)' }}>{t('settings.addSnack')}</span>
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 18,
            padding: '16px 18px',
            marginTop: 20,
          }}
        >
          <div>
            <div className="hint" style={{ margin: 0 }}>{t('settings.totalMeals')}</div>
            <div className="weight-value" style={{ fontSize: 22 }}>
              {mealKcalTotal} <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>/ {Math.round(target)} kcal</span>
            </div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: onTarget ? 'var(--success)' : 'var(--warning)' }}>
            <Icon name="circle-check" size={16} />
            {target > 0 ? Math.round((mealKcalTotal / target) * 100) : 0}%
          </span>
        </div>

        <button
          type="button"
          className="meal-add-cta"
          style={{ marginTop: 20, marginBottom: 20 }}
          onClick={handleSaveMeals}
          disabled={saving}
        >
          <Icon name="check" size={20} />
          {saving ? t('addFood.saving') : t('meal.save')}
        </button>
        {mealsSaved && <p className="hint success" style={{ textAlign: 'center', marginTop: -12 }}>{t('settings.mealsSaved')}</p>}
      </div>
    );
  }

  // --- Goal edit screen ---
  if (screen === 'goal') {
    return (
      <div>
        <SubHeader title={t('settings.goal')} onBack={() => setScreen('home')} t={t} />

        <h4 className="section-label" style={{ marginTop: 0 }}>{t('settings.goalType')}</h4>
        <div className="type-list-row">
          {GOAL_KEYS.map((g) => (
            <button key={g} type="button" className={goalType === g ? 'type-pill active' : 'type-pill'} onClick={() => setGoalType(g)}>
              {t(`settings.goalType.${g}`)}
            </button>
          ))}
        </div>

        {goalType !== 'maintain' && (
          <>
            <h4 className="section-label">{t('settings.pace')}</h4>
            <div className="settings-goal-card">
              <div className="settings-goal-row">
                <b className="weight-value" style={{ fontSize: 20 }}>
                  {(pace / 1000).toFixed(2).replace(/\.?0+$/, '')} kg <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>/ {t('settings.perWeek')}</span>
                </b>
              </div>
              <div className="type-list-row" style={{ marginTop: 10 }}>
                {PACE_OPTIONS.map((p) => (
                  <button key={p} type="button" className={pace === p ? 'type-pill active' : 'type-pill'} onClick={() => setPace(p)}>
                    {p} kcal
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <h4 className="section-label">{t('settings.dailyTarget')}</h4>
        <div className="settings-goal-card">
          <div
            className="settings-list-row"
            style={{ padding: '2px 0 14px', margin: 0 }}
            onClick={() => setAutoTarget((v) => !v)}
          >
            <span className="settings-list-label">{t('settings.autoTarget')}</span>
            <button
              type="button"
              className={autoTarget ? 'toggle-switch on' : 'toggle-switch'}
              onClick={(e) => {
                e.stopPropagation();
                setAutoTarget((v) => !v);
              }}
              aria-pressed={autoTarget}
            >
              <span className="toggle-switch-thumb" />
            </button>
          </div>
          {autoTarget ? (
            <div className="portion-tile-row" style={{ margin: 0 }}>
              <div className="portion-tile">
                <b>{targetIntake != null ? Math.round(targetIntake) : '—'}</b>
                <span>kcal</span>
              </div>
            </div>
          ) : (
            <div className="search-input-row" style={{ marginTop: 0 }}>
              <input
                type="number"
                min="0"
                step="10"
                className="search-input"
                value={manualKcal}
                onChange={(e) => setManualKcal(e.target.value)}
              />
              <span className="unit">kcal</span>
            </div>
          )}
        </div>

        <button
          type="button"
          className="meal-add-cta"
          style={{ marginTop: 20, marginBottom: 20 }}
          onClick={handleSaveGoalScreen}
          disabled={savingGoal}
        >
          <Icon name="check" size={20} />
          {savingGoal ? t('addFood.saving') : t('meal.save')}
        </button>
      </div>
    );
  }

  // --- Custom activities screen ---
  if (screen === 'activities') {
    const filtered = activityTypes.filter((a) =>
      t(`activityType.${a.type}`).toLowerCase().includes(activitySearch.trim().toLowerCase())
    );
    return (
      <div>
        <SubHeader title={t('activitySettings.title')} onBack={() => setScreen('home')} t={t} />

        <p className="hint">{t('activitySettings.hint')}</p>

        <div className="search-input-row">
          <Icon name="search" size={18} color="var(--text-muted)" />
          <input
            type="text"
            className="search-input"
            placeholder={t('activityLog.searchActivity')}
            value={activitySearch}
            onChange={(e) => setActivitySearch(e.target.value)}
          />
        </div>

        <h4 className="section-label">{t('settings.allActivities')}</h4>
        <div className="settings-list-card">
          {filtered.map((a) => (
            <div className="settings-list-row" key={a.type} style={{ cursor: 'default' }}>
              <span className="settings-list-icon">
                <Icon name={iconForActivity(a.type)} size={19} />
              </span>
              <span className="settings-list-label">{t(`activityType.${a.type}`)}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={activityValues[a.type] ?? ''}
                  onChange={(e) => setActivityValues((v) => ({ ...v, [a.type]: e.target.value }))}
                  onBlur={() => handleActivityBlur(a.type)}
                  style={{ width: 58, height: 36, borderRadius: 10, textAlign: 'center', fontWeight: 700 }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>kcal/h</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- Password screen ---
  if (screen === 'password') {
    return (
      <div>
        <SubHeader title={t('account.changePassword')} onBack={() => setScreen('home')} t={t} />

        {mustChangePassword && <p className="hint error">{t('account.mustChangePassword')}</p>}

        <h4 className="section-label" style={{ marginTop: 0 }}>{t('account.currentPassword')}</h4>
        <input type="password" className="wide" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
        <h4 className="section-label">{t('account.newPassword')}</h4>
        <input type="password" className="wide" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />

        <button type="button" className="meal-add-cta" style={{ marginTop: 20, marginBottom: 12 }} onClick={handleChangePassword} disabled={pwLoading}>
          <Icon name="check" size={20} />
          {pwLoading ? t('common.saving') : t('account.changePassword')}
        </button>
        {pwStatus && <p className={pwStatus.error ? 'hint error' : 'hint success'}>{pwStatus.text}</p>}
      </div>
    );
  }

  // --- Home screen ---
  return (
    <div>
      <h1>{t('nav.settings')}</h1>

      <h4 className="section-label" style={{ marginTop: 4 }}>{t('settings.profileGroupLabel')}</h4>
      <div className="settings-list-card">
        <button type="button" className="settings-list-row" onClick={() => setScreen('info')}>
          <span className="settings-list-icon">
            <Icon name="user" size={19} />
          </span>
          <span className="settings-list-label">{t('settings.info')}</span>
          <Icon name="chevron-right" size={18} color="var(--text-muted)" />
        </button>
        <button type="button" className="settings-list-row" onClick={() => setScreen('measurements')}>
          <span className="settings-list-icon">
            <Icon name="scale" size={19} />
          </span>
          <span className="settings-list-label">{t('settings.measurements')}</span>
          <Icon name="chevron-right" size={18} color="var(--text-muted)" />
        </button>
        <button type="button" className="settings-list-row" onClick={() => setScreen('goal')}>
          <span className="settings-list-icon">
            <Icon name="target" size={19} />
          </span>
          <span className="settings-list-label">{t('settings.goal')}</span>
          <Icon name="chevron-right" size={18} color="var(--text-muted)" />
        </button>
        <button type="button" className="settings-list-row" onClick={() => setScreen('metabolism')}>
          <span className="settings-list-icon">
            <Icon name="flame" size={19} />
          </span>
          <span className="settings-list-label">{t('settings.metabolism')}</span>
          <Icon name="chevron-right" size={18} color="var(--text-muted)" />
        </button>
        <button type="button" className="settings-list-row" onClick={() => setScreen('meals')}>
          <span className="settings-list-icon">
            <Icon name="utensils" size={19} />
          </span>
          <span className="settings-list-label">{t('settings.meals')}</span>
          <Icon name="chevron-right" size={18} color="var(--text-muted)" />
        </button>
      </div>

      <h4 className="section-label" style={{ marginTop: 18 }}>{t('settings.preferences')}</h4>
      <div className="settings-list-card">
        <div className="settings-list-row" style={{ cursor: 'default' }}>
          <span className="settings-list-icon">
            <Icon name="languages" size={19} />
          </span>
          <span className="settings-list-label">{t('account.language')}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 13.5 }}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="settings-list-row" style={{ cursor: 'default' }}>
          <span className="settings-list-icon">
            <Icon name="ruler" size={19} />
          </span>
          <span className="settings-list-label">{t('settings.units')}</span>
          <span className="settings-list-value">{t('settings.unitsValue')}</span>
        </div>
      </div>

      <button
        type="button"
        className="settings-list-row"
        style={{ marginTop: 14, background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 18 }}
        onClick={() => setScreen('activities')}
      >
        <span className="settings-list-icon" style={{ background: 'rgba(245,194,107,0.15)', color: 'var(--warning)' }}>
          <Icon name="activity" size={19} />
        </span>
        <span className="settings-list-label">{t('activitySettings.title')}</span>
        <span className="settings-list-value">{activityTypes.length}</span>
        <Icon name="chevron-right" size={18} color="var(--text-muted)" />
      </button>

      <div className="settings-profile-card" style={{ marginTop: 14 }}>
        <span className="settings-avatar">{initials}</span>
        <div className="settings-profile-body">
          <div className="settings-profile-name">{email.split('@')[0]}</div>
          <div className="settings-profile-email">{email}</div>
        </div>
        <button type="button" className="entry-icon-btn" onClick={() => setScreen('info')} aria-label={t('recipeList.edit')}>
          <Icon name="pencil" size={19} />
        </button>
      </div>

      <h4 className="section-label" style={{ marginTop: 18 }}>{t('account.title')}</h4>
      <div className="settings-list-card">
        <button type="button" className="settings-list-row" onClick={() => setScreen('password')}>
          <span className="settings-list-icon">
            <Icon name="key" size={19} />
          </span>
          <span className="settings-list-label">{t('account.changePassword')}</span>
          {mustChangePassword && <span className="settings-list-value" style={{ color: 'var(--danger)' }}>!</span>}
          <Icon name="chevron-right" size={18} color="var(--text-muted)" />
        </button>
      </div>

      <button type="button" className="settings-logout-btn" style={{ marginTop: 18, marginBottom: 20 }} onClick={onLogout}>
        <Icon name="log-out" size={19} />
        {t('account.logout')}
      </button>
    </div>
  );
}
