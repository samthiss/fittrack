import { useLanguage } from '../i18n/LanguageContext';

const GOAL_LABEL_KEYS = {
  lose: 'deficitSummary.goalLose',
  gain: 'deficitSummary.goalGain',
  maintain: 'deficitSummary.goalMaintain',
};

export default function DeficitSummary({ summary }) {
  const { t } = useLanguage();
  if (!summary) return null;
  const { profile, activitiesKcal, tdee, targetIntake } = summary;

  return (
    <div>
      <h2>{t('deficitSummary.title')}</h2>
      <div className="result">
        <div className="res-line">
          <span>{t('deficitSummary.bmr')}</span>
          <b>{Math.round(profile.bmr)}</b>
        </div>
        <div className="res-line">
          <span>{t('deficitSummary.movement')}</span>
          <b>{Math.round(profile.daily_movement_kcal)}</b>
        </div>
        <div className="res-line">
          <span>{t('deficitSummary.digestion')}</span>
          <b>{Math.round(profile.digestion_kcal)}</b>
        </div>
        <div className="res-line">
          <span>{t('deficitSummary.activities')}</span>
          <b>{Math.round(activitiesKcal)}</b>
        </div>
        <div className="res-line total">
          <span>{t('deficitSummary.total')}</span>
          <b>{Math.round(tdee)}</b>
        </div>

        <div className="eat">
          <span className="eat-lab">
            {t('deficitSummary.goal')} : {t(GOAL_LABEL_KEYS[profile.goal])}
          </span>
          <span className="eat-num">{Math.round(targetIntake)}</span>
          <span className="eat-unit">{t('deficitSummary.toEat')}</span>
        </div>
      </div>
    </div>
  );
}
