import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function ProfileForm({ profile, onSave }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    bmr: '',
    daily_movement_kcal: '',
    digestion_kcal: '',
  });
  const saveTimeout = useRef(null);

  useEffect(() => {
    if (profile) {
      setForm({
        bmr: profile.bmr,
        daily_movement_kcal: profile.daily_movement_kcal,
        digestion_kcal: profile.digestion_kcal,
      });
    }
  }, [profile]);

  function handleChange(e) {
    const next = { ...form, [e.target.name]: e.target.value };
    setForm(next);

    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      onSave({
        bmr: Number(next.bmr),
        daily_movement_kcal: Number(next.daily_movement_kcal),
        digestion_kcal: Number(next.digestion_kcal),
      });
    }, 500);
  }

  return (
    <div>
      <h2>{t('profile.title')}</h2>
      <div className="card">
        <div className="row">
          <label htmlFor="bmr">{t('profile.bmr')}</label>
          <div className="field">
            <input
              type="number"
              id="bmr"
              name="bmr"
              value={form.bmr}
              onChange={handleChange}
              min="0"
              step="any"
            />
            <span className="unit">kcal</span>
          </div>
        </div>

        <div className="row">
          <label htmlFor="daily_movement_kcal">{t('profile.movement')}</label>
          <div className="field">
            <input
              type="number"
              id="daily_movement_kcal"
              name="daily_movement_kcal"
              value={form.daily_movement_kcal}
              onChange={handleChange}
              min="0"
              step="any"
            />
            <span className="unit">kcal</span>
          </div>
        </div>

        <div className="row">
          <label htmlFor="digestion_kcal">{t('profile.digestion')}</label>
          <div className="field">
            <input
              type="number"
              id="digestion_kcal"
              name="digestion_kcal"
              value={form.digestion_kcal}
              onChange={handleChange}
              min="0"
              step="any"
            />
            <span className="unit">kcal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
