import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';
import { buildPhases, localized } from '../data/intervalProtocols';

function mmss(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Déroule un protocole d'intervalles phase par phase : ce qu'il faut faire maintenant, combien de
 * temps il reste, et où l'on en est dans la séance.
 *
 * Le temps est calculé à partir d'un horodatage mural (Date.now) et non d'un compteur de ticks :
 * iOS suspend les minuteurs d'une page dès que l'écran se verrouille, et un décompte tick par tick
 * perdrait silencieusement les minutes passées écran éteint — précisément pendant un effort de
 * 4 minutes où l'on ne regarde pas son téléphone. Recalculer depuis l'heure de départ se corrige
 * de lui-même au réveil.
 */
export default function IntervalSession({ protocol, onClose, onFinished }) {
  const { t, lang } = useLanguage();
  const phases = useMemo(() => buildPhases(protocol), [protocol]);

  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  // Temps déjà écoulé sur la phase en cours avant la dernière mise en pause.
  const [carried, setCarried] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  // Cal ladder : la récupération dure ce qu'a duré le sprint précédent, il faut donc le mesurer.
  const lastMeasured = useRef(60);

  const phase = phases[index] || null;
  const phaseSeconds = phase ? (phase.seconds === 'previous' ? lastMeasured.current : phase.seconds) : 0;
  const elapsed = (carried + (paused ? 0 : now - startedAt)) / 1000;
  const remaining = typeof phaseSeconds === 'number' ? phaseSeconds - elapsed : null;

  const buzz = useCallback((pattern) => {
    // Android vibre, iOS ignore : c'est un plus, jamais ce sur quoi l'enchaînement repose.
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // pas de vibreur, tant pis
    }
  }, []);

  const goTo = useCallback(
    (nextIndex, measured) => {
      if (measured != null) lastMeasured.current = Math.max(5, Math.round(measured));
      if (nextIndex >= phases.length) {
        setDone(true);
        buzz([200, 100, 200, 100, 400]);
        return;
      }
      setIndex(nextIndex);
      setCarried(0);
      setStartedAt(Date.now());
      setPaused(false);
      buzz(phases[nextIndex].kind === 'work' ? [300] : [120, 80, 120]);
    },
    [phases, buzz]
  );

  useEffect(() => {
    if (done) return undefined;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [done]);

  // L'enchaînement se décide au rendu plutôt que dans le minuteur : au retour d'un écran
  // verrouillé, plusieurs phases ont pu s'écouler d'un coup, et cette boucle les rattrape.
  useEffect(() => {
    if (done || paused || !phase || typeof phaseSeconds !== 'number') return;
    if (elapsed >= phaseSeconds) goTo(index + 1);
  }, [elapsed, phaseSeconds, done, paused, phase, index, goTo]);

  function togglePause() {
    if (paused) {
      setStartedAt(Date.now());
      setPaused(false);
    } else {
      setCarried((c) => c + (Date.now() - startedAt));
      setPaused(true);
    }
  }

  const workDone = phases.slice(0, index).filter((p) => p.kind === 'work').length;
  const workTotal = phases.filter((p) => p.kind === 'work').length;

  if (done) {
    return (
      <div className="modal-overlay">
        <div className="modal-content interval-done">
          <Icon name="circle-check-big" size={54} color="var(--success)" />
          <h1 style={{ marginTop: 16 }}>{t('interval.finished')}</h1>
          <p className="hint">{t('interval.finishedSub').replace('{count}', workTotal)}</p>
          <button type="button" className="meal-add-cta" style={{ marginTop: 24 }} onClick={() => onFinished?.()}>
            <Icon name="check" size={19} />
            {t('interval.close')}
          </button>
        </div>
      </div>
    );
  }

  const isWork = phase.kind === 'work';
  const measured = phase.seconds === null;

  return (
    <div className="modal-overlay">
      <div className={isWork ? 'modal-content interval-screen work' : 'modal-content interval-screen rest'}>
        <div className="meal-detail-header">
          <button type="button" className="meal-detail-back-btn" onClick={onClose} aria-label={t('meal.back')}>
            <Icon name="chevron-left" size={20} />
          </button>
          <div className="meal-detail-heading">
            <div className="meal-detail-eyebrow">{localized(protocol.goal, lang)}</div>
            <div className="meal-detail-title">{protocol.label}</div>
          </div>
        </div>

        <div className="interval-phase">
          {isWork ? t('interval.work') : phase.kind === 'setRest' ? t('interval.setRest') : t('interval.rest')}
        </div>

        {/* Une phase mesurée (le cal ladder) n'a pas de décompte : elle affiche l'objectif et le
            temps qui court, et c'est l'utilisateur qui la termine. */}
        <div className="interval-clock">{measured ? mmss(elapsed) : mmss(remaining)}</div>
        {phase.target && <div className="interval-target">{phase.target}</div>}

        <div className="interval-progress">
          {phase.sets > 1 && (
            <span>
              {t('interval.set')} {phase.set}/{phase.sets} ·{' '}
            </span>
          )}
          <span>
            {t('interval.round')} {phase.round}/{phase.rounds}
          </span>
        </div>

        {/* Une pastille par effort : pleine quand il est fait. C'est le « série done » d'un coup
            d'œil, sans avoir à compter. */}
        <div className="interval-dots">
          {Array.from({ length: workTotal }, (_, i) => (
            <i key={i} className={i < workDone ? 'done' : i === workDone && isWork ? 'current' : ''} />
          ))}
        </div>

        <div className="interval-actions">
          <button type="button" className="btn btn-ghost" onClick={togglePause}>
            <Icon name={paused ? 'play' : 'pause'} size={18} />
            {paused ? t('interval.resume') : t('interval.pause')}
          </button>
          <button
            type="button"
            className="meal-add-cta interval-next"
            onClick={() => goTo(index + 1, measured ? elapsed : null)}
          >
            <Icon name="check" size={19} />
            {measured ? t('interval.doneRound') : t('interval.skip')}
          </button>
        </div>

        <p className="hint interval-detail">{localized(protocol.detail, lang)}</p>
      </div>
    </div>
  );
}
