import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

// Burned vs eaten for the day, shown in two places (the journal section and the TDEE screen's
// second tab) from one component so the two can't drift apart.
//
// `balance` is the server's energyBalance block — including the decision of whether the day is
// still a forecast. That call belongs server-side: it depends on which meals the profile is
// configured with, which the client would have to re-derive.
export default function EnergyBalance({ balance }) {
  const { t } = useLanguage();
  if (!balance) return null;

  const { expenditure, eaten, balance: gap, forecast, mealsLogged, mealsTotal } = balance;
  // Positive gap = burned more than eaten. Colour follows the meaning, not the sign: a deficit is
  // the goal when cutting, so it gets the accent rather than a warning.
  const isDeficit = gap >= 0;
  const widest = Math.max(expenditure, eaten, 1);
  // A negative eaten/expenditure (e.g. a target intake below zero) would otherwise produce a
  // negative CSS width, which the browser ignores and renders as the element's default full width.
  const barWidth = (value) => `${Math.max(0, Math.min(100, (value / widest) * 100))}%`;

  return (
    <div className="card balance-card">
      <div className="balance-mode">
        <span className={forecast ? 'tdee-badge manual' : 'tdee-badge'}>
          {forecast ? t('balance.forecast') : t('balance.real')}
        </span>
        <span className="balance-meals">
          {mealsLogged}/{mealsTotal} {t('balance.mealsProgress')}
        </span>
      </div>

      <div className="balance-row">
        <span className="balance-label">
          <Icon name="flame" size={16} color="var(--warning)" />
          {t('balance.expenditure')}
        </span>
        <div className="balance-track">
          <span className="balance-fill burned" style={{ width: barWidth(expenditure) }} />
        </div>
        <b className="balance-value">{expenditure}</b>
      </div>

      <div className="balance-row">
        <span className="balance-label">
          <Icon name="utensils" size={16} color="var(--macro-carb)" />
          {forecast ? t('balance.plannedEaten') : t('balance.eaten')}
        </span>
        <div className="balance-track">
          <span className="balance-fill eaten" style={{ width: barWidth(eaten) }} />
        </div>
        <b className="balance-value">{eaten}</b>
      </div>

      <div className="balance-total">
        <span className="balance-label">{t('balance.gap')}</span>
        <b className={isDeficit ? 'balance-gap deficit' : 'balance-gap surplus'}>
          {isDeficit ? '−' : '+'}
          {Math.abs(gap)} kcal
        </b>
        <span className="balance-gap-word">
          {isDeficit ? t('balance.deficit') : t('balance.surplus')}
        </span>
      </div>

      <p className="hint balance-hint">{forecast ? t('balance.forecastHint') : t('balance.realHint')}</p>
    </div>
  );
}
