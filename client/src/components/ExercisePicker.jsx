import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';
import { MUSCLE_GROUP_KEYS } from '../data/muscleGroups';
import { EXERCISE_LIBRARY } from '../data/exercises';

// Full-screen exercise picker shown when tapping "Ajouter" on a force session: search + filter
// by muscle group across every exercise this user has ever logged (their real history) plus the
// built-in catalog (data/exercises.js) for exercises not logged yet — one flat list, not split
// into separate "history"/"suggestions" sections. Tap one to add it — a logged exercise comes
// back with its last-used sets/reps/weight, a catalog one with sane defaults — or fall back to
// creating a brand new one.
export default function ExercisePicker({ onClose, onPick, onCreateNew }) {
  const { t, lang } = useLanguage();
  const [library, setLibrary] = useState(null);
  const [search, setSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState(null);
  const [addedIds, setAddedIds] = useState(new Set());

  useEffect(() => {
    api.getExerciseLibrary().then(setLibrary);
  }, []);

  // The fixed taxonomy (see data/muscleGroups.js), not just whatever's already in this user's
  // history — otherwise a category with no logged exercises yet could never be filtered to.
  const muscleGroups = useMemo(() => MUSCLE_GROUP_KEYS.map((key) => t(`muscleGroup.${key}`)), [t]);

  const filtered = useMemo(() => {
    if (!library) return [];
    const term = search.trim().toLowerCase();
    const loggedNames = new Set(library.map((e) => e.name.toLowerCase()));

    const history = library.filter((e) => {
      if (muscleFilter && e.muscle_group !== muscleFilter) return false;
      if (term && !e.name.toLowerCase().includes(term)) return false;
      return true;
    });

    const catalog = [];
    for (const key of MUSCLE_GROUP_KEYS) {
      const label = t(`muscleGroup.${key}`);
      if (muscleFilter && muscleFilter !== label) continue;
      for (const entry of EXERCISE_LIBRARY[key] || []) {
        const name = lang === 'en' ? entry.en : entry.fr;
        if (loggedNames.has(name.toLowerCase())) continue;
        if (term && !name.toLowerCase().includes(term)) continue;
        catalog.push({ name, muscle_group: label, sets: 4, reps: 10, weight_kg: null });
      }
    }

    return [...history, ...catalog];
  }, [library, search, muscleFilter, t, lang]);

  async function handlePick(ex) {
    await onPick(ex);
    setAddedIds((prev) => new Set([...prev, ex.name]));
  }

  function renderRow(ex) {
    const added = addedIds.has(ex.name);
    return (
      <div className="entry-card" key={ex.name} onClick={() => handlePick(ex)}>
        <span className="meal-icon-box">
          <Icon name="dumbbell" size={19} />
        </span>
        <div className="entry-card-body" style={{ cursor: 'pointer' }}>
          {ex.muscle_group && <div className="entry-card-sub" style={{ marginTop: 0, marginBottom: 2 }}>{ex.muscle_group}</div>}
          <div className="entry-card-name">{ex.name}</div>
          <div className="entry-card-sub">
            {ex.sets} {t('activityLog.setsShort')} × {ex.reps} {t('activityLog.repsShort')}
            {ex.weight_kg != null ? ` · ${ex.weight_kg} kg` : ''}
          </div>
        </div>
        <span className={added ? 'plan-pick-btn added' : 'plan-pick-btn'}>
          <Icon name={added ? 'check' : 'plus'} size={18} />
        </span>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="meal-detail-header" style={{ marginBottom: 4 }}>
          <button type="button" className="meal-detail-back-btn" onClick={onClose} aria-label={t('meal.close')}>
            <Icon name="x" size={20} />
          </button>
          <div className="meal-detail-heading">
            <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('activityLog.addExercise')}</div>
          </div>
        </div>

        <div className="search-input-row">
          <Icon name="search" size={18} color="var(--text-muted)" />
          <input
            type="text"
            className="search-input"
            placeholder={t('activityLog.searchExercise')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="recurring-feature-row"
          style={{ justifyContent: 'center', width: '100%', marginTop: 12, font: 'inherit', cursor: 'pointer' }}
          onClick={onCreateNew}
        >
          <Icon name="plus" size={18} color="var(--acc)" />
          <span className="recurring-feature-title" style={{ color: 'var(--acc)' }}>{t('activityLog.newExercise')}</span>
        </button>

        {muscleGroups.length > 0 && (
          <select
            className="filter-select"
            value={muscleFilter ?? ''}
            onChange={(e) => setMuscleFilter(e.target.value || null)}
          >
            <option value="">{t('activityLog.allMuscleGroups')}</option>
            {muscleGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}

        {library === null ? (
          <p className="hint">{t('weight.loading')}</p>
        ) : (
          <>
            {filtered.length > 0 ? (
              <div className="entry-list">{filtered.map((ex) => renderRow(ex))}</div>
            ) : (
              <p className="hint">{library.length === 0 ? t('activityLog.libraryEmpty') : t('activityLog.noResults')}</p>
            )}
          </>
        )}
      </div>
      <button type="button" className="done-btn done-btn-primary" onClick={(e) => { e.stopPropagation(); onClose(); }}>
        {t('planner.close')}
      </button>
    </div>
  );
}
