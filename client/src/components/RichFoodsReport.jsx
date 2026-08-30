import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

// Fixed display order: what you'd reach for first when you're short on a nutrient — whole
// vegetables and pulses before oils and drinks. A category with nothing in it is skipped, so a
// nutrient found only in fish shows a single band.
const CATEGORY_ORDER = [
  'legumes',
  'legumineuses',
  'fruits',
  'cereales',
  'noix_graines',
  'poissons',
  'viandes',
  'laitiers',
  'herbes',
  'huiles',
  'condiments',
  'boissons',
  'divers',
];

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
  // Deliberately the overall maximum, not the group's — bars stay comparable across categories,
  // which is the whole point of showing 34 g of chia next to 8.6 g of artichoke.
  const maxValue = foods.length > 0 ? Math.max(...foods.map((f) => f.value)) : 0;

  // Ranks are assigned before grouping, so a row keeps its place in the overall ranking: seeing
  // 01, 02, 03 all sitting under "Noix & graines" is itself the answer to "where are the fibres".
  const groups = useMemo(() => {
    const ranked = foods.map((f, i) => ({ ...f, rank: i + 1 }));
    const byCategory = new Map();
    for (const food of ranked) {
      const key = food.cat || 'divers';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(food);
    }
    const known = CATEGORY_ORDER.filter((key) => byCategory.has(key));
    const unknown = [...byCategory.keys()].filter((key) => !CATEGORY_ORDER.includes(key));
    return [...known, ...unknown].map((key) => ({ key, items: byCategory.get(key) }));
  }, [foods]);

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

          {foods.length === 0 && <p className="hint">{t('sources.none')}</p>}

          {groups.map((group) => (
            <div key={group.key}>
              <div className="section-header">
                <span className="section-title">{t(`foodCategory.${group.key}`)}</span>
                <span className="section-hint">{group.items.length}</span>
              </div>
              <div className="report-card rich-foods-card">
                {group.items.map((f) => (
                  <div className="rich-food-row" key={f.name}>
                    <span className="rich-food-rank">{String(f.rank).padStart(2, '0')}</span>
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
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
