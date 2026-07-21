import { useState } from 'react';
import { api } from '../api';
import Icon from './Icon';
import ExercisePicker from './ExercisePicker';
import { useLanguage } from '../i18n/LanguageContext';

// Full-screen editor for an existing saved workout template: rename it, add exercises (from the
// picker or brand new), remove any, or delete the whole template.
export default function WorkoutTemplateEditor({ template, onClose, onSaved, onDeleted }) {
  const { t } = useLanguage();
  const [name, setName] = useState(template.name);
  const [exercises, setExercises] = useState(template.exercises);
  const [showPicker, setShowPicker] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMuscleGroup, setCustomMuscleGroup] = useState('');
  const [customSets, setCustomSets] = useState(4);
  const [customReps, setCustomReps] = useState(10);
  const [customWeight, setCustomWeight] = useState('');
  const [saving, setSaving] = useState(false);

  function removeExercise(index) {
    setExercises((list) => list.filter((_, i) => i !== index));
  }

  function addCustomExercise() {
    if (!customName.trim()) return;
    setExercises((list) => [
      ...list,
      {
        name: customName.trim(),
        muscle_group: customMuscleGroup.trim() || null,
        sets: Number(customSets) || 3,
        reps: Number(customReps) || 10,
        weight_kg: customWeight === '' ? null : Number(customWeight),
      },
    ]);
    setCustomName('');
    setCustomMuscleGroup('');
    setCustomSets(4);
    setCustomReps(10);
    setCustomWeight('');
    setShowCustomForm(false);
  }

  async function handleSave() {
    if (!name.trim() || exercises.length === 0 || saving) return;
    setSaving(true);
    try {
      const updated = await api.updateWorkoutTemplate(template.id, { name: name.trim(), exercises });
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(t('activityLog.confirmDeleteTemplate'))) return;
    await api.deleteWorkoutTemplate(template.id);
    onDeleted(template.id);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="meal-detail-header" style={{ marginBottom: 4 }}>
          <button type="button" className="meal-detail-back-btn" onClick={onClose} aria-label={t('meal.close')}>
            <Icon name="x" size={20} />
          </button>
          <div className="meal-detail-heading">
            <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('activityLog.editTemplate')}</div>
          </div>
          <button type="button" className="entry-icon-btn entry-delete-btn" onClick={handleDelete} aria-label={t('activityLog.delete')}>
            <Icon name="trash-2" size={17} />
          </button>
        </div>

        <h4 className="section-label" style={{ marginTop: 0 }}>{t('activityLog.templateName')}</h4>
        <div className="search-input-row">
          <input type="text" className="search-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('activityLog.templateNamePlaceholder')} />
        </div>

        <h4 className="section-label">{t('activityLog.exercises')}</h4>
        {exercises.length === 0 ? (
          <p className="hint">{t('activityLog.noExercises')}</p>
        ) : (
          <div className="entry-list">
            {exercises.map((ex, i) => (
              <div className="entry-card" key={i}>
                <span className="meal-icon-box">
                  <b style={{ fontSize: 14, fontWeight: 700 }}>{i + 1}</b>
                </span>
                <div className="entry-card-body" style={{ cursor: 'default' }}>
                  {ex.muscle_group && <div className="entry-card-sub" style={{ marginTop: 0, marginBottom: 2 }}>{ex.muscle_group}</div>}
                  <div className="entry-card-name">{ex.name}</div>
                  <div className="entry-card-sub">
                    {ex.sets} {t('activityLog.setsShort')} × {ex.reps} {t('activityLog.repsShort')}
                    {ex.weight_kg != null ? ` · ${ex.weight_kg} kg` : ''}
                  </div>
                </div>
                <button type="button" className="entry-icon-btn entry-delete-btn" onClick={() => removeExercise(i)}>
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
          onClick={() => setShowPicker(true)}
        >
          <Icon name="plus" size={18} color="var(--acc)" />
          <span className="recurring-feature-title" style={{ color: 'var(--acc)' }}>{t('activityLog.add')}</span>
        </button>
      </div>
      <button
        type="button"
        className="done-btn done-btn-primary"
        onClick={(e) => {
          e.stopPropagation();
          handleSave();
        }}
        disabled={saving || !name.trim() || exercises.length === 0}
      >
        <Icon name="check" size={20} />
        {saving ? t('activityLog.saving') : t('meal.save')}
      </button>

      {showPicker && (
        <ExercisePicker
          onClose={() => setShowPicker(false)}
          onPick={async (ex) => {
            setExercises((list) => [
              ...list,
              { name: ex.name, muscle_group: ex.muscle_group, sets: ex.sets, reps: ex.reps, weight_kg: ex.weight_kg },
            ]);
          }}
          onCreateNew={() => {
            setShowPicker(false);
            setShowCustomForm(true);
          }}
        />
      )}

      {showCustomForm && (
        <div className="modal-overlay" onClick={() => setShowCustomForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="meal-detail-header" style={{ marginBottom: 4 }}>
              <button type="button" className="meal-detail-back-btn" onClick={() => setShowCustomForm(false)} aria-label={t('meal.close')}>
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
            <div className="search-input-row">
              <input
                type="text"
                className="search-input"
                value={customMuscleGroup}
                onChange={(e) => setCustomMuscleGroup(e.target.value)}
                placeholder={t('activityLog.muscleGroupPlaceholder')}
              />
            </div>

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
    </div>
  );
}
