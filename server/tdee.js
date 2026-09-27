// TDEE = BMR + NEAT + TEF + EAT.
//
// Everything here is derived from data the app already holds (profile measurements, the steps/day
// the user sets, the macro split, the day's logged activities) — the only number still typed by
// hand is the step count, and the manual BMR escape hatch for someone with a lab measurement.
//
// Pure functions, no db: server/tdee.test.mjs imports this file directly.

export const BMR_METHODS = ['katch', 'mifflin', 'manual'];

// Mifflin-St Jeor — the standard estimate when body composition is unknown. Also the formula the
// onboarding uses, so a profile that never visits Réglages keeps the same BMR it was given.
export function mifflinStJeor({ sex, weightKg, heightCm, age }) {
  if (!weightKg || !heightCm || age == null) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === 'male') return base + 5;
  if (sex === 'female') return base - 161;
  return base - 78; // 'other'/unset — midpoint of the male/female offsets
}

// Katch-McArdle — drives BMR off lean mass instead of sex/height/age, so it's the more accurate of
// the two once a body-fat measurement exists (it's the only one that can tell 80 kg lean from
// 80 kg at 30% fat).
export function katchMcArdle({ weightKg, bodyFatPct }) {
  if (!weightKg || bodyFatPct == null || bodyFatPct <= 0 || bodyFatPct >= 100) return null;
  const leanMassKg = weightKg * (1 - bodyFatPct / 100);
  return 370 + 21.6 * leanMassKg;
}

