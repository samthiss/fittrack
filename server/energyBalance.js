// The decision behind "burned vs eaten": what the gap gets measured against, and whether the day
// still counts as a forecast.
//
// Mid-afternoon the food log is genuinely incomplete, so a raw "dépense − consommé" reads as a
// huge deficit that says nothing — you simply haven't had dinner yet. Until every configured meal
// has something in it, the day's intake target stands in for what will be eaten and the result is
// labelled a forecast; once the log is complete the real total takes over.
//
// Pure on purpose: index.js does the SQL and passes the numbers in, so the rule itself can be
// pinned by server/energyBalance.test.mjs without booting the app or its native sqlite binding.

export function computeEnergyBalance({
  expenditure,
  consumed,
  targetIntake,
  mealKeys = [],
  loggedMealKeys = [],
}) {
  const logged = new Set(loggedMealKeys);
  const mealsTotal = mealKeys.length;
  const mealsLogged = mealKeys.filter((k) => logged.has(k)).length;

  // With no meals configured at all there is nothing to wait for — treat the log as complete
  // rather than forecasting off a target forever.
  const complete = mealsTotal === 0 || mealsLogged === mealsTotal;
  const eaten = complete ? consumed : targetIntake;

  return {
    expenditure: Math.round(expenditure),
    consumed: Math.round(consumed),
    target: Math.round(targetIntake),
    // What the gap is computed against: the real total once the day is complete, the target while
    // it isn't.
    eaten: Math.round(eaten),
    // Positive = burned more than eaten, i.e. a deficit.
    balance: Math.round(expenditure - eaten),
    forecast: !complete,
    mealsLogged,
    mealsTotal,
  };
}
