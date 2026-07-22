import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';
import { MUSCLE_GROUP_KEYS } from '../data/muscleGroups';

// Full-screen exercise picker shown when tapping "Ajouter" on a force session: search + filter
// by muscle group across every exercise this user has ever logged (their real history — no
// fabricated exercise catalog/images), tap one to add it instantly with its last-used sets/reps/
// weight, or fall back to creating a brand new one.
export default function ExercisePicker({ onClose, onPick, onCreateNew }) {
  const { t } = useLanguage();
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
    return library.filter((e) => {
      if (muscleFilter && e.muscle_group !== muscleFilter) return false;
      if (term && !e.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [library, search, muscleFilter]);

  async function handlePick(ex) {
    await onPick(ex);
    setAddedIds((prev) => new Set([...prev, ex.name]));
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
          <div className="filter-pill-row">
            <button
              type="button"
              className={muscleFilter === null ? 'filter-pill active' : 'filter-pill'}
              onClick={() => setMuscleFilter(null)}
            >
              {t('activityLog.allMuscleGroups')}
            </button>
            {muscleGroups.map((g) => (
              <button
                key={g}
                type="button"
                className={muscleFilter === g ? 'filter-pill active' : 'filter-pill'}
                onClick={() => setMuscleFilter((v) => (v === g ? null : g))}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {library === null ? (
          <p className="hint">{t('weight.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="hint">{library.length === 0 ? t('activityLog.libraryEmpty') : t('activityLog.noResults')}</p>
        ) : (
          <div className="entry-list">
            {filtered.map((ex) => {
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
            })}
          </div>
        )}
      </div>
      <button type="button" className="done-btn done-btn-primary" onClick={(e) => { e.stopPropagation(); onClose(); }}>
        {t('planner.close')}
      </button>
    </div>
  );
}
