// Expandable "d'où ça vient" list, shared by TodayReport/WeekReport rows and the fermented-foods
// microbiote row. When sources include per100g/perPortion (from buildMicroSources with db+userId),
// it shows the nutrient density alongside the total consumed.
import { useLanguage } from '../i18n/LanguageContext';

export default function SourceList({ sources, unit }) {
  const { t } = useLanguage();
  if (!sources || sources.length === 0) {
    return <p className="hint" style={{ margin: '4px 0 0' }}>{t('sources.none')}</p>;
  }
  return (
    <div className="micro-source-list">
      {sources.map((s, i) => {
        const hasDetail = typeof s.per100g === 'number';
        return (
          <div className="micro-source-row" key={i}>
            <span>{s.label}</span>
            {hasDetail ? (
              <span className="micro-source-detail">
                <span className="micro-source-density">{s.per100g.toFixed(1)} {unit}/100g</span>
                <span className="micro-source-sep">·</span>
                <span className="micro-source-portion">{s.perPortion.toFixed(1)} {unit}/portion</span>
              </span>
            ) : (
              s.value != null && <span>{s.value.toFixed(1)} {unit}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
