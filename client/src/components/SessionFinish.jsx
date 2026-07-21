import { useState } from 'react';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

// Shown after tapping "Terminer" on either session (Force or Cardio) — pre-fills duration/kcal
// from the session's actual elapsed timer (kcal scaled off the activity's original kcal/minute
// estimate), but always lets the user review and adjust before it's actually saved.
export default function SessionFinish({ activity, elapsedSeconds, onCancel, onConfirm, onKeepOriginal }) {
  const { t } = useLanguage();
  const elapsedMinutes = elapsedSeconds / 60;
  const rate = activity.duration_minutes > 0 ? activity.kcal / activity.duration_minutes : 0;
  const [duration, setDuration] = useState(Math.max(1, Math.round(elapsedMinutes)));
  const [kcal, setKcal] = useState(Math.max(0, Math.round(rate * elapsedMinutes)));
  const [saving, setSaving] = useState(false);

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

      <h4 className="section-label" style={{ marginTop: 8 }}>{t('activityLog.kcalBurned')}</h4>
      <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
        <button type="button" className="weight-minus-btn" onClick={() => setKcal((k) => Math.max(0, k - 10))}>
          <Icon name="minus" size={18} />
        </button>
        <div style={{ textAlign: 'center', minWidth: 100 }}>
          <span className="weight-value">{kcal}</span> <span className="rate">kcal</span>
        </div>
        <button type="button" className="weight-plus-btn" onClick={() => setKcal((k) => k + 10)}>
          <Icon name="plus" size={18} />
        </button>
      </div>

      <h4 className="section-label">{t('activityLog.duration')}</h4>
      <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
        <button type="button" className="weight-minus-btn" onClick={() => setDuration((d) => Math.max(1, d - 1))}>
          <Icon name="minus" size={18} />
        </button>
        <div style={{ textAlign: 'center', minWidth: 70 }}>
          <span className="weight-value">{duration}</span> <span className="rate">min</span>
        </div>
        <button type="button" className="weight-plus-btn" onClick={() => setDuration((d) => d + 1)}>
          <Icon name="plus" size={18} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button type="button" className="meal-add-cta meal-add-cta-white" style={{ flex: 1 }} onClick={onKeepOriginal} disabled={saving}>
          {t('activityLog.keepOriginal')}
        </button>
        <button type="button" className="meal-add-cta" style={{ flex: 1 }} onClick={handleConfirm} disabled={saving}>
          <Icon name="check" size={20} />
          {saving ? t('activityLog.saving') : t('activityLog.validate')}
        </button>
      </div>
    </div>
  );
}
