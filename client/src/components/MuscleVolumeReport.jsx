import { useState, useEffect } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

const WEEKS = 8;

function formatVolume(kg, lang) {
  // Weekly volume runs into the tens of thousands of kilos, where the last three digits are noise.
  if (kg >= 1000) {
    const t = (kg / 1000).toFixed(1);
    return `${lang === 'en' ? t : t.replace('.', ',')} t`;
  }
  return `${Math.round(kg)} kg`;
}

function formatWeek(weekStart, lang) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${weekStart}T00:00:00Z`));
}

// Bars, not a line: these are eight discrete weeks, and a week's volume is a quantity to compare
// against its neighbours rather than a continuous quantity sampled over time. Bars sit on a
// baseline of zero, which is the only honest baseline for a magnitude.
function VolumeBars({ weeks, lang }) {
  const { t } = useLanguage();
  const max = Math.max(...weeks.map((w) => w.volume), 1);

  return (
    <div className="muscle-volume-bars">
      {weeks.map((w) => {
        const pct = (w.volume / max) * 100;
        return (
          <div className="muscle-volume-bar-col" key={w.week_start}>
            <div className="muscle-volume-bar-track">
              <div
                className="muscle-volume-bar-fill"
                style={{ height: `${Math.max(w.volume > 0 ? 3 : 0, pct)}%` }}
                title={`${formatWeek(w.week_start, lang)} — ${formatVolume(w.volume, lang)}, ${t('strength.setsCount').replace('{n}', w.sets)}`}
              />
            </div>
            <span className="muscle-volume-bar-label">{formatWeek(w.week_start, lang)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function MuscleVolumeReport() {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getMuscleVolume(WEEKS)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="hint">{t('strength.historyFailed')}</p>;
  if (!data) return <p className="hint">{t('weight.loading')}</p>;

  const weeks = data.weeks;
  const thisWeek = weeks[weeks.length - 1];
  const previousWeek = weeks[weeks.length - 2];
  const total = weeks.reduce((s, w) => s + w.volume, 0);
  if (total === 0) return <p className="hint">{t('strength.noVolume')}</p>;

  const delta = previousWeek && previousWeek.volume > 0 ? thisWeek.volume - previousWeek.volume : null;

  return (
    <div>
      <div className="tile-grid tile-grid-compact" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="tile">
          <b>{formatVolume(thisWeek.volume, lang)}</b>
          <span>{t('strength.volumeThisWeek')}</span>
        </div>
        <div className="tile">
          <b>{t('strength.setsCount').replace('{n}', thisWeek.sets)}</b>
          <span>{t('strength.setsThisWeek')}</span>
        </div>
      </div>

      {delta != null && (
        <p className="hint" style={{ paddingTop: 10 }}>
          {(delta >= 0 ? t('strength.volumeUp') : t('strength.volumeDown')).replace(
            '{amount}',
            formatVolume(Math.abs(delta), lang)
          )}
        </p>
      )}

      <h4 className="section-label">{t('strength.weeklyVolume')}</h4>
      <VolumeBars weeks={weeks} lang={lang} />

      {/* Per muscle group, for the current week only: the question this answers is "what have I
          neglected", which is about the week you can still do something about. */}
      <h4 className="section-label">{t('strength.byMuscleGroup')}</h4>
      {thisWeek.groups.length === 0 ? (
        <p className="hint">{t('strength.noVolumeThisWeek')}</p>
      ) : (
        <div className="entry-list">
          {thisWeek.groups.map((g) => (
            <div className="entry-card" key={g.muscle_group || 'ungrouped'}>
              <span className="meal-icon-box">
                <Icon name="dumbbell" size={18} />
              </span>
              <div className="entry-card-body" style={{ cursor: 'default' }}>
                <div className="entry-card-name">{g.muscle_group || t('strength.ungrouped')}</div>
                <div className="entry-card-sub">{t('strength.setsCount').replace('{n}', g.sets)}</div>
              </div>
              <span className="activites-row-kcal">{formatVolume(g.volume, lang)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
