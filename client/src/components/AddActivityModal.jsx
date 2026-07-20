import { useState, useMemo } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const FORCE_TYPES = new Set(['force']);
const INTENSITY_FACTOR = { light: 0.8, moderate: 1, intense: 1.2 };

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

export default function AddActivityModal({ activityTypes, date, todayDayKey, onClose, onAdded }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('cardio');
  const [selectedType, setSelectedType] = useState(null);
  const [label, setLabel] = useState('');
  const [duration, setDuration] = useState(30);
  const [intensity, setIntensity] = useState('moderate');
  const [recurring, setRecurring] = useState(false);
  const [days, setDays] = useState(new Set([todayDayKey]));
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activityTypes.filter((at) => {
      const isForce = FORCE_TYPES.has(at.type);
      if (kind === 'force' && !isForce) return false;
      if (kind === 'cardio' && isForce) return false;
      if (!term) return true;
      return t(`activityType.${at.type}`).toLowerCase().includes(term);
    });
  }, [activityTypes, kind, search, t]);

  const selected = activityTypes.find((at) => at.type === selectedType);
  const estimatedKcal = selected ? Math.round(selected.kcal_per_hour * (duration / 60) * INTENSITY_FACTOR[intensity]) : null;

  function toggleDay(key) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit() {
    if (!selectedType || saving) return;
    setSaving(true);
    try {
      const finalLabel = label.trim() || undefined;
      await api.addActivity({ date, type: selectedType, duration_minutes: duration, kcal: estimatedKcal, label: finalLabel });
      if (recurring && days.size > 0) {
        await api.addActivityPlan({ days: [...days], type: selectedType, duration_minutes: duration, label: finalLabel });
      }
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  const WEEKDAY_LABEL = { mon: 'L', tue: 'M', wed: 'M', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="meal-detail-header" style={{ marginBottom: 4 }}>
          <button type="button" className="meal-detail-back-btn" onClick={onClose} aria-label={t('meal.close')}>
            <Icon name="x" size={20} />
          </button>
          <div className="meal-detail-heading">
            <div className="day-nav-subtitle">{t('nav.activities')}</div>
            <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('activityLog.addActivity')}</div>
          </div>
        </div>

        <div className="search-input-row">
          <Icon name="search" size={18} color="var(--text-muted)" />
          <input
            type="text"
            className="search-input"
            placeholder={t('activityLog.searchActivity')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <h4 className="section-label">{t('activityLog.sessionType')}</h4>
        <div className="type-list-row">
          <button type="button" className={kind === 'force' ? 'type-pill active' : 'type-pill'} onClick={() => setKind('force')}>
            {t('activityLog.kindForce')}
          </button>
          <button type="button" className={kind === 'cardio' ? 'type-pill active' : 'type-pill'} onClick={() => setKind('cardio')}>
            {t('activityLog.kindCardio')}
          </button>
        </div>

        <h4 className="section-label">{t('activityLog.choose')}</h4>
        <div className="entry-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
          {filtered.length === 0 && <p className="hint">{t('activityLog.noResults')}</p>}
          {filtered.map((at) => {
            const isSelected = selectedType === at.type;
            return (
              <div
                key={at.type}
                className={isSelected ? 'entry-card activity-session-exercise current' : 'entry-card'}
                onClick={() => setSelectedType(at.type)}
              >
                <span className="meal-icon-box">
                  <Icon name={iconForType(at.type)} size={19} />
                </span>
                <div className="entry-card-body" style={{ cursor: 'pointer' }}>
                  <div className="entry-card-name">{t(`activityType.${at.type}`)}</div>
                  <div className="entry-card-sub">≈ {Math.round(at.kcal_per_hour / 2)} kcal / 30 min</div>
                </div>
                {isSelected && <Icon name="circle-check-big" size={20} color="var(--acc)" />}
              </div>
            );
          })}
        </div>

        <h4 className="section-label">{t('activityLog.workoutName')}</h4>
        <div className="search-input-row">
          <Icon name="pencil" size={18} color="var(--text-muted)" />
          <input
            type="text"
            className="search-input"
            placeholder={t('activityLog.workoutNamePlaceholder')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <h4 className="section-label">{t('activityLog.duration')}</h4>
        <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
          <button type="button" className="weight-minus-btn" onClick={() => setDuration((d) => Math.max(5, d - 5))}>
            <Icon name="minus" size={18} />
          </button>
          <div style={{ textAlign: 'center', minWidth: 70 }}>
            <span className="weight-value">{duration}</span> <span className="rate">min</span>
          </div>
          <button type="button" className="weight-plus-btn" onClick={() => setDuration((d) => d + 5)}>
            <Icon name="plus" size={18} />
          </button>
        </div>

        <h4 className="section-label">{t('activityLog.intensity')}</h4>
        <div className="type-list-row">
          <button type="button" className={intensity === 'light' ? 'type-pill active' : 'type-pill'} onClick={() => setIntensity('light')}>
            {t('activityLog.intensityLight')}
          </button>
          <button type="button" className={intensity === 'moderate' ? 'type-pill active' : 'type-pill'} onClick={() => setIntensity('moderate')}>
            {t('activityLog.intensityModerate')}
          </button>
          <button type="button" className={intensity === 'intense' ? 'type-pill active' : 'type-pill'} onClick={() => setIntensity('intense')}>
            {t('activityLog.intensityIntense')}
          </button>
        </div>

        <h4 className="section-label">{t('activityLog.recurrence')}</h4>
        <label className="recurring-toggle-row">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          <span>{t('activityLog.recurringActivity')}</span>
        </label>
        {recurring && (
          <div className="day-chip-row" style={{ marginTop: 10 }}>
            {DAY_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                className={days.has(key) ? 'day-chip active' : 'day-chip'}
                onClick={() => toggleDay(key)}
              >
                {WEEKDAY_LABEL[key]}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="row" style={{ marginTop: 14 }}>
            <div className="name">
              <span>{t('activityLog.estimatedBurn')}</span>
            </div>
            <div className="field">
              <b className="weight-value" style={{ fontSize: 22 }}>
                {estimatedKcal} kcal
              </b>
            </div>
          </div>
        )}

      </div>
      <button
        type="button"
        className="done-btn done-btn-primary"
        onClick={(e) => {
          e.stopPropagation();
          handleSubmit();
        }}
        disabled={!selectedType || saving}
      >
        {saving ? t('activityLog.saving') : t('activityLog.addToJournal')}
      </button>
    </div>
  );
}
