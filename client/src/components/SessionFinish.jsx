import { useState } from 'react';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

const DURATION_STEP = 5;

// Shown after tapping "Terminer" on either session (Force or Cardio) — duration is pre-filled
// from the session's actual elapsed timer and adjustable; kcal is always derived from it (rate
// scaled off the activity's original kcal/minute estimate), never entered directly.
export default function SessionFinish({ activity, elapsedSeconds, onCancel, onConfirm }) {
  const { t } = useLanguage();
  const elapsedMinutes = elapsedSeconds / 60;
  const rate = activity.duration_minutes > 0 ? activity.kcal / activity.duration_minutes : 0;
  const [duration, setDuration] = useState(Math.max(DURATION_STEP, Math.ceil(elapsedMinutes / DURATION_STEP) * DURATION_STEP));
  const [saving, setSaving] = useState(false);
  const kcal = Math.max(0, Math.round(rate * duration));

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    try {
      await onConfirm({ duration_minutes: duration, kcal });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="meal-detail-header">
        <button type="button" className="meal-detail-back-btn" onClick={onCancel} aria-label={t('meal.back')}>
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="meal-detail-heading">
          <div className="day-nav-subtitle">{activity.label || t(`activityType.${activity.type}`)}</div>
          <div className="meal-detail-title">{t('activityLog.finishSession')}</div>
        </div>
      </div>

      <h4 className="section-label" style={{ marginTop: 8 }}>{t('activityLog.duration')}</h4>
      <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
        <button type="button" className="weight-minus-btn" onClick={() => setDuration((d) => Math.max(DURATION_STEP, d - DURATION_STEP))}>
          <Icon name="minus" size={18} />
        </button>
        <div style={{ textAlign: 'center', minWidth: 70 }}>
          <span className="weight-value">{duration}</span> <span className="rate">min</span>
        </div>
        <button type="button" className="weight-plus-btn" onClick={() => setDuration((d) => d + DURATION_STEP)}>
          <Icon name="plus" size={18} />
        </button>
      </div>

      <button type="button" className="meal-add-cta" style={{ marginTop: 20 }} onClick={handleConfirm} disabled={saving}>
        <Icon name="check" size={20} />
        {saving ? t('activityLog.saving') : t('activityLog.validate')}
      </button>
    </div>
  );
}
