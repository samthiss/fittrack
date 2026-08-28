import { useState } from 'react';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

// The whole schedule vocabulary: how often, and (optionally) when in the day. Anything finer
// would be a calendar, which is not what this section is for.
const INTAKE_PRESETS = [
  { key: 'daily_1', frequency: 'daily', times_per_day: 1, labelKey: 'supplements.intakeDaily1' },
  { key: 'daily_2', frequency: 'daily', times_per_day: 2, labelKey: 'supplements.intakeDaily2' },
  { key: 'monthly_1', frequency: 'monthly', times_per_day: 1, labelKey: 'supplements.intakeMonthly1' },
];
const MOMENTS = ['matin', 'soir'];

const EMPTY_FORM = { name: '', frequency: 'daily', times_per_day: 1, time_of_day: [] };

function presetKey(s) {
  return s.frequency === 'monthly' ? 'monthly_1' : `daily_${s.times_per_day > 1 ? 2 : 1}`;
}

function intakeLabel(s, t) {
  const preset = INTAKE_PRESETS.find((p) => p.key === presetKey(s));
  return t(preset.labelKey);
}

// A supplement taken 1 of its 2 daily times is neither ticked nor untouched — the checkbox has to
// say so, otherwise the first tap of the day looks like it did nothing.
function checkClass(s, extra = '') {
  const partial = !s.taken && s.takenCount > 0;
  return `supplement-check${extra}${s.taken ? ' done' : ''}${partial ? ' partial' : ''}`;
}

function momentsLabel(moments, t) {
  return (moments || []).map((m) => t(`supplements.moment_${m}`)).join(' · ');
}

function SupplementForm({ initial, onSubmit, onCancel, submitLabel }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');

  function toggleMoment(moment) {
    setForm((f) => ({
      ...f,
      time_of_day: f.time_of_day.includes(moment)
        ? f.time_of_day.filter((m) => m !== moment)
        : [...f.time_of_day, moment],
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(t('supplements.nameRequired'));
      return;
    }
    onSubmit({ ...form, name: form.name.trim() });
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

      <h4 className="section-label">{t('supplements.intake')}</h4>
      <div className="filter-pill-row">
        {INTAKE_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.key}
            className={presetKey(form) === preset.key ? 'filter-pill active' : 'filter-pill'}
            onClick={() =>
              setForm((f) => ({ ...f, frequency: preset.frequency, times_per_day: preset.times_per_day }))
            }
          >
            {t(preset.labelKey)}
          </button>
        ))}
      </div>

      <h4 className="section-label">{t('supplements.moment')}</h4>
      <div className="filter-pill-row">
        {MOMENTS.map((moment) => (
          <button
            type="button"
            key={moment}
            className={form.time_of_day.includes(moment) ? 'filter-pill active' : 'filter-pill'}
            onClick={() => toggleMoment(moment)}
          >
            {t(`supplements.moment_${moment}`)}
          </button>
        ))}
      </div>

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
                frequency: s.frequency,
                times_per_day: s.times_per_day,
                time_of_day: s.time_of_day || [],
              }}
              onSubmit={(form) => handleUpdate(s.id, form)}
              onCancel={() => setEditingId(null)}
              submitLabel={t('supplements.save')}
            />
          ) : (
            <div className={s.taken ? 'entry-card supplement-card taken' : 'entry-card supplement-card'} key={s.id}>
              <button
                type="button"
                className={checkClass(s)}
                onClick={() => run(() => onToggleTaken(s.id, !s.taken))}
                aria-label={t('supplements.markTaken')}
              >
                {s.taken ? (
                  <Icon name="check" size={16} color="var(--text-on-accent)" />
                ) : (
                  s.takenCount > 0 && <b>{s.takenCount}</b>
                )}
              </button>
              <div className="entry-card-body">
                <div className="entry-card-name-row">
                  <span className="entry-card-name">{s.name}</span>
                </div>
                <div className="entry-card-sub">
                  {intakeLabel(s, t)}
                  {s.time_of_day?.length > 0 ? ` · ${momentsLabel(s.time_of_day, t)}` : ''}
                </div>
                {s.times_per_day > 1 && (
                  <div className="supplement-intake-dots">
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