export function ageFromBirthdate(birthdate, today = new Date()) {
  if (!birthdate) return null;
  const born = new Date(`${birthdate}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < born.getUTCDate())) age -= 1;
  return age >= 0 ? age : null;
}

// Which formula a profile actually gets: the explicit choice when its inputs are there, otherwise
// the other one, otherwise the stored number. Returning the method used (not just the value) is
// what lets the UI say "estimé via Katch-McArdle" instead of showing an unexplained figure.
export function computeBmr(profile, today = new Date()) {
  const weightKg = profile.weight_kg;
  const age = ageFromBirthdate(profile.birthdate, today);
  const katch = katchMcArdle({ weightKg, bodyFatPct: profile.body_fat_pct });
  const mifflin = mifflinStJeor({ sex: profile.sex, weightKg, heightCm: profile.height_cm, age });

  const requested = BMR_METHODS.includes(profile.bmr_method)
    ? profile.bmr_method
    : profile.body_fat_pct != null
      ? 'katch'
      : 'mifflin';

  if (requested === 'manual') return { value: profile.bmr || 0, method: 'manual', katch, mifflin };
  if (requested === 'katch' && katch != null) return { value: katch, method: 'katch', katch, mifflin };
  if (requested === 'mifflin' && mifflin != null) return { value: mifflin, method: 'mifflin', katch, mifflin };
  // Asked for a formula whose inputs are missing (no body fat logged yet, no birthdate...):
  // fall back rather than dropping BMR to 0, which would wreck the day's target.
  const fallback = katch ?? mifflin;
  if (fallback != null) return { value: fallback, method: fallback === katch ? 'katch' : 'mifflin', katch, mifflin };
  return { value: profile.bmr || 0, method: 'manual', katch, mifflin };
}

// NEAT — everything burned outside deliberate exercise, which for a phone-less tracker means the
// step count.
//
// Elle est comptée NETTE, comme toute dépense de l'app : le métabolisme de base de ces minutes-là
// est déjà dans le BMR des 24 heures, et le laisser ici le compterait deux fois. C'est ce qui
// distingue ce calcul de la règle empirique qu'il remplace (0,04 kcal/pas, une valeur brute), et
// ce qui le met d'accord avec la marche loguée comme activité : les mêmes dix mille pas coûtaient
// 423 kcal ici et 279 là-bas.
//
// La chaîne est celle des activités : les pas donnent une distance, la distance une durée, et la
// durée se facture au MET de la marche, moins le repos.
export const DEFAULT_STEPS_PER_DAY = 7500;

// La longueur de pas se déduit de la taille (≈ 0,415 × taille), faute de quoi 75 cm — la moyenne
// adulte. Mesurer la foulée de quelqu'un de 1,60 m avec celle de quelqu'un de 1,90 m fait 20 %
// d'écart sur la distance, donc autant sur la dépense.
const STRIDE_RATIO = 0.415;
const DEFAULT_STRIDE_M = 0.75;
// Une allure de marche ordinaire, celle d'un déplacement quotidien — pas une sortie sportive.
const WALK_SPEED_KMH = 4.8;
const WALK_MET = 3.5;

export function strideMeters(heightCm) {
  return heightCm > 0 ? (heightCm * STRIDE_RATIO) / 100 : DEFAULT_STRIDE_M;
}

/**
 * Ce que les pas d'une journée ajoutent à la dépense, le repos déduit.
 *
 * `restingKcalPerHour` vient du métabolisme de base du profil (voir computeBmr) : c'est lui qui
 * fait que deux personnes ne paient pas le même prix pour les mêmes dix mille pas.
 */
export function neatFromSteps(stepsPerDay, profile = {}) {
  const steps = stepsPerDay ?? DEFAULT_STEPS_PER_DAY;
  if (!steps || steps < 0) return 0;
  const restingPerHour = (profile.restingKcalPerHour ?? 0) || 0;
  if (!restingPerHour) return 0;
  const km = (steps * strideMeters(profile.height_cm)) / 1000;
  const hours = km / WALK_SPEED_KMH;
  return (WALK_MET - 1) * restingPerHour * hours;
}

// TEF — the energy spent digesting. Per-macro thermic effect (protein is expensive to process,
// fat is nearly free), weighted by the user's own macro split rather than the flat 10% of intake.
const TEF_BY_MACRO = { protein: 0.25, carbs: 0.08, fat: 0.02 };
const DEFAULT_MACRO_SPLIT = { protein: 30, carbs: 35, fat: 35 };

export function tefFactor(profile) {
  const proteinPct = profile.protein_pct ?? DEFAULT_MACRO_SPLIT.protein;
  const carbsPct = profile.carbs_pct ?? DEFAULT_MACRO_SPLIT.carbs;
  const fatPct = Math.max(0, 100 - proteinPct - carbsPct);
  return (
    (TEF_BY_MACRO.protein * proteinPct + TEF_BY_MACRO.carbs * carbsPct + TEF_BY_MACRO.fat * fatPct) / 100
  );
}

// TEF is a share of what's actually eaten, which is the daily target — not maintenance. On a cut
// you eat below your TDEE, so you digest less and the thermic effect really is smaller.
//
// The target is itself derived from the TDEE that TEF is part of, so this is circular — but it
// solves in closed form rather than needing iteration. With base = BMR + NEAT + EAT and a goal
// offset D (positive on a cut, negative on a bulk, 0 on maintain):
//
//   target = TDEE − D = base + TEF − D   and   TEF = f · target
//   => TEF = f(base + TEF − D)  =>  TEF = f(base − D)/(1 − f)
//
// A manually pinned target short-circuits all of it: intake is that number, so TEF is f of it.
export function tefFor(baseKcal, factor, { goal, goalKcal = 0, manualTargetKcal = null } = {}) {
  if (factor <= 0 || factor >= 1) return 0;
  if (manualTargetKcal != null) return Math.max(0, manualTargetKcal * factor);

  let offset = 0;
  if (goal === 'lose') offset = goalKcal;
  if (goal === 'gain') offset = -goalKcal;
  // An aggressive deficit against a small base could drive this negative; a day's digestion can't
  // cost less than nothing.
  return Math.max(0, ((baseKcal - offset) * factor) / (1 - factor));
}

// EAT — deliberate exercise, i.e. whatever was actually logged that day. Adaptive by construction:
// a rest day contributes 0, a long session raises the day's TDEE on its own.
export function computeTdee(profile, { activitiesKcal = 0, today = new Date() } = {}) {
  const bmr = computeBmr(profile, today);
  const neat = neatFromSteps(profile.steps_per_day, { height_cm: profile.height_cm, restingKcalPerHour: bmr.value / 24 });
  const eat = activitiesKcal;
  const factor = tefFactor(profile);
  const tef = tefFor(bmr.value + neat + eat, factor, {
    goal: profile.goal,
    goalKcal: profile.goal_kcal || 0,
    manualTargetKcal: profile.manual_target_kcal,
  });

  return {
    bmr: Math.round(bmr.value),
    bmrMethod: bmr.method,
    bmrOptions: {
      katch: bmr.katch != null ? Math.round(bmr.katch) : null,
      mifflin: bmr.mifflin != null ? Math.round(bmr.mifflin) : null,
    },
    neat: Math.round(neat),
    stepsPerDay: profile.steps_per_day ?? DEFAULT_STEPS_PER_DAY,
    tef: Math.round(tef),
    tefPct: Math.round(factor * 1000) / 10,
    eat: Math.round(eat),
    total: Math.round(bmr.value + neat + tef + eat),
  };
}
