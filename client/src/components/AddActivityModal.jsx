import { useState, useMemo, useEffect } from 'react';
import { api } from '../api';
import Icon from './Icon';
import WorkoutTemplateEditor from './WorkoutTemplateEditor';
import { useLanguage } from '../i18n/LanguageContext';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const FORCE_TYPES = new Set(['force']);

const TYPE_ICONS = {
  force: 'dumbbell',
  velo_ville: 'bike',
  stepper: 'footprints',
};

function iconForType(type) {
  if (TYPE_ICONS[type]) return TYPE_ICONS[type];
  if (type?.startsWith('marche')) return 'footprints';
  return 'activity';
}

export default function AddActivityModal({ activityTypes, date, todayDayKey, onClose, onAdded }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('cardio');
  const [selectedType, setSelectedType] = useState(null);
  const [label, setLabel] = useState('');
  const [duration, setDuration] = useState(30);
  const [recurring, setRecurring] = useState(false);
  const [days, setDays] = useState(new Set([todayDayKey]));
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);

  useEffect(() => {
    if (kind === 'force') {
      setSelectedType('force');
      api.getWorkoutTemplates().then(setTemplates);
    }
  }, [kind]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activityTypes.filter((at) => {
      const isForce = FORCE_TYPES.has(at.type);
      if (kind === 'force' && !isForce) return false;
      if (kind === 'cardio' && isForce) return false;
      if (!term) return true;
      return t(`activityType.${at.type}`).toLowerCase().includes(term);
    });
  }, [activityTypes, kind, search, t]);

  // "Force" only ever has a single option ("Entraînement de force"), so requiring a tap on it
  // before the sole button unlocks is easy to miss — auto-select whenever a filter narrows to
  // exactly one match instead of leaving the submit button silently disabled.
  useEffect(() => {
    if (filtered.length === 1 && selectedType !== filtered[0].type) {
      setSelectedType(filtered[0].type);
    }
  }, [filtered]);

  const selected = activityTypes.find((at) => at.type === selectedType);
  const estimatedKcal = selected ? Math.round(selected.kcal_per_hour * (duration / 60)) : null;
  const selectedTemplate = templates.find((tpl) => tpl.id === selectedTemplateId);

  function toggleDay(key) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function pickTemplate(tpl) {
    setSelectedTemplateId((id) => (id === tpl.id ? null : tpl.id));
    if (!label.trim()) setLabel(tpl.name);
  }

  async function handleSubmit() {
    if (!selectedType || saving) return;
    setSaving(true);
    try {
      const finalLabel = label.trim() || undefined;
      const groupId = recurring && days.size > 0 ? crypto.randomUUID() : undefined;
      const created = await api.addActivity({
        date,
        type: selectedType,
        duration_minutes: duration,
        kcal: estimatedKcal,
        label: finalLabel,
        recurringGroupId: groupId,
      });
      if (kind === 'force' && selectedTemplate) {
        for (const ex of selectedTemplate.exercises) {
          await api.addActivityExercise(created.id, ex);
        }
      }
      if (groupId) {
        await api.addActivityPlan({ days: [...days], type: selectedType, duration_minutes: duration, label: finalLabel, groupId });
      }
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  const WEEKDAY_LABEL = { mon: 'L', tue: 'M', wed: 'M', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="meal-detail-header" style={{ marginBottom: 4 }}>
          <button type="button" className="meal-detail-back-btn" onClick={onClose} aria-label={t('meal.close')}>
            <Icon name="x" size={20} />
          </button>
          <div className="meal-detail-heading">
            <div className="day-nav-subtitle">{t('nav.activities')}</div>
            <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('activityLog.addActivity')}</div>
          </div>
        </div>

        <h4 className="section-label" style={{ marginTop: 0 }}>{t('activityLog.sessionType')}</h4>
        <div className="type-list-row">
          <button type="button" className={kind === 'force' ? 'type-pill active' : 'type-pill'} onClick={() => setKind('force')}>
            {t('activityLog.kindForce')}
          </button>
          <button type="button" className={kind === 'cardio' ? 'type-pill active' : 'type-pill'} onClick={() => setKind('cardio')}>
            {t('activityLog.kindCardio')}
          </button>
        </div>

        {kind === 'cardio' && (
          <>
            <div className="search-input-row">
              <Icon name="search" size={18} color="var(--text-muted)" />
              <input
                type="text"
                className="search-input"
                placeholder={t('activityLog.searchActivity')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <h4 className="section-label">{t('activityLog.choose')}</h4>
            <div className="entry-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
              {filtered.length === 0 && <p className="hint">{t('activityLog.noResults')}</p>}
              {filtered.map((at) => {
                const isSelected = selectedType === at.type;
                return (
                  <div
                    key={at.type}
                    className={isSelected ? 'entry-card activity-session-exercise current' : 'entry-card'}
                    onClick={() => setSelectedType(at.type)}
                  >
                    <span className="meal-icon-box">
                      <Icon name={iconForType(at.type)} size={19} />
                    </span>
                    <div className="entry-card-body" style={{ cursor: 'pointer' }}>
                      <div className="entry-card-name">{t(`activityType.${at.type}`)}</div>
                      <div className="entry-card-sub">≈ {Math.round(at.kcal_per_hour / 2)} kcal / 30 min</div>
                    </div>
                    {isSelected && <Icon name="circle-check-big" size={20} color="var(--acc)" />}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {kind === 'force' && (
          <>
            <h4 className="section-label">{t('activityLog.savedWorkouts')}</h4>
            {templates.length === 0 ? (
              <p className="hint">{t('activityLog.noSavedWorkouts')}</p>
            ) : (
              <div className="entry-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {templates.map((tpl) => {
                  const isSelected = selectedTemplateId === tpl.id;
                  const muscleGroups = [...new Set(tpl.exercises.map((e) => e.muscle_group).filter(Boolean))];
                  return (
                    <div
                      key={tpl.id}
                      className={isSelected ? 'entry-card activity-session-exercise current' : 'entry-card'}
                      style={{ flexWrap: 'wrap', alignItems: muscleGroups.length > 0 ? 'flex-start' : 'center' }}
                      onClick={() => pickTemplate(tpl)}
                    >
                      <span className="meal-icon-box">
                        <Icon name="dumbbell" size={19} />
                      </span>
                      <div className="entry-card-body" style={{ cursor: 'pointer' }}>
                        <div className="entry-card-name">{tpl.name}</div>
                        <div className="entry-card-sub">
                          {tpl.exercises.length} {t('activityLog.exercises')}
                        </div>
                        {muscleGroups.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {muscleGroups.map((g) => (
                              <span key={g} className="filter-pill" style={{ cursor: 'default', padding: '5px 11px', fontSize: 12 }}>
                                {g}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="entry-icon-btn"
                        style={{ flex: 'none' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTemplate(tpl);
                        }}
                        aria-label={t('activityLog.editTemplate')}
                      >
                        <Icon name="pencil" size={15} />
                      </button>
                      {isSelected && <Icon name="circle-check-big" size={20} color="var(--acc)" />}
                    </div>
                  );
                })}
              </div>
            )}
            {selectedTemplateId && (
              <p className="hint">{t('activityLog.savedWorkoutHint')}</p>
            )}

            <h4 className="section-label">{t('activityLog.workoutName')}</h4>
            <div className="search-input-row">
              <Icon name="pencil" size={18} color="var(--text-muted)" />
              <input
                type="text"
                className="search-input"
                placeholder={t('activityLog.workoutNamePlaceholder')}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          </>
        )}

        <h4 className="section-label">{t('activityLog.duration')}</h4>
        <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
          <button type="button" className="weight-minus-btn" onClick={() => setDuration((d) => Math.max(5, d - 5))}>
            <Icon name="minus" size={18} />
          </button>
          <div style={{ textAlign: 'center', minWidth: 70 }}>
            <span className="weight-value">{duration}</span> <span className="rate">min</span>
          </div>
          <button type="button" className="weight-plus-btn" onClick={() => setDuration((d) => d + 5)}>
            <Icon name="plus" size={18} />
          </button>
        </div>

        <h4 className="section-label">{t('activityLog.recurrence')}</h4>
        <div
          className={recurring ? 'recurring-feature-row active' : 'recurring-feature-row'}
          onClick={() => setRecurring((v) => !v)}
        >
          <span className="recurring-feature-icon">
            <Icon name="repeat" size={20} />
          </span>
          <div className="recurring-feature-body">
            <div className="recurring-feature-title">{t('activityLog.recurringActivity')}</div>
            <div className="recurring-feature-desc">{t('activityLog.recurringActivityDesc')}</div>
          </div>
          <span className={recurring ? 'recurring-feature-check checked' : 'recurring-feature-check'}>
            <Icon name="check" size={16} />
          </span>
        </div>
        {recurring && (
          <div className="day-chip-row" style={{ marginTop: 18 }}>
            {DAY_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                className={days.has(key) ? 'day-chip active' : 'day-chip'}
                onClick={() => toggleDay(key)}
              >
                {WEEKDAY_LABEL[key]}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="row" style={{ marginTop: 14 }}>
            <div className="name">
              <span>{t('activityLog.estimatedBurn')}</span>
            </div>
            <div className="field">
              <b className="weight-value" style={{ fontSize: 22 }}>
                {estimatedKcal} kcal
              </b>
            </div>
          </div>
        )}

      </div>
      {!selectedType && <p className="hint" style={{ textAlign: 'center', margin: '0 16px 8px' }}>{t('activityLog.pickTypeHint')}</p>}
      <button
        type="button"
        className="done-btn done-btn-primary"
        onClick={(e) => {
          e.stopPropagation();
          handleSubmit();
        }}
        disabled={!selectedType || saving}
      >
        {saving ? t('activityLog.saving') : t('activityLog.addToJournal')}
      </button>

      {editingTemplate && (
        <WorkoutTemplateEditor
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSaved={(updated) => {
            setTemplates((list) => list.map((tpl) => (tpl.id === updated.id ? updated : tpl)));
            setEditingTemplate(null);
          }}
          onDeleted={(id) => {
            setTemplates((list) => list.filter((tpl) => tpl.id !== id));
            if (selectedTemplateId === id) setSelectedTemplateId(null);
            setEditingTemplate(null);
          }}
        />
      )}
    </div>
  );
}
