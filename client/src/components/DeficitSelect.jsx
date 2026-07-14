import { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function DeficitSelect({ profile, onSave }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(750);

  const OPTIONS = [
    { value: 500, label: t('deficitSelect.optionLow') },
    { value: 750, label: t('deficitSelect.optionMid') },
    { value: 1000, label: t('deficitSelect.optionHigh') },
  ];

  useEffect(() => {
    if (profile?.goal_kcal) setValue(profile.goal_kcal);
  }, [profile]);

  function handleChange(e) {
    const next = Number(e.target.value);
    setValue(next);
    onSave({ goal: 'lose', goal_kcal: next });
  }

  return (
    <div>
      <h2>{t('deficitSelect.title')}</h2>
      <div className="card">
        <div className="row">
          <label htmlFor="deficit">{t('deficitSelect.title')}</label>
          <div className="field">
            <select id="deficit" value={value} onChange={handleChange}>
              {OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
