import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * Opens the "foods richest in X" screen for one nutrient. Rendered on the row's figures line, at
 * the far right — as a chip rather than a sentence, because it repeats on every nutrient of the
 * report and a full "Aliments riches en Magnésium" per row buried the numbers it sits next to.
 * The nutrient stays in the accessible name, where the repetition costs nothing.
 */
export default function RichFoodsLink({ nutrientKey, label, onOpenRichFoods }) {
  const { t } = useLanguage();
  if (!onOpenRichFoods) return null;
  return (
    <button
      type="button"
      className="rich-foods-chip"
      aria-label={`${t('richFoods.link')} — ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpenRichFoods(nutrientKey);
      }}
    >
      <Icon name="sprout" size={12} />
      {t('richFoods.link')}
      <Icon name="chevron-right" size={12} />
    </button>
  );
}
