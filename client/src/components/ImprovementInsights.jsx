import { useLanguage } from '../i18n/LanguageContext';

export default function ImprovementInsights({ insights }) {
  const { t } = useLanguage();
  if (!insights) return null;
  const { deficiencies, excesses, supplements } = insights;
  if (deficiencies.length === 0 && excesses.length === 0 && supplements.length === 0) {
    return (
      <div className="card">
        <p className="hint" style={{ margin: 0 }}>{t('insights.nothing')}</p>
      </div>
    );
  }

  return (
    <div>
      {excesses.length > 0 && (
        <>
          <h4 className="section-label">{t('insights.excessesTitle')}</h4>
          <div className="card">
            {excesses.map((e) => (
              <div className="row" key={e.key} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <div className="name">
                  <span>{e.label}</span>
                  <span className="rate" style={{ color: 'var(--danger)' }}>{Math.round(e.pct)}% {t('insights.ofThreshold')}</span>
                </div>
                {e.topSources.length > 0 && (
                  <p className="hint" style={{ margin: 0 }}>
                    👉 {t('insights.reducePriority')} : {e.topSources.map((s) => s.label).join(', ')}.
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {deficiencies.length > 0 && (
        <>
          <h4 className="section-label">{t('insights.deficienciesTitle')}</h4>
          <div className="card">
            {deficiencies.map((d) => (
              <div className="row" key={d.key} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <div className="name">
                  <span>{d.label}</span>
                  <span className="rate">{Math.round(d.pct)}%</span>
                </div>
                {d.suggestion && (
                  <p className="hint" style={{ margin: 0 }}>👉 {t('insights.add')} {d.suggestion}.</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {supplements.length > 0 && (
        <>
          <h4 className="section-label">{t('insights.supplementsTitle')}</h4>
          <div className="card">
            {supplements.map((s) => (
              <p className="hint" key={s.key} style={{ margin: '4px 0' }}>
                <b>{s.label}</b> : {s.suggestion}.
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
