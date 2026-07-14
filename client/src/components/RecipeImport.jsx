import { useState } from 'react';

// Always rendered from within a chosen recipe category (RecipeList) — presetCategory says which
// meals/tag to apply automatically, so there's no separate category picker in this form anymore.
export default function RecipeImport({ onImported, onSetCategories, onUpdate, presetCategory }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setStatus({ text: 'Lecture de la recette…' });

    try {
      const recipe = await onImported({ mode: 'text', text: text.trim() });
      if (recipe && presetCategory) {
        if (presetCategory.meals) await onSetCategories(recipe, presetCategory.meals);
        if (presetCategory.tag) await onUpdate(recipe.id, { tags: [presetCategory.tag] });
      }
      setText('');
      setStatus({ text: 'Recette ajoutée.' });
    } catch (err) {
      setStatus({ text: err.message || "Échec de l'import", error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Importer une recette</h2>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <textarea
            className="wide"
            rows={6}
            placeholder="Colle ici le texte de la recette (titre, description, ingrédients, étapes)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="hint">Claude lit directement ce que tu colles et en extrait les ingrédients, les étapes et les kcal.</p>

          <button type="submit" className="btn btn-block" disabled={loading}>
            {loading ? 'Import en cours…' : 'Importer la recette'}
          </button>
        </form>

        {status && (
          <p className={status.error ? 'hint error' : 'hint success'}>{status.text}</p>
        )}
      </div>
    </div>
  );
}
