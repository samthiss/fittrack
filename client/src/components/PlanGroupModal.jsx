import { useState } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_LABEL = { mon: 'L', tue: 'M', wed: 'M', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
const WEEKDAY_LABEL_EN = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' };

// Edits/deletes a whole recurring plan group directly — used when the user opens a "scheduled"
// (not-yet-materialized) preview row for a future day, which has no real activity_logs id to
// hit via the normal ActivityDetail edit flow.
export default function PlanGroupModal({ group, onClose, onSaved, onDeleted }) {
  const { t, lang } = useLanguage();
  const [label, setLabel] = useState(group.label || '');
  const [duration, setDuration] = useState(group.duration_minutes);
  const [days, setDays] = useState(new Set(group.days));
  const [saving, setSaving] = useState(false);

  function toggleDay(key) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await api.updateActivityPlanGroup(group.groupId, {
        label: label.trim(),
        duration_minutes: Number(duration) || group.duration_minutes,
        days: [...days],
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (saving) return;
    setSaving(true);
    try {
      await api.deleteActivityPlanGroup(group.groupId);
      onDeleted();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="meal-detail-header" style={{ marginBottom: 4 }}>
          <button type="button" className="meal-detail-back-btn" onClick={onClose} aria-label={t('meal.close')}>
            <Icon name="x" size={20} />
          </button>
          <div className="meal-detail-heading">
            <div className="day-nav-subtitle">{t(`activityType.${group.type}`)}</div>
            <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('activityLog.editName')}</div>
          </div>
        </div>

        <h4 className="section-label">{t('activityLog.workoutName')}</h4>
        <div className="search-input-row">
          <Icon name="pencil" size={18} color="var(--text-muted)" />
          <input
            type="text"
            className="search-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('activityLog.workoutNamePlaceholder')}
            autoFocus
          />
        </div>

        <h4 className="section-label">{t('activityLog.duration')}</h4>
        <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
          <button type="button" className="weight-minus-btn" onClick={() => setDuration((d) => Math.max(5, Number(d) - 5))}>
            <Icon name="minus" size={18} />
          </button>
          <div style={{ textAlign: 'center', minWidth: 70 }}>
            <span className="weight-value">{duration}</span> <span className="rate">min</span>
          </div>
          <button type="button" className="weight-plus-btn" onClick={() => setDuration((d) => Number(d) + 5)}>
            <Icon name="plus" size={18} />
          </button>
        </div>

        <h4 className="section-label">{t('activityLog.recurringDays')}</h4>
        <div className="day-chip-row">
          {DAY_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className={days.has(key) ? 'day-chip active' : 'day-chip'}
              onClick={() => toggleDay(key)}
            >
              {(lang === 'en' ? WEEKDAY_LABEL_EN : WEEKDAY_LABEL)[key]}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="weight-minus-btn"
          style={{ color: 'var(--danger)', marginTop: 18 }}
          onClick={handleDelete}
          disabled={saving}
          aria-label={t('activityLog.delete')}
        >
          <Icon name="trash-2" size={18} />
        </button>
      </div>
      <button
        type="button"
        className="done-btn done-btn-primary"
        onClick={(e) => {
          e.stopPropagation();
          handleSave();
        }}
        disabled={saving || days.size === 0}
      >
        {saving ? t('activityLog.saving') : t('activityLog.save')}
      </button>
    </div>
  );
}
