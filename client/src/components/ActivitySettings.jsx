import { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function ActivitySettings({ activityTypes, onUpdate }) {
  const { t } = useLanguage();
  const [values, setValues] = useState({});
  const [savedType, setSavedType] = useState(null);

  useEffect(() => {
    const next = {};
    for (const a of activityTypes) next[a.type] = a.kcal_per_hour;
    setValues(next);
  }, [activityTypes]);

  function handleChange(type, value) {
    setValues({ ...values, [type]: value });
    setSavedType(null);
  }

  function handleSave(type) {
    onUpdate(type, Number(values[type])).then(() => setSavedType(type));
  }

  return (
    <div>
      <h2>{t('activitySettings.title')}</h2>
      <p className="hint">{t('activitySettings.hint')}</p>

      <div className="card">
        {activityTypes.map((a) => (
          <div className="row" key={a.type}>
            <label htmlFor={`t-${a.type}`}>{t(`activityType.${a.type}`)}</label>
            <div className="field">
              <input
                type="number"
                id={`t-${a.type}`}
                min="0"
                step="any"
                value={values[a.type] ?? ''}
                onChange={(e) => handleChange(a.type, e.target.value)}
              />
              <span className="unit">kcal/h</span>
              <button type="button" className="btn btn-small" onClick={() => handleSave(a.type)}>
                {t('activitySettings.save')}
              </button>
              {savedType === a.type && <span className="hint success">✓</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
