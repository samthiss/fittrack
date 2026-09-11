import { useState, useMemo, useEffect } from 'react';
import { api } from '../api';
import Icon from './Icon';
import WorkoutTemplateEditor from './WorkoutTemplateEditor';
import ExercisePicker from './ExercisePicker';
import MuscleGroupPicker from './MuscleGroupPicker';
import { useLanguage } from '../i18n/LanguageContext';
import { iconForType } from '../data/activityIcons';

// Les trois distances d'un entraînement Hyrox — le reste se règle au pas de 50 m.
const DISTANCE_PRESETS = [250, 500, 1000];

// Les huit stations d'une course Hyrox, dans l'ordre où on les enchaîne, avec la distance
// officielle pré-remplie — c'est la valeur qu'on veut neuf fois sur dix, et elle reste réglable.
// Les wall balls se comptent en répétitions : faute d'unité pour ça, elles sont en minutes.
const HYROX_STATIONS = [
  { type: 'ski_erg', distance: 1000 },
  { type: 'traineau_poussee', distance: 50 },
  { type: 'traineau_traction', distance: 50 },
  { type: 'burpees_broad_jump', distance: 80 },
  { type: 'rameur', distance: 1000 },
  // Pas des stations de la course officielle, mais de l'entraînement Hyrox : autant les avoir
  // ici plutôt que de forcer un détour par l'onglet Cardio au milieu d'une séance.
  { type: 'assault_bike', distance: 1000 },
  { type: 'velo_appartement', distance: 1000 },
  { type: 'farmers_carry', distance: 200 },
  { type: 'fentes_sandbag', distance: 100 },
  { type: 'wall_balls', minutes: 5 },
  // La course qui relie les stations : 8 × 1 km sur une vraie course.
  { type: 'course_a_pied', distance: 1000 },
];

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const FORCE_TYPES = new Set(['force']);

// A per-set target row is edited as { value: '5-9' | '8-12' | '10-15' | '15-20' | 'Max', dir:
// 'up' | 'down' | null } (a fixed choice instead of free text, so every template stays
// consistent/parseable) and flattened to a single string like "5-9↑" only at save time.
const SET_TARGET_OPTIONS = ['5-9', '8-12', '10-15', '15-20', 'Max'];
function serializeSetTarget(row) {
  if (!row.value) return '';
  return row.dir === 'up' ? `${row.value}↑` : row.dir === 'down' ? `${row.value}↓` : row.value;
}


