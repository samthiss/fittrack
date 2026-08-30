import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

// Accent-insensitive contains, so typing "epinard" still finds "épinard".
function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function RichFoodsReport({ nutrientKey, onBack }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

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

  const foods = useMemo(() => {
    const all = data?.foods || [];
    if (!query.trim()) return all;
    const q = normalize(query.trim());
    return all.filter((f) => normalize(f.name).includes(q));
  }, [data, query]);

  // Bars are relative to the richest food in the list, not to a daily target: the question this
  // screen answers is "which of these is densest", and the top item is the only meaningful 100%.
  const maxValue = foods.length > 0 ? Math.max(...foods.map((f) => f.value)) : 0;

  return (
    <div>
      <div className="meal-detail-header" style={{ marginBottom: 12 }}>
        <button type="button" className="meal-detail-back-btn" onClick={onBack} aria-label={t('home.close')}>
          <Icon name="x" size={20} />
        </button>
        <div className="meal-detail-heading">
          <div className="meal-detail-eyebrow">{t('richFoods.link')}</div>
          <div className="meal-detail-title" style={{ fontSize: 21 }}>
            {data?.label || nutrientKey}
          </div>
        </div>
      </div>

      {loading && (
        <div className="report-card rich-foods-card">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="rich-food-row" key={i}>
              <span className="skeleton-line" style={{ width: `${60 - i * 6}%`, height: 13 }} />
            </div>
          ))}
        </div>
      )}

      {error && <p className="hint error">{error}</p>}

      {!loading && !error && data && (
        <>
          <div className="card rich-foods-summary">
            <div className="rich-foods-summary-top">
              <span className="rich-foods-count">
                {foods.length}
                <span> {t('richFoods.foods')}</span>
              </span>
              <span className="rich-foods-unit">{data.unit}/100 g</span>
            </div>
            <p className="hint">{t('richFoods.hint')}</p>
          </div>

          <div className="search-input-row">
            <Icon name="search" size={18} color="var(--text-muted)" />
            <input
              type="text"
              className="search-input"
              value={query}
              placeholder={t('richFoods.search')}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="report-card rich-foods-card">
            {foods.length === 0 ? (
              <p className="hint">{t('sources.none')}</p>
            ) : (
              foods.map((f, i) => (
                <div className="rich-food-row" key={f.name}>
                  <span className="rich-food-rank">{String(i + 1).padStart(2, '0')}</span>
                  <div className="rich-food-body">
                    <div className="rich-food-top">
                      <span className="rich-food-name">{f.name}</span>
                      <span className="rich-food-value">
                        {f.value.toFixed(1)} <span>{f.unit}</span>
                      </span>
                    </div>
                    <div className="progress-track rich-food-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${maxValue > 0 ? Math.max(3, (f.value / maxValue) * 100) : 0}%`,
                          background: 'var(--gradient-arc)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
