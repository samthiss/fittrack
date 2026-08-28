import { useState } from 'react';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const EMPTY_FORM = { name: '', dose: '', frequency: 'daily', days: [], times_per_day: 1, time_of_day: '' };

function dayLabels(t) {
  return {
    mon: t('home.weekdayMon'),
    tue: t('home.weekdayTue'),
    wed: t('home.weekdayWed'),
    thu: t('home.weekdayThu'),
    fri: t('home.weekdayFri'),
    sat: t('home.weekdaySat'),
    sun: t('home.weekdaySun'),
  };
}

function frequencyText(s, t) {
  const labels = dayLabels(t);
  if (s.frequency === 'as_needed') return t('supplements.freqAsNeeded');
  const base =
    s.frequency === 'days'
      ? DAY_ORDER.filter((d) => s.days.includes(d))
          .map((d) => labels[d])
          .join(', ')
      : t('supplements.freqDaily');
  return s.times_per_day > 1 ? `${base} · ${s.times_per_day}×/${t('supplements.perDay')}` : base;
}

function SupplementForm({ initial, onSubmit, onCancel, submitLabel }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const labels = dayLabels(t);

  function toggleDay(day) {
    setForm((f) => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day],
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(t('supplements.nameRequired'));
      return;
    }
    onSubmit({ ...form, name: form.name.trim(), dose: form.dose.trim() });
  }

  return (
    <form className="card supplement-form" onSubmit={handleSubmit}>
      <h4 className="section-label">{t('supplements.name')}</h4>
      <input
        className="search-input"
        value={form.name}
        placeholder={t('supplements.namePlaceholder')}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
      />
      <h4 className="section-label">{t('supplements.dose')}</h4>
      <input
        className="search-input"
        value={form.dose}
        placeholder={t('supplements.dosePlaceholder')}
        onChange={(e) => setForm((f) => ({ ...f, dose: e.target.value }))}
      />

      <h4 className="section-label">{t('supplements.frequency')}</h4>
      <div className="filter-pill-row">
        {['daily', 'days', 'as_needed'].map((freq) => (
          <button
            type="button"
            key={freq}
            className={form.frequency === freq ? 'filter-pill active' : 'filter-pill'}
            onClick={() => setForm((f) => ({ ...f, frequency: freq }))}
          >
            {t(`supplements.freq_${freq}`)}
          </button>
        ))}
      </div>
      {form.frequency === 'days' && (
        <div className="filter-pill-row supplement-day-row">
          {DAY_ORDER.map((day) => (
            <button
              type="button"
              key={day}
              className={form.days.includes(day) ? 'filter-pill active' : 'filter-pill'}
              onClick={() => toggleDay(day)}
            >
              {labels[day]}
            </button>
          ))}
        </div>
      )}

      {form.frequency !== 'as_needed' && (
        <>
          <h4 className="section-label">{t('supplements.timesPerDay')}</h4>
          <div className="filter-pill-row">
            {[1, 2, 3, 4].map((n) => (
              <button
                type="button"
                key={n}
                className={form.times_per_day === n ? 'filter-pill active' : 'filter-pill'}
                onClick={() => setForm((f) => ({ ...f, times_per_day: n }))}
              >
                {n}×
              </button>
            ))}
          </div>
        </>
      )}

      <h4 className="section-label">{t('supplements.moment')}</h4>
      <input
        className="search-input"
        value={form.time_of_day}
        placeholder={t('supplements.momentPlaceholder')}
        onChange={(e) => setForm((f) => ({ ...f, time_of_day: e.target.value }))}
      />

      {error && <p className="hint error">{error}</p>}
      <div className="card-actions supplement-form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('supplements.cancel')}
        </button>
        <button type="submit" className="btn">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export default function SupplementsScreen({ data, date, onBack, onAdd, onUpdate, onDelete, onToggleTaken }) {
  const { t } = useLanguage();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  // The screen renders even before the first fetch lands (or if it failed): the header and the
  // "+" must stay reachable, otherwise a hiccup on the request leaves an empty page with no way back.
  const { supplements = [], dueCount = 0, takenCount = 0 } = data || {};
  const pct = dueCount > 0 ? Math.round((takenCount / dueCount) * 100) : 0;

  // Any failed write is shown in place — silently doing nothing reads as a frozen screen.
  async function run(action) {
    try {
      await action();
      setError('');
      return true;
    } catch (e) {
      setError(e.message || String(e));
      return false;
    }
  }

  async function handleAdd(form) {
    if (await run(() => onAdd(form))) setAdding(false);
  }

  async function handleUpdate(id, form) {
    if (await run(() => onUpdate(id, form))) setEditingId(null);
  }

  return (
    <div>
      <div className="meal-detail-header">
        <button className="meal-detail-back-btn" onClick={onBack} aria-label={t('meal.back')}>
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="meal-detail-heading">
          <div className="meal-detail-eyebrow">{date}</div>
          <div className="meal-detail-title">{t('supplements.title')}</div>
        </div>
        <button
          type="button"
          className="round-add-btn"
          onClick={() => {
            setEditingId(null);
            setAdding((a) => !a);
          }}
          aria-label={t('supplements.add')}
        >
          <Icon name={adding ? 'x' : 'plus'} size={20} color="var(--text-on-accent)" />
        </button>
      </div>

      <div className="card supplement-progress-card">
        <div className="resume-water-top">
          <span>{t('supplements.takenToday')}</span>
          <span>
            {takenCount} / {dueCount}
          </span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--macro-protein)' }} />
        </div>
      </div>

      {error && <p className="hint error">{error}</p>}

      {adding && (
        <SupplementForm
          initial={EMPTY_FORM}
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
          submitLabel={t('supplements.add')}
        />
      )}

      {supplements.length === 0 && !adding && <p className="hint">{t('supplements.empty')}</p>}

      <div className="entry-list">
        {supplements.map((s) =>
          editingId === s.id ? (
            <SupplementForm
              key={s.id}
              initial={{
                name: s.name,
                dose: s.dose || '',
                frequency: s.frequency,
                days: s.days || [],
                times_per_day: s.times_per_day,
                time_of_day: s.time_of_day || '',
              }}
              onSubmit={(form) => handleUpdate(s.id, form)}
              onCancel={() => setEditingId(null)}
              submitLabel={t('supplements.save')}
            />
          ) : (
            <div className={s.taken ? 'entry-card supplement-card taken' : 'entry-card supplement-card'} key={s.id}>
              <button
                type="button"
                className={s.taken ? 'supplement-check done' : 'supplement-check'}
                onClick={() => run(() => onToggleTaken(s.id, !s.taken))}
                aria-label={t('supplements.markTaken')}
              >
                {s.taken && <Icon name="check" size={16} color="var(--text-on-accent)" />}
              </button>
              <div className="entry-card-body">
                <div className="entry-card-name-row">
                  <span className="entry-card-name">{s.name}</span>
                  {s.dose && <span className="chip">{s.dose}</span>}
                </div>
                <div className="entry-card-sub">
                  {frequencyText(s, t)}
                  {s.time_of_day ? ` · ${s.time_of_day}` : ''}
                  {!s.dueToday && s.frequency !== 'as_needed' ? ` · ${t('supplements.notToday')}` : ''}
                </div>
                {s.times_per_day > 1 && (
                  <div className="supplement-dose-dots">
                    {Array.from({ length: s.times_per_day }, (_, i) => (
                      <i key={i} className={i < s.takenCount ? 'filled' : ''} />
                    ))}
                    <span>
                      {s.takenCount} / {s.times_per_day}
                    </span>
                  </div>
                )}
              </div>
              <div className="entry-card-actions">
                {s.times_per_day > 1 && s.takenCount > 0 && (
                  <button
                    type="button"
                    className="entry-icon-btn"
                    onClick={() => run(() => onToggleTaken(s.id, false))}
                    aria-label={t('supplements.undo')}
                  >
                    <Icon name="minus" size={16} />
                  </button>
                )}
                <button
                  type="button"
                  className="entry-icon-btn"
                  onClick={() => {
                    setAdding(false);
                    setEditingId(s.id);
                  }}
                  aria-label={t('supplements.edit')}
                >
                  <Icon name="pencil" size={16} />
                </button>
                <button
                  type="button"
                  className="entry-icon-btn entry-delete-btn"
                  onClick={() => run(() => onDelete(s.id))}
                  aria-label={t('supplements.delete')}
                >
                  <Icon name="trash-2" size={16} />
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
