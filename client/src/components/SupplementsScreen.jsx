import { useState } from 'react';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';
import { formatDateLabel, formatDateSubtitle } from '../data/dates';

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
  return t(INTAKE_PRESETS.find((p) => p.key === presetKey(s)).labelKey);
}

// Supplements are shown in bands by when they're taken. A supplement carrying both moments gets
// its own band rather than appearing twice: one tick is one intake, so listing it in two places
// would suggest two independent checkboxes that don't exist.
function momentGroupKey(s) {
  const moments = MOMENTS.filter((m) => (s.time_of_day || []).includes(m));
  return moments.length > 0 ? moments.join('+') : '';
}

const GROUP_ORDER = ['matin', 'matin+soir', 'soir', ''];

function groupLabel(key, t) {
  if (!key) return t('supplements.noMoment');
  return key
    .split('+')
    .map((m) => t(`supplements.moment_${m}`))
    .join(' · ');
}

function SupplementForm({ initial, onSubmit, onCancel, submitLabel, suggestions = [] }) {
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

      {/* Supplements taken off the list before: one tap puts back the name AND the schedule it
          had, which is the whole point of keeping them on file. */}
      {suggestions.length > 0 && (
        <>
          <h4 className="section-label">{t('supplements.previously')}</h4>
          <div className="filter-pill-row">
            {suggestions.map((sug) => (
              <button
                type="button"
                key={sug.id}
                className={form.name === sug.name ? 'filter-pill active' : 'filter-pill'}
                onClick={() =>
                  setForm({
                    name: sug.name,
                    frequency: sug.frequency,
                    times_per_day: sug.times_per_day,
                    time_of_day: sug.time_of_day || [],
                  })
                }
              >
                {sug.name}
              </button>
            ))}
          </div>
        </>
      )}

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

// One supplement = one tag. Tapping it logs an intake (or removes the last one); in manage mode
// it opens the form instead, and a delete button appears on the tag itself.
function SupplementTag({ supplement: s, manage, confirming, onTap, onDelete, t }) {
  const partial = !s.taken && s.takenCount > 0;
  const className = [
    'supplement-tag',
    s.taken ? 'taken' : '',
    partial ? 'partial' : '',
    manage ? 'manage' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={className}>
      <button type="button" className="supplement-tag-main" onClick={onTap}>
        <span className="supplement-tag-check">
          {s.taken ? (
            <Icon name="check" size={12} color="var(--text-on-accent)" />
          ) : (
            partial && <b>{s.takenCount}</b>
          )}
        </span>
        <span className="supplement-tag-name">{s.name}</span>
        {s.times_per_day > 1 && (
          <span className="supplement-tag-count">
            {s.takenCount}/{s.times_per_day}
          </span>
        )}
        {s.frequency === 'monthly' && <span className="supplement-tag-count">{intakeLabel(s, t)}</span>}
      </button>
      {manage && (
        <button
          type="button"
          className={confirming ? 'supplement-tag-delete confirming' : 'supplement-tag-delete'}
          onClick={onDelete}
          aria-label={t('supplements.delete')}
        >
          <Icon name={confirming ? 'trash-2' : 'x'} size={12} />
        </button>
      )}
    </span>
  );
}

export default function SupplementsScreen({ data, date, onBack, onAdd, onUpdate, onDelete, onToggleTaken }) {
  const { t, lang } = useLanguage();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [manage, setManage] = useState(false);
  // A tap on a tag's delete arms it; the second tap within that state actually deletes. No modal,
  // but no one-tap loss of a supplement either.
  const [confirmingId, setConfirmingId] = useState(null);
  const [error, setError] = useState('');

  // The screen renders even before the first fetch lands (or if it failed): the header and the
  // "+" must stay reachable, otherwise a hiccup on the request leaves an empty page with no way back.
  const { supplements = [], archived = [], dueCount = 0, takenCount = 0 } = data || {};
  const pct = dueCount > 0 ? Math.round((takenCount / dueCount) * 100) : 0;
  const allTaken = dueCount > 0 && takenCount === dueCount;

  const groups = GROUP_ORDER.map((key) => ({
    key,
    label: groupLabel(key, t),
    items: supplements.filter((s) => momentGroupKey(s) === key),
  })).filter((g) => g.items.length > 0);

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

  function handleTap(s) {
    setConfirmingId(null);
    if (manage) {
      setAdding(false);
      setEditingId(s.id);
      return;
    }
    run(() => onToggleTaken(s.id, !s.taken));
  }

  function handleDelete(s) {
    if (confirmingId !== s.id) {
      setConfirmingId(s.id);
      return;
    }
    setConfirmingId(null);
    run(() => onDelete(s.id));
  }

  const editing = supplements.find((s) => s.id === editingId);

  return (
    <div>
      <div className="meal-detail-header">
        <button className="meal-detail-back-btn" onClick={onBack} aria-label={t('meal.back')}>
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="meal-detail-heading">
          <div className="meal-detail-eyebrow">{formatDateLabel(date, t)}</div>
          <div className="meal-detail-title">{t('supplements.title')}</div>
        </div>
        <button
          type="button"
          className="round-add-btn"
          onClick={() => {
            setEditingId(null);
            setManage(false);
            setAdding((a) => !a);
          }}
          aria-label={t('supplements.add')}
        >
          <Icon name={adding ? 'x' : 'plus'} size={20} color="var(--text-on-accent)" />
        </button>
      </div>

      <div className={allTaken ? 'card supplement-progress-card done' : 'card supplement-progress-card'}>
        <div className="supplement-progress-top">
          <div>
            <div className="supplement-progress-count">
              {takenCount}
              <span> / {dueCount}</span>
            </div>
            <div className="supplement-progress-label">
              {allTaken ? t('supplements.allTaken') : t('supplements.takenToday')}
            </div>
          </div>
          <div className="supplement-progress-date">{formatDateSubtitle(date, lang)}</div>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${pct}%`, background: allTaken ? 'var(--success)' : 'var(--gradient-arc)' }}
          />
        </div>
      </div>

      {error && <p className="hint error">{error}</p>}

      {adding && (
        <SupplementForm
          initial={EMPTY_FORM}
          suggestions={archived}
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
          submitLabel={t('supplements.add')}
        />
      )}

      {editing && (
        <SupplementForm
          key={editing.id}
          initial={{
            name: editing.name,
            frequency: editing.frequency,
            times_per_day: editing.times_per_day,
            time_of_day: editing.time_of_day || [],
          }}
          onSubmit={(form) => handleUpdate(editing.id, form)}
          onCancel={() => setEditingId(null)}
          submitLabel={t('supplements.save')}
        />
      )}

      {supplements.length === 0 && !adding ? (
        <div className="card supplement-empty">
          <span className="supplement-icon-box">
            <Icon name="pill" size={22} />
          </span>
          <p className="hint">{t('supplements.empty')}</p>
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            {t('supplements.add')}
          </button>
        </div>
      ) : (
        <>
          {groups.map((group) => (
            <div key={group.key || 'none'}>
              <div className="section-header">
                <span className="section-title">{group.label}</span>
              </div>
              <div className="supplement-tag-row">
                {group.items.map((s) => (
                  <SupplementTag
                    key={s.id}
                    supplement={s}
                    manage={manage}
                    confirming={confirmingId === s.id}
                    onTap={() => handleTap(s)}
                    onDelete={() => handleDelete(s)}
                    t={t}
                  />
                ))}
              </div>
            </div>
          ))}

          {supplements.length > 0 && (
            <button
              type="button"
              className="btn btn-block btn-block-secondary supplement-manage-btn"
              onClick={() => {
                setManage((m) => !m);
                setConfirmingId(null);
                setEditingId(null);
              }}
            >
              <Icon name={manage ? 'check' : 'pencil'} size={15} />
              {manage ? t('supplements.manageDone') : t('supplements.manage')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
