import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';
import { MUSCLE_GROUP_REGIONS } from '../data/muscleGroups';

// Bottom-sheet picker for the fixed muscle-group taxonomy (see data/muscleGroups.js) — stores the
// localized label itself (e.g. "Quadriceps"), matching how muscle_group was already stored as
// free text before this picker existed, so old and new values render identically everywhere.
export default function MuscleGroupPicker({ value, onSelect, onClose }) {
  const { t } = useLanguage();

  return (
    <div className="modal-overlay bottom-sheet-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '75vh', overflowY: 'auto' }}>
        <div className="bottom-sheet-handle" />
        <div className="bottom-sheet-header-row">
          <div className="bottom-sheet-title" style={{ margin: 0 }}>{t('activityLog.muscleGroupPicker.title')}</div>
          <button type="button" className="entry-icon-btn" onClick={onClose} aria-label={t('meal.close')}>
            <Icon name="x" size={17} />
          </button>
        </div>

        <div className="filter-pill-row" style={{ marginTop: 14 }}>
          <button
            type="button"
            className={!value ? 'filter-pill active' : 'filter-pill'}
            onClick={() => onSelect(null)}
          >
            {t('activityLog.muscleGroupPicker.none')}
          </button>
        </div>

        {MUSCLE_GROUP_REGIONS.map((region) => (
          <div key={region.key} style={{ marginTop: 12 }}>
            <div className="day-nav-subtitle" style={{ marginBottom: 6 }}>{t(`muscleGroupRegion.${region.key}`)}</div>
            <div className="filter-pill-row" style={{ marginTop: 0, flexWrap: 'wrap', overflow: 'visible' }}>
              {region.groupKeys.map((key) => {
                const label = t(`muscleGroup.${key}`);
                return (
                  <button
                    key={key}
                    type="button"
                    className={value === label ? 'filter-pill active' : 'filter-pill'}
                    onClick={() => onSelect(label)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
