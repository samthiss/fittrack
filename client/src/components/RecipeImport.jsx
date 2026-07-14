import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

// Always rendered from within a chosen recipe category (RecipeList) — presetCategory says which
// meals/tag to apply automatically, so there's no separate category picker in this form anymore.
export default function RecipeImport({ onImported, onSetCategories, onUpdate, presetCategory }) {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setStatus({ text: t('recipeImport.reading') });

    try {
      const recipe = await onImported({ mode: 'text', text: text.trim() });
      if (recipe && presetCategory) {
        if (presetCategory.meals) await onSetCategories(recipe, presetCategory.meals);
        if (presetCategory.tag) await onUpdate(recipe.id, { tags: [presetCategory.tag] });
      }
      setText('');
      setStatus({ text: t('recipeImport.added') });
    } catch (err) {
      setStatus({ text: err.message || t('recipeImport.failed'), error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>{t('recipeImport.title')}</h2>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <textarea
            className="wide"
            rows={6}
            placeholder={t('recipeImport.placeholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="hint">{t('recipeImport.hint')}</p>

          <button type="submit" className="btn btn-block" disabled={loading}>
            {loading ? t('recipeImport.importing') : t('recipeImport.importAction')}
          </button>
        </form>

        {status && (
          <p className={status.error ? 'hint error' : 'hint success'}>{status.text}</p>
        )}
      </div>
    </div>
  );
}
