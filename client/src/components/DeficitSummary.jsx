const GOAL_LABELS = {
  lose: 'Perte de poids',
  gain: 'Prise de poids',
  maintain: 'Maintien du poids',
};

export default function DeficitSummary({ summary }) {
  if (!summary) return null;
  const { profile, activitiesKcal, tdee, targetIntake } = summary;

  return (
    <div>
      <h2>Calcul du jour</h2>
      <div className="result">
        <div className="res-line">
          <span>Métabolisme de base</span>
          <b>{Math.round(profile.bmr)}</b>
        </div>
        <div className="res-line">
          <span>Mouvement quotidien</span>
          <b>{Math.round(profile.daily_movement_kcal)}</b>
        </div>
        <div className="res-line">
          <span>Digestion</span>
          <b>{Math.round(profile.digestion_kcal)}</b>
        </div>
        <div className="res-line">
          <span>Activités (net)</span>
          <b>{Math.round(activitiesKcal)}</b>
        </div>
        <div className="res-line total">
          <span>Dépense totale</span>
          <b>{Math.round(tdee)}</b>
        </div>

        <div className="eat">
          <span className="eat-lab">Objectif : {GOAL_LABELS[profile.goal]}</span>
          <span className="eat-num">{Math.round(targetIntake)}</span>
          <span className="eat-unit">kcal à consommer</span>
        </div>
      </div>
    </div>
  );
}
