import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useLanguage } from '../i18n/LanguageContext';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function ActivityLog({ activityTypes, activities, onAdd, onDelete }) {
  const { t } = useLanguage();
  const [type, setType] = useState('');
  const [duration, setDuration] = useState('');
  const [showRecurring, setShowRecurring] = useState(false);
  const [planDays, setPlanDays] = useState([]);
  const [planEntries, setPlanEntries] = useState([]);
  const [planType, setPlanType] = useState('');
  const [planDuration, setPlanDuration] = useState('');
  const [selectedDays, setSelectedDays] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!type && activityTypes.length > 0) setType(activityTypes[0].type);
    if (!planType && activityTypes.length > 0) setPlanType(activityTypes[0].type);
  }, [activityTypes, type, planType]);

  const refreshPlan = useCallback(async () => {
    const { days, entries } = await api.getActivityPlan();
    setPlanDays(days);
    setPlanEntries(entries);
  }, []);

  useEffect(() => {
    if (showRecurring) refreshPlan();
  }, [showRecurring, refreshPlan]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!type || !duration) return;
    onAdd({ type, duration_minutes: Number(duration) }).then(() => setDuration(''));
  }

  function toggleDay(dayKey) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  }

  function toggleAllDays() {
    setSelectedDays((prev) => (prev.size === planDays.length ? new Set() : new Set(planDays.map((d) => d.key))));
  }

  async function handleAddRecurring(e) {
    e.preventDefault();
    if (!planType || !planDuration || selectedDays.size === 0) return;
    setSaving(true);
    try {
      await api.addActivityPlan({
        days: [...selectedDays],
        type: planType,
        duration_minutes: Number(planDuration),
      });
      setPlanDuration('');
      setSelectedDays(new Set());
      await refreshPlan();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRecurring(id) {
    await api.deleteActivityPlan(id);
    await refreshPlan();
  }

  const labelFor = (t) => activityTypes.find((a) => a.type === t)?.label || t;
  const dayLabelFor = (d) => planDays.find((p) => p.key === d)?.label || d;

  // Group flat (day, type, duration) rows back into one card per activity, listing its days —
  // "Course à pied · 30 min" with "Lun, Mer, Ven" instead of 3 separate identical-looking rows.
  const groups = [];
  for (const entry of planEntries) {
    const key = `${entry.type}-${entry.duration_minutes}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, type: entry.type, duration_minutes: entry.duration_minutes, items: [] };
      groups.push(group);
    }
    group.items.push(entry);
  }
  for (const g of groups) {
    g.items.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
  }

  return (
    <div>
      <h2>{t('activityLog.title')}</h2>
      <div className="card">
        <form className="inline-row" onSubmit={handleSubmit}>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {activityTypes.map((a) => (
              <option key={a.type} value={a.type}>
                {a.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder={t('activityLog.durationPlaceholder')}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            min="1"
            required
          />
          <button type="submit" className="btn btn-small">
            {t('activityLog.add')}
          </button>
        </form>

        {activities.length === 0 ? (
          <p className="hint">{t('activityLog.none')}</p>
        ) : (
          activities.map((a) => (
            <div className="row" key={a.id}>
              <div className="name">
                <span>{labelFor(a.type)}</span>
                <span className="rate">{a.duration_minutes} min</span>
              </div>
              <div className="field">
                <b>{Math.round(a.kcal)} kcal</b>
                <button className="btn-ghost" onClick={() => onDelete(a.id)}>
                  {t('activityLog.delete')}
                </button>
              </div>
            </div>
          ))
        )}

        <div className="card-actions" style={{ padding: 0 }}>
          <button type="button" className="btn-ghost" onClick={() => setShowRecurring(true)}>
            {t('activityLog.recurring')}
          </button>
        </div>
      </div>

      {showRecurring && (
        <div className="modal-overlay" onClick={() => setShowRecurring(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{t('activityLog.recurringTitle')}</h2>
            <p className="hint">{t('activityLog.recurringHint')}</p>

            {groups.length === 0 ? (
              <p className="hint">{t('activityLog.noRecurring')}</p>
            ) : (
              groups.map((g) => (
                <div className="row ingredient-sub-row" key={g.key}>
                  <div className="name">
                    <span>{labelFor(g.type)}</span>
                    <span className="rate">
                      {g.duration_minutes} min · {g.items.map((i) => dayLabelFor(i.day).slice(0, 3)).join(', ')}
                    </span>
                  </div>
                  <div className="field">
                    {g.items.map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        className="btn-ghost"
                        title={`${t('activityLog.remove')} ${dayLabelFor(i.day)}`}
                        onClick={() => handleDeleteRecurring(i.id)}
                      >
                        {dayLabelFor(i.day).slice(0, 3)} ✕
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}

            <h4 className="section-label">{t('activityLog.addSection')}</h4>
            <form onSubmit={handleAddRecurring}>
              <div className="row">
                <label>{t('activityLog.activity')}</label>
                <div className="field">
                  <select value={planType} onChange={(e) => setPlanType(e.target.value)}>
                    {activityTypes.map((a) => (
                      <option key={a.type} value={a.type}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row">
                <label>{t('activityLog.duration')}</label>
                <div className="field">
                  <input
                    type="number"
                    min="1"
                    placeholder={t('activityLog.durationPlaceholder')}
                    value={planDuration}
                    onChange={(e) => setPlanDuration(e.target.value)}
                  />
                  <span className="unit">min</span>
                </div>
              </div>

              <div className="day-chip-row">
                <button
                  type="button"
                  className={selectedDays.size === planDays.length ? 'day-chip active' : 'day-chip'}
                  onClick={toggleAllDays}
                >
                  {t('activityLog.all')}
                </button>
                {planDays.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className={selectedDays.has(d.key) ? 'day-chip active' : 'day-chip'}
                    onClick={() => toggleDay(d.key)}
                  >
                    {d.label.slice(0, 3)}
                  </button>
                ))}
              </div>

              <button type="submit" className="btn btn-block" disabled={saving}>
                {saving ? t('activityLog.saving') : t('activityLog.add')}
              </button>
            </form>

            <button type="button" className="done-btn" onClick={() => setShowRecurring(false)}>
              {t('activityLog.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
