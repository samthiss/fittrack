import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * Foods that are the same thing under two names — usually one typed by hand months ago and one
 * picked from the staple catalogue since.
 *
 * Merging is destructive, so nothing happens without a choice: each group shows what it found,
 * with how often each has been logged, and the user says which name survives. The suggestion is
 * the most-used one, because that row already carries the history.
 */
export default function FoodDuplicates() {
  const { t } = useLanguage();
  const [groups, setGroups] = useState(null);
  const [keepIds, setKeepIds] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [merged, setMerged] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getFoodDuplicates();
      setGroups(data.groups);
      setKeepIds(Object.fromEntries(data.groups.map((g) => [g.suggestedKeepId, g.suggestedKeepId])));
      setError('');
    } catch (e) {
      setError(e.message || String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleMerge(group) {
    const keepId = keepIds[group.suggestedKeepId] || group.suggestedKeepId;
    const removeIds = group.items.map((i) => i.id).filter((id) => id !== keepId);
    setBusy(group.suggestedKeepId);
    try {
      await api.mergeFoods(keepId, removeIds);
      setMerged((n) => n + removeIds.length);
      await refresh();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!groups) return <p className="hint">{t('week.computing')}</p>;

  return (
    <div>
      {error && <p className="hint error">{error}</p>}
      {merged > 0 && <p className="hint success">{t('duplicates.merged').replace('{count}', merged)}</p>}

      {groups.length === 0 ? (
        <p className="hint">{t('duplicates.none')}</p>
      ) : (
        <>
          <p className="hint" style={{ marginTop: 0 }}>{t('duplicates.intro')}</p>
          {groups.map((group) => (
            <div className="card" key={group.suggestedKeepId}>
              {group.items.map((item) => {
                const selected = (keepIds[group.suggestedKeepId] || group.suggestedKeepId) === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={selected ? 'row duplicate-choice selected' : 'row duplicate-choice'}
                    onClick={() => setKeepIds((k) => ({ ...k, [group.suggestedKeepId]: item.id }))}
                  >
                    <span className={selected ? 'supplement-tag-check done' : 'supplement-tag-check'}>
                      {selected && <Icon name="check" size={12} color="var(--text-on-accent)" />}
                    </span>
                    <span className="name">
                      {item.name}
                      <div className="hint" style={{ padding: 0 }}>
                        {Math.round(item.kcal_per_100g)} kcal · {t('duplicates.uses').replace('{count}', item.useCount)}
                      </div>
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                className="btn btn-block"
                style={{ marginTop: 10 }}
                disabled={busy === group.suggestedKeepId}
                onClick={() => handleMerge(group)}
              >
                {t('duplicates.merge')}
              </button>
            </div>
          ))}
        </>
      )}
      <p className="hint" style={{ marginTop: 16 }}>{t('duplicates.hint')}</p>
    </div>
  );
}
