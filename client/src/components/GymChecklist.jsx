import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * What not to forget when leaving for the gym, and which locker the bag is in.
 *
 * Both are tied to the day being viewed rather than kept as standing state: a tick means "packed
 * for today's session", and a locker number is worthless the moment you have gone home — a number
 * left over from last week is worse than no number, because it looks current.
 */
export default function GymChecklist({ date }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [locker, setLocker] = useState('');
  const [lockerEditing, setLockerEditing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await api.getChecklist(date);
      setData(result);
      setLocker(result.locker);
      setError('');
    } catch (e) {
      setError(e.message || String(e));
    }
  }, [date]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(action) {
    try {
      setData(await action());
      setError('');
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    await run(() => api.addChecklistItem(date, label));
    setNewLabel('');
  }

  async function handleRename(id) {
    const label = editLabel.trim();
    if (!label) return;
    await run(() => api.updateChecklistItem(id, date, label));
    setEditingId(null);
  }

  async function handleSaveLocker() {
    const result = await api.setLocker(date, locker.trim());
    setData(result);
    setLocker(result.locker);
    setLockerEditing(false);
  }

  const items = data?.items || [];
  const checkedCount = data?.checkedCount || 0;
  const pct = items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 0;

  return (
    <div>
      <div className="section-header">
        <span className="section-title">{t('checklist.lockerTitle')}</span>
      </div>
      {/* The number gets a card of its own, set large: it is looked up in a hurry, in a corridor,
          usually one-handed. */}
      <div className={data?.locker ? 'card locker-card filled' : 'card locker-card'}>
        <span className="locker-icon">
          <Icon name="lock" size={22} />
        </span>
        {lockerEditing || !data?.locker ? (
          <>
            <input
              className="search-input locker-input"
              value={locker}
              inputMode="numeric"
              placeholder={t('checklist.lockerPlaceholder')}
              onChange={(e) => setLocker(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveLocker()}
            />
            <button type="button" className="btn btn-small" onClick={handleSaveLocker}>
              {t('meal.save')}
            </button>
          </>
        ) : (
          <>
            <div className="locker-value">{data.locker}</div>
            <button type="button" className="entry-icon-btn" onClick={() => setLockerEditing(true)} aria-label={t('supplements.edit')}>
              <Icon name="pencil" size={16} />
            </button>
            <button
              type="button"
              className="entry-icon-btn entry-delete-btn"
              onClick={() => run(() => api.setLocker(date, ''))}
              aria-label={t('checklist.lockerClear')}
            >
              <Icon name="x" size={16} />
            </button>
          </>
        )}
      </div>

      <div className="section-header">
        <span className="section-title">{t('checklist.title')}</span>
        {items.length > 0 && (
          <span className="section-hint">
            <b>{checkedCount}</b> / {items.length}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <div className="progress-track" style={{ marginBottom: 12 }}>
          <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--gradient-arc)' }} />
        </div>
      )}

      {error && <p className="hint error">{error}</p>}

      <div className="entry-list">
        {items.map((item) => (
          <div className={item.checked ? 'entry-card checklist-row done' : 'entry-card checklist-row'} key={item.id}>
            <button
              type="button"
              className={item.checked ? 'supplement-tag-check done' : 'supplement-tag-check'}
              onClick={() => run(() => api.setChecklistChecked(item.id, date, !item.checked))}
              aria-label={t('checklist.toggle')}
            >
              {item.checked && <Icon name="check" size={12} color="var(--text-on-accent)" />}
            </button>
            {editingId === item.id ? (
              <input
                className="search-input"
                value={editLabel}
                autoFocus
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(item.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onBlur={() => handleRename(item.id)}
              />
            ) : (
              <span
                className="entry-card-name checklist-label"
                onClick={() => {
                  setEditingId(item.id);
                  setEditLabel(item.label);
                }}
              >
                {item.label}
              </span>
            )}
            <button
              type="button"
              className="entry-icon-btn entry-delete-btn"
              onClick={() => run(() => api.deleteChecklistItem(item.id, date))}
              aria-label={t('supplements.delete')}
            >
              <Icon name="trash-2" size={16} />
            </button>
          </div>
        ))}
      </div>

      {items.length === 0 && <p className="hint">{t('checklist.empty')}</p>}

      <form className="search-input-row checklist-add" onSubmit={handleAdd}>
        <Icon name="plus" size={18} color="var(--text-muted)" />
        <input
          className="search-input"
          value={newLabel}
          placeholder={t('checklist.addPlaceholder')}
          onChange={(e) => setNewLabel(e.target.value)}
        />
      </form>

      {checkedCount > 0 && (
        <button
          type="button"
          className="btn btn-block btn-block-secondary"
          style={{ marginTop: 12 }}
          onClick={() => run(() => api.uncheckAllChecklist(date))}
        >
          <Icon name="rotate-ccw" size={15} />
          {t('checklist.uncheckAll')}
        </button>
      )}
    </div>
  );
}
