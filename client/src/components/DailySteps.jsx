import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

// Les paliers du stepper. Cent pas ne se sentent pas ; mille, si — et c'est l'ordre de grandeur
// auquel on se souvient de sa journée (« j'ai dû faire dans les 8 000 »).
const STEP = 500;
const BIG_STEP = 2000;

/**
 * Les pas du jour, et ce qu'ils changent à la dépense.
 *
 * Le profil porte une moyenne qui sert à tous les jours non renseignés. Dès qu'un jour a son
 * chiffre, c'est lui qui compte : la NEAT est la part du TDEE qui bouge le plus d'une journée à
 * l'autre, et une journée de bureau ne vaut pas une journée de marche.
 */
export default function DailySteps({ date, onChanged }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [value, setValue] = useState(0);
  const saveTimer = useRef(null);

  const refresh = useCallback(async () => {
    const d = await api.getSteps(date);
    setData(d);
    setValue(d.steps ?? d.defaultSteps ?? 0);
  }, [date]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  // L'enregistrement est différé : on tape souvent plusieurs fois de suite sur + , et une requête
  // par appui ferait clignoter le TDEE à chaque palier.
  const scheduleSave = useCallback(
    (next) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const saved = await api.setSteps(date, next);
        setData(saved);
        onChanged?.();
      }, 600);
    },
    [date, onChanged]
  );

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  function adjust(delta) {
    const next = Math.max(0, value + delta);
    setValue(next);
    scheduleSave(next);
  }

  async function clear() {
    clearTimeout(saveTimer.current);
    await api.clearSteps(date);
    await refresh();
    onChanged?.();
  }

  if (!data) return null;

  // Ce que la saisie ajoute ou retire par rapport au jour tel qu'il comptait sans elle.
  const neat = Math.round(data.kcalPerStep * value);
  const delta = neat - Math.round(data.kcalPerStep * (data.defaultSteps || 0));

  return (
    <div className="card daily-steps">
      <div className="daily-steps-head">
        <span className="row-icon-box weight-icon-box">
          <Icon name="footprints" size={20} />
        </span>
        <div className="name">
          {t('steps.title')}
          <div className="hint" style={{ padding: 0 }}>
            {data.logged ? t('steps.logged') : t('steps.usingAverage').replace('{value}', data.defaultSteps ?? 0)}
          </div>
        </div>
        {data.logged && (
          <button type="button" className="entry-icon-btn" onClick={clear} aria-label={t('steps.clear')}>
            <Icon name="rotate-ccw" size={16} />
          </button>
        )}
      </div>

      <div className="qty-stepper-row">
        <button type="button" className="weight-minus-btn" onClick={() => adjust(-STEP)}>
          <Icon name="minus" size={18} />
        </button>
        <div className="qty-stepper-value">
          <span className="weight-value">{value.toLocaleString('fr-FR')}</span>
          <span className="rate">{t('steps.unit')}</span>
        </div>
        <button type="button" className="weight-plus-btn qty-stepper-plus" onClick={() => adjust(STEP)}>
          <Icon name="plus" size={18} />
        </button>
      </div>

      <div className="type-list-row daily-steps-jumps">
        <button type="button" className="type-pill" onClick={() => adjust(-BIG_STEP)}>
          −{BIG_STEP.toLocaleString('fr-FR')}
        </button>
        <button type="button" className="type-pill" onClick={() => adjust(BIG_STEP)}>
          +{BIG_STEP.toLocaleString('fr-FR')}
        </button>
      </div>

      <div className="row" style={{ borderBottom: 0 }}>
        <span className="name hint" style={{ padding: 0 }}>{t('steps.neat')}</span>
        <b>
          {neat} kcal
          {delta !== 0 && (
            <span className={delta > 0 ? 'daily-steps-delta up' : 'daily-steps-delta down'}>
              {delta > 0 ? '+' : ''}
              {delta}
            </span>
          )}
        </b>
      </div>
    </div>
  );
}
