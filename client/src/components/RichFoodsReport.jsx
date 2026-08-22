import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

export default function RichFoodsReport({ nutrientKey, onBack }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getRichFoods(nutrientKey);
      setData(result);
    } catch (err) {
      setError(err.message || 'API error');
      setData(null);
    }
    setLoading(false);
  }, [nutrientKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      <div className="meal-detail-header" style={{ marginBottom: 12 }}>
        <button type="button" className="meal-detail-back-btn" onClick={onBack}>
          <Icon name="x" size={20} />
        </button>
        <div className="meal-detail-heading">
          <div className="day-nav-subtitle">{t('report.title')}</div>
          <div className="meal-detail-title" style={{ fontSize: 21 }}>
            {data?.label || nutrientKey}
          </div>
        </div>
      </div>

      {loading && <p className="hint">{t('week.computing')}</p>}

      {error && <p className="hint error">{error}</p>}

      {!loading && !error && data && (
        <>
          <p className="hint" style={{ marginTop: -8, marginBottom: 12 }}>
            {t('richFoods.hint')}
          </p>
          <div className="report-card">
            {data.foods.length === 0 ? (
              <p className="hint">{t('sources.none')}</p>
            ) : (
              data.foods.map((f, i) => (
                <div className="micro-source-row" key={i}>
                  <span>{f.name}</span>
                  <span>
                    {f.value.toFixed(1)} {f.unit}/100g
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
