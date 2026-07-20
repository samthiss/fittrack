import { useEffect, useState } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

const GOAL_KEYS = ['lose', 'maintain', 'gain'];
const PACE_OPTIONS = [500, 750, 1000];

function iconForActivity(type) {
  if (type === 'force') return 'dumbbell';
  if (type === 'velo_ville') return 'bike';
  if (type === 'stepper') return 'footprints';
  if (type?.startsWith('marche')) return 'footprints';
  return 'activity';
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

  // --- Profile (BMR/movement/digestion) screen state ---
  const [bmr, setBmr] = useState('');
  const [movement, setMovement] = useState('');
  const [digestion, setDigestion] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (profile) {
      setBmr(profile.bmr);
      setMovement(profile.daily_movement_kcal);
      setDigestion(profile.digestion_kcal);
    }
  }, [profile]);

  async function handleSaveProfileScreen() {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      await onSaveProfile({ bmr: Number(bmr), daily_movement_kcal: Number(movement), digestion_kcal: Number(digestion) });
      setScreen('home');
    } finally {
      setSavingProfile(false);
    }
  }

  // --- Goal screen state ---
  const [goalType, setGoalType] = useState('lose');
  const [pace, setPace] = useState(750);
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    if (profile) {
      setGoalType(profile.goal);
      if (profile.goal_kcal) setPace(profile.goal_kcal);
    }
  }, [profile]);

  async function handleSaveGoalScreen() {
    if (savingGoal) return;
    setSavingGoal(true);
    try {
      await onSaveProfile({ goal: goalType, goal_kcal: pace });
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

  // --- Account/password screen ---
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

  // --- Profile edit screen ---
  if (screen === 'profile') {
    return (
      <div>
        <div className="meal-detail-header" style={{ marginBottom: 4 }}>
          <button type="button" className="meal-detail-back-btn" onClick={() => setScreen('home')} aria-label={t('meal.back')}>
            <Icon name="chevron-left" size={20} />
          </button>
          <div className="meal-detail-heading">
            <div className="day-nav-subtitle">{t('nav.settings')}</div>
            <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('settings.editProfile')}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, margin: '10px 0 18px' }}>
          <span className="settings-avatar settings-avatar-lg">{initials}</span>
          <div className="settings-profile-email">{email}</div>
        </div>

        <h4 className="section-label">{t('profile.bmr')}</h4>
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
          onClick={handleSaveProfileScreen}
          disabled={savingProfile}
        >
          <Icon name="check" size={20} />
          {savingProfile ? t('addFood.saving') : t('meal.save')}
        </button>
      </div>
    );
  }

  // --- Goal edit screen ---
  if (screen === 'goal') {
    return (
      <div>
        <div className="meal-detail-header" style={{ marginBottom: 4 }}>
          <button type="button" className="meal-detail-back-btn" onClick={() => setScreen('home')} aria-label={t('meal.back')}>
            <Icon name="chevron-left" size={20} />
          </button>
          <div className="meal-detail-heading">
            <div className="day-nav-subtitle">{t('nav.settings')}</div>
            <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('settings.goal')}</div>
          </div>
        </div>

        <h4 className="section-label">{t('settings.goalType')}</h4>
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

        {targetIntake != null && (
          <>
            <h4 className="section-label">{t('settings.dailyTarget')}</h4>
            <div className="portion-tile-row">
              <div className="portion-tile">
                <b>{Math.round(targetIntake)}</b>
                <span>kcal</span>
              </div>
            </div>
          </>
        )}

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
        <div className="meal-detail-header" style={{ marginBottom: 4 }}>
          <button type="button" className="meal-detail-back-btn" onClick={() => setScreen('home')} aria-label={t('meal.back')}>
            <Icon name="chevron-left" size={20} />
          </button>
          <div className="meal-detail-heading">
            <div className="day-nav-subtitle">{t('nav.settings')}</div>
            <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('activitySettings.title')}</div>
          </div>
        </div>

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

  // --- Home screen ---
  return (
    <div>
      <h1>{t('nav.settings')}</h1>

      <div className="settings-profile-card">
        <span className="settings-avatar">{initials}</span>
        <div className="settings-profile-body">
          <div className="settings-profile-name">{email.split('@')[0]}</div>
          <div className="settings-profile-email">{email}</div>
        </div>
        <button type="button" className="entry-icon-btn" onClick={() => setScreen('profile')} aria-label={t('recipeList.edit')}>
          <Icon name="pencil" size={19} />
        </button>
      </div>

      <div className="section-header" style={{ marginTop: 18 }}>
        <span className="section-title">{t('settings.goal')}</span>
        <button type="button" className="report-link" onClick={() => setScreen('goal')}>
          <Icon name="pencil" size={14} />
          {t('recipeList.edit')}
        </button>
      </div>
      <div className="settings-goal-card">
        <div className="type-list-row" style={{ marginBottom: 14 }}>
          {GOAL_KEYS.map((g) => (
            <span key={g} className={g === profile.goal ? 'type-pill active' : 'type-pill'} style={{ cursor: 'default' }}>
              {t(`settings.goalType.${g}`)}
            </span>
          ))}
        </div>
        <div className="settings-goal-row">
          <div>
            <div className="hint" style={{ margin: 0 }}>{t('settings.dailyTarget')}</div>
            <div className="weight-value" style={{ fontSize: 24 }}>
              {targetIntake != null ? Math.round(targetIntake) : '—'} <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>kcal</span>
            </div>
          </div>
          {profile.goal !== 'maintain' && (
            <div style={{ textAlign: 'right' }}>
              <div className="hint" style={{ margin: 0 }}>{t('settings.pace')}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)' }}>
                −{(profile.goal_kcal / 1000).toFixed(2).replace(/\.?0+$/, '')} kg / {t('settings.perWeekShort')}
              </div>
            </div>
          )}
        </div>
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

      <h4 className="section-label" style={{ marginTop: 18 }}>{t('account.title')}</h4>
      <div className="settings-list-card">
        {mustChangePassword && <p className="hint error" style={{ margin: '10px 14px 0' }}>{t('account.mustChangePassword')}</p>}
        <div style={{ padding: '14px 16px' }}>
          <h4 className="section-label" style={{ marginTop: 0 }}>{t('account.currentPassword')}</h4>
          <input type="password" className="wide" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          <h4 className="section-label">{t('account.newPassword')}</h4>
          <input type="password" className="wide" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          <button type="button" className="btn btn-block" style={{ marginTop: 12 }} onClick={handleChangePassword} disabled={pwLoading}>
            {pwLoading ? t('common.saving') : t('account.changePassword')}
          </button>
          {pwStatus && <p className={pwStatus.error ? 'hint error' : 'hint success'}>{pwStatus.text}</p>}
        </div>
      </div>

      <button type="button" className="settings-logout-btn" style={{ marginTop: 18, marginBottom: 20 }} onClick={onLogout}>
        <Icon name="log-out" size={19} />
        {t('account.logout')}
      </button>
    </div>
  );
}