export default function AddActivityModal({ activityTypes, date, todayDayKey, onClose, onAdded }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('cardio');
  const [selectedType, setSelectedType] = useState(null);
  const [label, setLabel] = useState('');
  const [duration, setDuration] = useState(30);
  // Distance-measured types (the Hyrox stations) are entered in metres; the duration below
  // follows from the type's pace, and stays adjustable because the pace is a default, not a fact.
  const [distance, setDistance] = useState(1000);
  // Onglet Hyrox : chaque station cochée garde sa propre distance, d'où une map plutôt qu'un
  // simple ensemble — c'est ce qui permet de construire la séance avant de la lancer.
  const [stations, setStations] = useState({});
  const [recurring, setRecurring] = useState(false);
  const [days, setDays] = useState(new Set([todayDayKey]));
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [manualExercises, setManualExercises] = useState([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showCustomExerciseForm, setShowCustomExerciseForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMuscleGroup, setCustomMuscleGroup] = useState('');
  const [customSets, setCustomSets] = useState(4);
  const [customReps, setCustomReps] = useState(10);
  const [customWeight, setCustomWeight] = useState('');
  const [customSetTargets, setCustomSetTargets] = useState([]);
  const [showMuscleGroupPicker, setShowMuscleGroupPicker] = useState(false);

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
      if (kind === 'hyrox') return false; // l'onglet Hyrox a sa propre liste, pas celle-ci
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
  const byDistance = selected?.unit === 'meters' && selected?.sec_per_100m > 0;
  // Recomputed on every change of type or distance, then left alone: the stepper below writes
  // straight into `duration`, so a measured time survives until the distance changes again.
  useEffect(() => {
    if (!byDistance) return;
    setDuration(Math.max(1, Math.round(((distance / 100) * selected.sec_per_100m) / 60)));
  }, [byDistance, distance, selected]);

  const estimatedKcal = selected ? Math.round(selected.kcal_per_hour * (duration / 60)) : null;

  const hyroxTotals = useMemo(() => {
    let kcal = 0;
    let minutes = 0;
    for (const [type, picked] of Object.entries(stations)) {
      const at = activityTypes.find((a) => a.type === type);
      if (!at) continue;
      const m =
        picked.distance != null && at.sec_per_100m ? ((picked.distance / 100) * at.sec_per_100m) / 60 : picked.minutes || 0;
      minutes += m;
      kcal += at.kcal_per_hour * (m / 60);
    }
    return { kcal: Math.round(kcal), minutes: Math.round(minutes) };
  }, [stations, activityTypes]);
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

  function addCustomExercise() {
    if (!customName.trim()) return;
    const cleanTargets = customSetTargets.map(serializeSetTarget).filter(Boolean);
    setManualExercises((list) => [
      ...list,
      {
        name: customName.trim(),
        muscle_group: customMuscleGroup.trim() || null,
        sets: cleanTargets.length > 0 ? cleanTargets.length : Number(customSets) || 3,
        reps: Number(customReps) || 10,
        weight_kg: customWeight === '' ? null : Number(customWeight),
        set_targets: cleanTargets.length > 0 ? cleanTargets : null,
      },
    ]);
    setCustomName('');
    setCustomMuscleGroup('');
    setCustomSets(4);
    setCustomReps(10);
    setCustomWeight('');
    setCustomSetTargets([]);
    setShowCustomExerciseForm(false);
  }

  function removeManualExercise(index) {
    setManualExercises((list) => list.filter((_, i) => i !== index));
  }

  // Un pas qui a du sens pour ce qu'il règle : 50 m sur une station, 250 m sur une machine
  // longue, une minute sur les wall balls.
  function stationStep(station) {
    if (station.distance == null) return 1;
    return station.distance >= 1000 ? 250 : 50;
  }

  function stationKcal(at, picked) {
    const minutes =
      picked.distance != null && at.sec_per_100m ? ((picked.distance / 100) * at.sec_per_100m) / 60 : picked.minutes || 0;
    return Math.round(at.kcal_per_hour * (minutes / 60));
  }

  function toggleStation(station) {
    setStations((prev) => {
      const next = { ...prev };
      if (next[station.type]) delete next[station.type];
      else next[station.type] = station.distance != null ? { distance: station.distance } : { minutes: station.minutes };
      return next;
    });
  }

  function adjustStation(station, sign) {
    const step = stationStep(station);
    setStations((prev) => {
      const picked = prev[station.type];
      if (!picked) return prev;
      const next = { ...prev };
      next[station.type] =
        picked.distance != null
          ? { distance: Math.max(step, picked.distance + sign * step) }
          : { minutes: Math.max(1, picked.minutes + sign) };
      return next;
    });
  }

  async function handleSubmit() {
    if (saving) return;

    // Une séance Hyrox est enregistrée station par station, une activité chacune : c'est ce qui
    // leur garde leurs mètres, leur allure et leurs kcal propres, et ce qui permet de revenir en
    // modifier une seule après coup. Le total du jour les additionne de lui-même.
    if (kind === 'hyrox') {
      const picked = Object.entries(stations);
      if (picked.length === 0) return;
      setSaving(true);
      try {
        for (const [type, value] of picked) {
          await api.addActivity({
            date,
            type,
            ...(value.distance != null ? { distance_m: value.distance } : { duration_minutes: value.minutes }),
          });
        }
        onAdded();
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!selectedType) return;
    setSaving(true);
    try {
      const finalLabel = label.trim() || undefined;
      const groupId = recurring && days.size > 0 ? crypto.randomUUID() : undefined;
      const created = await api.addActivity({
        date,
        type: selectedType,
        duration_minutes: duration,
        distance_m: byDistance ? distance : null,
        kcal: estimatedKcal,
        label: finalLabel,
        recurringGroupId: groupId,
      });
      if (kind === 'force') {
        const exercisesToAdd = [...(selectedTemplate?.exercises || []), ...manualExercises];
        if (exercisesToAdd.length > 0) await api.addActivityExercisesBulk(created.id, exercisesToAdd);
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
          <button type="button" className={kind === 'hyrox' ? 'type-pill active' : 'type-pill'} onClick={() => setKind('hyrox')}>
            {t('activityLog.kindHyrox')}
          </button>
        </div>

        {kind === 'hyrox' && (
          <>
            <p className="hint" style={{ marginTop: 0 }}>{t('activityLog.hyroxIntro')}</p>
            {HYROX_STATIONS.map((station) => {
              const at = activityTypes.find((a) => a.type === station.type);
              if (!at) return null;
              const picked = stations[station.type];
              return (
                <div className={picked ? 'activites-row clickable hyrox-station picked' : 'activites-row clickable hyrox-station'} key={station.type}>
                  <button type="button" className="hyrox-station-main" onClick={() => toggleStation(station)}>
                    <span className={picked ? 'supplement-tag-check done' : 'supplement-tag-check'}>
                      {picked && <Icon name="check" size={12} color="var(--text-on-accent)" />}
                    </span>
                    <span className="activites-row-icon">
                      <Icon name={iconForType(station.type)} size={19} />
                    </span>
                    <span className="meal-card-body">
                      <span className="meal-card-title">{t(`activityType.${station.type}`)}</span>
                      {/* Une fois cochée, la ligne ne redit plus la distance ici : elle est en
                          gros à droite, entre les boutons qui la règlent. */}
                      <span className="meal-card-kcal">
                        {picked
                          ? `${stationKcal(at, picked)} kcal`
                          : station.distance != null
                          ? `${station.distance} m`
                          : `${station.minutes} min`}
                      </span>
                    </span>
                  </button>
                  {picked && (
                    <span className="hyrox-station-steppers">
                      <button type="button" className="weight-minus-btn" onClick={() => adjustStation(station, -1)}>
                        <Icon name="minus" size={16} />
                      </button>
                      <span className="hyrox-station-value">
                        <b>{picked.distance != null ? picked.distance : picked.minutes}</b>
                        <span>{picked.distance != null ? 'm' : 'min'}</span>
                      </span>
                      <button type="button" className="weight-plus-btn" onClick={() => adjustStation(station, 1)}>
                        <Icon name="plus" size={16} />
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row">
                <span className="name">{t('activityLog.hyroxTotal').replace('{count}', Object.keys(stations).length)}</span>
                <b className="activites-row-kcal">{hyroxTotals.kcal} kcal</b>
              </div>
              <div className="row" style={{ borderBottom: 0 }}>
                <span className="name hint" style={{ padding: 0 }}>{t('activityLog.estimatedTime')}</span>
                <b>{hyroxTotals.minutes} min</b>
              </div>
            </div>
          </>
        )}

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
            <button
              type="button"
              className="recurring-feature-row"
              style={{ justifyContent: 'center', width: '100%', marginTop: 14, font: 'inherit', cursor: 'pointer' }}
              onClick={() => setShowTemplatePicker((v) => !v)}
            >
              <Icon name="bookmark" size={18} color="var(--acc)" />
              <span className="recurring-feature-title" style={{ color: 'var(--acc)' }}>
                {t('activityLog.selectSavedWorkout')}
              </span>
            </button>

            {showTemplatePicker && (
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
              </>
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

            <h4 className="section-label">{t('activityLog.exercises')}</h4>
            {manualExercises.length > 0 && (
              <div className="entry-list">
                {manualExercises.map((ex, i) => (
                  <div className="entry-card" key={i}>
                    <span className="meal-icon-box">
                      <b style={{ fontSize: 14, fontWeight: 700 }}>{i + 1}</b>
                    </span>
                    <div className="entry-card-body" style={{ cursor: 'default' }}>
                      {ex.muscle_group && <div className="entry-card-sub" style={{ marginTop: 0, marginBottom: 2 }}>{ex.muscle_group}</div>}
                      <div className="entry-card-name">{ex.name}</div>
                      <div className="entry-card-sub">
                        {ex.set_targets && ex.set_targets.length > 0
                          ? ex.set_targets.map((s, si) => `S${si + 1}: ${s}`).join(' · ')
                          : `${ex.sets} ${t('activityLog.setsShort')} × ${ex.reps} ${t('activityLog.repsShort')}`}
                      </div>
                    </div>
                    <button type="button" className="entry-icon-btn entry-delete-btn" onClick={() => removeManualExercise(i)}>
                      <Icon name="trash-2" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="recurring-feature-row"
              style={{ justifyContent: 'center', width: '100%', marginTop: 12, font: 'inherit', cursor: 'pointer' }}
              onClick={() => setShowExercisePicker(true)}
            >
              <Icon name="plus" size={18} color="var(--acc)" />
              <span className="recurring-feature-title" style={{ color: 'var(--acc)' }}>
                {t('activityLog.addExercise')}
              </span>
            </button>
          </>
        )}

        {byDistance && (
          <>
            <h4 className="section-label">{t('activityLog.distance')}</h4>
            <div className="type-list-row">
              {DISTANCE_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={distance === m ? 'type-pill active' : 'type-pill'}
                  onClick={() => setDistance(m)}
                >
                  {m} m
                </button>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
              <button type="button" className="weight-minus-btn" onClick={() => setDistance((d) => Math.max(50, d - 50))}>
                <Icon name="minus" size={18} />
              </button>
              <div style={{ textAlign: 'center', minWidth: 90 }}>
                <span className="weight-value">{distance}</span> <span className="rate">m</span>
              </div>
              <button type="button" className="weight-plus-btn" onClick={() => setDistance((d) => d + 50)}>
                <Icon name="plus" size={18} />
              </button>
            </div>
          </>
        )}

        <h4 className="section-label">{byDistance ? t('activityLog.timeForIt') : t('activityLog.estimatedTime')}</h4>
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
        disabled={(kind === 'hyrox' ? Object.keys(stations).length === 0 : !selectedType) || saving}
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

      {showExercisePicker && (
        <ExercisePicker
          onClose={() => setShowExercisePicker(false)}
          onPick={async (ex) => {
            setManualExercises((list) => [
              ...list,
              { name: ex.name, muscle_group: ex.muscle_group, sets: ex.sets, reps: ex.reps, weight_kg: ex.weight_kg, set_targets: ex.set_targets },
            ]);
          }}
          onCreateNew={() => {
            setShowExercisePicker(false);
            setShowCustomExerciseForm(true);
          }}
        />
      )}

      {showCustomExerciseForm && (
        <div className="modal-overlay" onClick={() => setShowCustomExerciseForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="meal-detail-header" style={{ marginBottom: 4 }}>
              <button type="button" className="meal-detail-back-btn" onClick={() => setShowCustomExerciseForm(false)} aria-label={t('meal.close')}>
                <Icon name="x" size={20} />
              </button>
              <div className="meal-detail-heading">
                <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('activityLog.addExercise')}</div>
              </div>
            </div>

            <h4 className="section-label" style={{ marginTop: 0 }}>{t('activityLog.exerciseName')}</h4>
            <div className="search-input-row">
              <input type="text" className="search-input" autoFocus value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={t('activityLog.exerciseName')} />
            </div>

            <h4 className="section-label">
              {t('activityLog.muscleGroup')} <span style={{ textTransform: 'none', fontWeight: 400 }}>({t('profile.optional')})</span>
            </h4>
            <button type="button" className="filter-pill" style={{ display: 'flex', width: '100%', justifyContent: 'space-between', boxSizing: 'border-box' }} onClick={() => setShowMuscleGroupPicker(true)}>
              <span>{customMuscleGroup || t('activityLog.muscleGroupPicker.none')}</span>
              <Icon name="chevron-right" size={16} color="var(--text-muted)" />
            </button>

            {customSetTargets.length === 0 && (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <h4 className="section-label">{t('activityLog.sets')}</h4>
                  <div className="search-input-row">
                    <input type="number" min="1" className="search-input" value={customSets} onChange={(e) => setCustomSets(e.target.value)} />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <h4 className="section-label">{t('activityLog.reps')}</h4>
                  <div className="search-input-row">
                    <input type="number" min="1" className="search-input" value={customReps} onChange={(e) => setCustomReps(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            <h4 className="section-label">
              {t('activityLog.setTargets')} <span style={{ textTransform: 'none', fontWeight: 400 }}>({t('profile.optional')})</span>
            </h4>
            <p className="hint" style={{ padding: '0 0 8px' }}>{t('activityLog.setTargetsHint')}</p>
            {customSetTargets.map((row, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div className="day-nav-subtitle" style={{ marginBottom: 6 }}>
                  S{i + 1}
                </div>
                <div className="type-list-row" style={{ margin: '0 0 6px', flexWrap: 'wrap' }}>
                  {SET_TARGET_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={row.value === opt ? 'type-pill active' : 'type-pill'}
                      style={{ flex: '1 1 30%' }}
                      onClick={() =>
                        setCustomSetTargets((rows) => rows.map((r, ri) => (ri === i ? { value: opt, dir: opt === 'Max' ? null : r.dir } : r)))
                      }
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {row.value !== 'Max' && (
                    <>
                      <button
                        type="button"
                        className="entry-icon-btn"
                        style={row.dir === 'up' ? { background: 'var(--acc)', color: '#fff', borderColor: 'transparent' } : undefined}
                        aria-label="up"
                        onClick={() => setCustomSetTargets((rows) => rows.map((r, ri) => (ri === i ? { ...r, dir: r.dir === 'up' ? null : 'up' } : r)))}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="entry-icon-btn"
                        style={row.dir === 'down' ? { background: 'var(--acc)', color: '#fff', borderColor: 'transparent' } : undefined}
                        aria-label="down"
                        onClick={() => setCustomSetTargets((rows) => rows.map((r, ri) => (ri === i ? { ...r, dir: r.dir === 'down' ? null : 'down' } : r)))}
                      >
                        ↓
                      </button>
                    </>
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="entry-icon-btn entry-delete-btn"
                    onClick={() => setCustomSetTargets((rows) => rows.filter((_, ri) => ri !== i))}
                  >
                    <Icon name="trash-2" size={16} />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="recurring-feature-row"
              style={{ justifyContent: 'center', width: '100%', marginBottom: 12, font: 'inherit', cursor: 'pointer' }}
              onClick={() => setCustomSetTargets((rows) => [...rows, { value: '5-9', dir: null }])}
            >
              <Icon name="plus" size={16} color="var(--acc)" />
              <span className="recurring-feature-title" style={{ color: 'var(--acc)' }}>
                S{customSetTargets.length + 1}
              </span>
            </button>

            <h4 className="section-label">{t('activityLog.weightKg')}</h4>
            <div className="search-input-row">
              <input type="number" min="0" step="0.5" className="search-input" value={customWeight} onChange={(e) => setCustomWeight(e.target.value)} />
              <span className="unit">kg</span>
            </div>
          </div>
          <button
            type="button"
            className="done-btn done-btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              addCustomExercise();
            }}
            disabled={!customName.trim()}
          >
            {t('activityLog.add')}
          </button>
        </div>
      )}

      {showMuscleGroupPicker && (
        <MuscleGroupPicker
          value={customMuscleGroup}
          onClose={() => setShowMuscleGroupPicker(false)}
          onSelect={(label) => {
            setCustomMuscleGroup(label || '');
            setShowMuscleGroupPicker(false);
          }}
        />
      )}
    </div>
  );
}
