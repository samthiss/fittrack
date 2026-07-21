import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import session from 'express-session';
import db, { NUTRIENT_KEYS, DEFAULT_ACTIVITY_SETTINGS } from './db.js';
import { SqliteSessionStore, LEGACY_MARKER, hashPassword, verifyPassword, requireAuth } from './auth.js';
import { importRecipeFromText, generateRecipeForTarget } from './recipeImport.js';
import { lookupBarcode, searchFoodsOnline } from './foodLookup.js';
import { parseFoodText } from './foodTextParse.js';
import { parseFoodPhoto } from './foodPhotoParse.js';
import { buildMicroList, MICRO_REFERENCE, NUTRIENT_SUGGESTIONS, SUPPLEMENT_SUGGESTIONS, hasDailyGoal } from './nutrientReference.js';
import { estimateMissingNutrients, estimateNutrientsForFood } from './nutrientEstimation.js';
import { classifyFoodsBatch, classifyFood, classifyIngredientsBatch } from './microbiomeClassification.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR points at a mounted persistent volume in production (e.g. Railway) so uploaded
// photos survive redeploys — the container filesystem itself is ephemeral and gets wiped otherwise.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const WEIGHT_PHOTOS_DIR = path.join(UPLOADS_DIR, 'weight-photos');
fs.mkdirSync(WEIGHT_PHOTOS_DIR, { recursive: true });

const weightPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, WEIGHT_PHOTOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const uploadWeightPhotos = multer({ storage: weightPhotoStorage });
// Food photos are only ever sent to the vision model for analysis, never persisted — memory
// storage keeps them out of the disk/volume entirely.
const uploadFoodPhoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Maps a recipe ingredient's French field name to the canonical nutrient key.
const INGREDIENT_NUTRIENT_FIELDS = {
  fiber: 'fibres',
  sodium: 'sodium',
  potassium: 'potassium',
  magnesium: 'magnesium',
  calcium: 'calcium',
  zinc: 'zinc',
  iron: 'fer',
  selenium: 'selenium',
  iodine: 'iode',
  vitamin_c: 'vitamine_c',
  vitamin_a: 'vitamine_a',
  vitamin_d: 'vitamine_d',
  vitamin_e: 'vitamine_e',
  vitamin_k: 'vitamine_k',
  folate: 'folates',
  b12: 'b12',
  choline: 'choline',
  omega3: 'omega3',
  caffeine: 'cafeine',
};

const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
// Railway/Fly terminate HTTPS in front of this process and forward plain HTTP — without
// trust proxy, Express never sees the request as secure, so a `secure` cookie would silently
// never get set and every request would look logged-out.
if (IS_PROD) app.set('trust proxy', 1);

// credentials: true + an explicit origin (not '*') is required for the session cookie to
// actually reach the browser — only matters in dev, where the Vite dev server (5173) and this
// API (4000) are different origins. In production the built frontend is served from this same
// Express app (see the static-file block near the bottom), so every request is same-origin and
// CORS doesn't come into play at all.
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

app.use(
  session({
    store: new SqliteSessionStore(db),
    secret: process.env.SESSION_SECRET || 'fittrack-dev-secret-change-me-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PROD, // dev is plain http (no secure cookie possible); prod is always behind HTTPS
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

// --- Auth ---
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// A brand-new account needs a profile row (computeSummary reads it unconditionally) and a set
// of activity kcal/hour rates — the legacy account got these from the pre-auth schema, but a
// fresh signup has neither until seeded here.
function seedDefaultUserData(userId) {
  db.prepare(
    `INSERT OR IGNORE INTO profile (user_id, bmr, daily_movement_kcal, digestion_kcal, weight_kg, goal, goal_kcal)
     VALUES (?, 1800, 250, 150, 70, 'lose', 500)`
  ).run(userId);
  const upsertSetting = db.prepare(
    `INSERT OR IGNORE INTO activity_settings (user_id, type, label, kcal_per_hour) VALUES (?, ?, ?, ?)`
  );
  for (const s of DEFAULT_ACTIVITY_SETTINGS) {
    upsertSetting.run(userId, s.type, s.label, s.kcal_per_hour);
  }
}

app.post('/api/auth/register', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  if (!email || password.length < 8) {
    return res.status(400).json({ error: 'Email et mot de passe (8 caractères minimum) requis.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Cet email est déjà utilisé.' });
  }
  const result = db
    .prepare('INSERT INTO users (email, password_hash, onboarding_completed) VALUES (?, ?, 0)')
    .run(email, hashPassword(password));
  seedDefaultUserData(result.lastInsertRowid);
  req.session.userId = result.lastInsertRowid;
  res.status(201).json({ id: result.lastInsertRowid, email, onboardingCompleted: false });
});

app.post('/api/auth/login', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  }
  req.session.userId = user.id;
  res.json({ id: user.id, email: user.email, mustChangePassword: !!user.must_change_password, onboardingCompleted: !!user.onboarding_completed });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Non authentifié' });
  const user = db.prepare('SELECT id, email, must_change_password, onboarding_completed FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Non authentifié' });
  res.json({ id: user.id, email: user.email, mustChangePassword: !!user.must_change_password, onboardingCompleted: !!user.onboarding_completed });
});

app.post('/api/auth/complete-onboarding', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET onboarding_completed = 1 WHERE id = ?').run(req.session.userId);
  res.status(204).end();
});

// One-time claim of the pre-auth "legacy" account (id 1, seeded in db.js — see LEGACY_MARKER)
// that holds all data created before login existed. Sets a real email/password on it, turning
// it from an unloginable placeholder into the owner's actual account — no temp password ever
// has to be typed into this chat.
app.post('/api/auth/claim-legacy', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  if (!email || password.length < 8) {
    return res.status(400).json({ error: 'Email et mot de passe (8 caractères minimum) requis.' });
  }
  const legacy = db.prepare('SELECT * FROM users WHERE id = 1 AND password_hash = ?').get(LEGACY_MARKER);
  if (!legacy) {
    return res.status(409).json({ error: 'Le compte historique a déjà été réclamé.' });
  }
  const emailTaken = db.prepare('SELECT id FROM users WHERE email = ? AND id != 1').get(email);
  if (emailTaken) {
    return res.status(409).json({ error: 'Cet email est déjà utilisé.' });
  }
  db.prepare('UPDATE users SET email = ?, password_hash = ?, must_change_password = 0 WHERE id = 1').run(
    email,
    hashPassword(password)
  );
  seedDefaultUserData(1); // no-op via INSERT OR IGNORE — the legacy account already has these from the migration
  req.session.userId = 1;
  const user = db.prepare('SELECT onboarding_completed FROM users WHERE id = 1').get();
  res.json({ id: 1, email, onboardingCompleted: !!user.onboarding_completed });
});

app.get('/api/auth/legacy-status', (req, res) => {
  const legacy = db.prepare('SELECT id FROM users WHERE id = 1 AND password_hash = ?').get(LEGACY_MARKER);
  res.json({ claimed: !legacy });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères.' });
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
    hashPassword(newPassword),
    user.id
  );
  res.status(204).end();
});

// Everything below this line requires a logged-in session.
app.use('/api', requireAuth);

const GOALS = ['lose', 'gain', 'maintain'];

const MEALS = [
  { key: 'breakfast', label: 'Petit déjeuner', share: 0.15 },
  { key: 'snack', label: 'En-cas', share: 0.05 },
  { key: 'lunch', label: 'Déjeuner', share: 0.35 },
  { key: 'dinner', label: 'Dîner', share: 0.45 },
];

const MACRO_SHARES = { carbs: 0.35, protein: 0.3, fat: 0.35 };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const EXTRA_SNACK_TIMES = ['morning', 'afternoon', 'evening'];

// profile.extra_snacks (set via Réglages > Repas du jour) holds every en-cas customization:
// extra slots ({ key: 'snack_<n>', label, time }) AND, optionally, an override entry for the
// base slot ({ key: 'snack', time, removed }) — the base slot can be given a time-of-day (so it
// sorts alongside the others) or removed entirely, same as any extra one.
function parseSnackConfig(profile) {
  let list = [];
  if (profile?.extra_snacks) {
    try {
      const parsed = JSON.parse(profile.extra_snacks);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const baseOverride = list.find((s) => s && s.key === 'snack');
  const extras = list.filter(
    (s) => s && typeof s.key === 'string' && s.key.startsWith('snack_') && typeof s.label === 'string' && s.label.trim()
  );
  const slots = [];
  if (!baseOverride?.removed) {
    slots.push({ key: 'snack', label: MEALS.find((m) => m.key === 'snack').label, time: baseOverride?.time ?? null });
  }
  for (const s of extras) slots.push({ key: s.key, label: s.label, time: s.time ?? null });
  return slots; // every currently-active snack slot (base + extras), in insertion order
}

// The full ordered meal list for this user: breakfast, any 'morning' snacks, lunch, any
// 'afternoon' snacks, dinner, any 'evening' snacks, then any snacks left untagged.
function mealsFor(profile) {
  const snacks = parseSnackConfig(profile);
  const shares = mealSharesFor(profile, snacks);
  const withShare = (key, label, time) => ({ key, label, share: shares[key], ...(time !== undefined ? { time } : {}) });
  const byTime = (time) => snacks.filter((s) => s.time === time).map((s) => withShare(s.key, s.label, s.time));

  return [
    withShare('breakfast', MEALS.find((m) => m.key === 'breakfast').label),
    ...byTime('morning'),
    withShare('lunch', MEALS.find((m) => m.key === 'lunch').label),
    ...byTime('afternoon'),
    withShare('dinner', MEALS.find((m) => m.key === 'dinner').label),
    ...byTime('evening'),
    ...byTime(null),
  ];
}

// profile.meal_shares (set via Réglages > Repas du jour) overrides each meal's slice of the
// daily kcal budget when present — falls back to the fixed 15/35/45% split for breakfast/lunch/
// dinner, with the 5% "en-cas" allocation divided evenly across every active snack slot.
function mealSharesFor(profile, snacks) {
  const snackSlots = snacks || parseSnackConfig(profile);
  const snackKeys = snackSlots.map((s) => s.key);
  const allKeys = ['breakfast', 'lunch', 'dinner', ...snackKeys];

  let stored = null;
  if (profile?.meal_shares) {
    try {
      stored = JSON.parse(profile.meal_shares);
    } catch {
      stored = null;
    }
  }
  if (stored && allKeys.every((k) => typeof stored[k] === 'number')) return stored;

  const perSnack = snackKeys.length > 0 ? 0.05 / snackKeys.length : 0;
  const shares = { breakfast: 0.15, lunch: 0.35, dinner: 0.45 };
  for (const k of snackKeys) shares[k] = perSnack;
  return shares;
}

// profile.protein_pct/carbs_pct (set via the onboarding "Ajuster les macros" step or Réglages)
// override the 30/35/35 default split when present; fat is always the remainder.
function computeMacroTargets(targetIntake, profile) {
  const proteinPct = profile?.protein_pct ?? MACRO_SHARES.protein * 100;
  const carbsPct = profile?.carbs_pct ?? MACRO_SHARES.carbs * 100;
  const fatPct = Math.max(0, 100 - proteinPct - carbsPct);
  return {
    carbs: (targetIntake * carbsPct) / 100 / 4,
    protein: (targetIntake * proteinPct) / 100 / 4,
    fat: (targetIntake * fatPct) / 100 / 9,
  };
}

function getProfile(userId) {
  return db.prepare('SELECT * FROM profile WHERE user_id = ?').get(userId);
}

function getActivitySettings(userId) {
  return db.prepare('SELECT * FROM activity_settings WHERE user_id = ? ORDER BY rowid').all(userId);
}

function kcalPerHourFor(userId, type) {
  const setting = db
    .prepare('SELECT kcal_per_hour FROM activity_settings WHERE user_id = ? AND type = ?')
    .get(userId, type);
  return setting ? setting.kcal_per_hour : 0;
}

function computeSummary(userId, date, profileOverride) {
  const profile = profileOverride || getProfile(userId);
  const logs = db
    .prepare('SELECT * FROM activity_logs WHERE user_id = ? AND date = ? ORDER BY id')
    .all(userId, date);
  const activitiesKcal = logs.reduce((sum, l) => sum + l.kcal, 0);

  const tdee =
    profile.bmr + profile.daily_movement_kcal + profile.digestion_kcal + activitiesKcal;

  let targetIntake = tdee;
  if (profile.goal === 'lose') targetIntake = tdee - profile.goal_kcal;
  if (profile.goal === 'gain') targetIntake = tdee + profile.goal_kcal;
  // A manually pinned target overrides the auto-computed one entirely — it stays fixed
  // regardless of today's activities until the user clears it back to automatic.
  if (profile.manual_target_kcal != null) targetIntake = profile.manual_target_kcal;

  return {
    date,
    profile,
    activities: logs,
    activitiesKcal,
    tdee,
    targetIntake,
  };
}

// --- Activity types / settings ---
app.get('/api/activity-types', (req, res) => {
  res.json(getActivitySettings(req.userId));
});

app.put('/api/activity-types/:type', (req, res) => {
  const { kcal_per_hour } = req.body;
  if (kcal_per_hour === undefined || Number(kcal_per_hour) < 0) {
    return res.status(400).json({ error: 'kcal_per_hour invalide' });
  }

  const result = db
    .prepare('UPDATE activity_settings SET kcal_per_hour = ? WHERE user_id = ? AND type = ?')
    .run(Number(kcal_per_hour), req.userId, req.params.type);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'activité inconnue' });
  }

  const setting = db
    .prepare('SELECT * FROM activity_settings WHERE user_id = ? AND type = ?')
    .get(req.userId, req.params.type);
  res.json(setting);
});

// --- Profile ---
app.get('/api/profile', (req, res) => {
  res.json(getProfile(req.userId));
});

const SEX_OPTIONS = ['male', 'female', 'other'];

app.put('/api/profile', (req, res) => {
  const { bmr, daily_movement_kcal, digestion_kcal, weight_kg, goal, goal_kcal, sex, birthdate, height_cm, body_fat_pct, manual_target_kcal, target_weight_kg, steps_per_day, protein_pct, carbs_pct, meal_shares, extra_snacks } = req.body;

  if (goal !== undefined && !GOALS.includes(goal)) {
    return res.status(400).json({ error: 'goal invalide' });
  }
  if (sex !== undefined && sex !== null && !SEX_OPTIONS.includes(sex)) {
    return res.status(400).json({ error: 'sex invalide' });
  }
  if (
    extra_snacks !== undefined &&
    extra_snacks !== null &&
    (!Array.isArray(extra_snacks) ||
      extra_snacks.filter((s) => s?.key !== 'snack').length > 4 ||
      extra_snacks.some((s) => {
        if (!s || typeof s.key !== 'string') return true;
        if (s.time != null && !EXTRA_SNACK_TIMES.includes(s.time)) return true;
        if (s.key === 'snack') return s.removed != null && typeof s.removed !== 'boolean';
        return !s.key.startsWith('snack_') || typeof s.label !== 'string' || !s.label.trim();
      }) ||
      new Set(extra_snacks.map((s) => s.key)).size !== extra_snacks.length)
  ) {
    return res.status(400).json({ error: 'extra_snacks invalide' });
  }

  const current = getProfile(req.userId);
  const nextExtraSnacksJson = extra_snacks !== undefined ? (extra_snacks === null ? null : JSON.stringify(extra_snacks)) : current.extra_snacks;
  if (meal_shares !== undefined && meal_shares !== null) {
    const currentSlots = parseSnackConfig({ extra_snacks: nextExtraSnacksJson });
    const allKeys = ['breakfast', 'lunch', 'dinner', ...currentSlots.map((s) => s.key)];
    if (!allKeys.every((k) => typeof meal_shares[k] === 'number')) {
      return res.status(400).json({ error: 'meal_shares invalide' });
    }
  }

  const next = {
    bmr: bmr ?? current.bmr,
    daily_movement_kcal: daily_movement_kcal ?? current.daily_movement_kcal,
    digestion_kcal: digestion_kcal ?? current.digestion_kcal,
    weight_kg: weight_kg ?? current.weight_kg,
    goal: goal ?? current.goal,
    goal_kcal: goal_kcal ?? current.goal_kcal,
    sex: sex !== undefined ? sex : current.sex,
    birthdate: birthdate !== undefined ? birthdate : current.birthdate,
    height_cm: height_cm !== undefined ? height_cm : current.height_cm,
    body_fat_pct: body_fat_pct !== undefined ? body_fat_pct : current.body_fat_pct,
    manual_target_kcal: manual_target_kcal !== undefined ? manual_target_kcal : current.manual_target_kcal,
    target_weight_kg: target_weight_kg !== undefined ? target_weight_kg : current.target_weight_kg,
    steps_per_day: steps_per_day !== undefined ? steps_per_day : current.steps_per_day,
    protein_pct: protein_pct !== undefined ? protein_pct : current.protein_pct,
    carbs_pct: carbs_pct !== undefined ? carbs_pct : current.carbs_pct,
    meal_shares: meal_shares !== undefined ? (meal_shares === null ? null : JSON.stringify(meal_shares)) : current.meal_shares,
    extra_snacks: nextExtraSnacksJson,
  };

  db.prepare(
    `UPDATE profile SET bmr = ?, daily_movement_kcal = ?, digestion_kcal = ?, weight_kg = ?, goal = ?, goal_kcal = ?,
     sex = ?, birthdate = ?, height_cm = ?, body_fat_pct = ?, manual_target_kcal = ?, target_weight_kg = ?, steps_per_day = ?,
     protein_pct = ?, carbs_pct = ?, meal_shares = ?, extra_snacks = ?
     WHERE user_id = ?`
  ).run(
    next.bmr,
    next.daily_movement_kcal,
    next.digestion_kcal,
    next.weight_kg,
    next.goal,
    next.goal_kcal,
    next.sex,
    next.birthdate,
    next.height_cm,
    next.body_fat_pct,
    next.manual_target_kcal,
    next.target_weight_kg,
    next.steps_per_day,
    next.protein_pct,
    next.carbs_pct,
    next.meal_shares,
    next.extra_snacks,
    req.userId
  );

  // One snapshot per save (not per day) — profileAsOf() below picks the latest one at or before
  // a given date, so "Semaine passée" judges against the targets that were live that week.
  db.prepare(
    `INSERT INTO profile_history (user_id, date, bmr, daily_movement_kcal, digestion_kcal, weight_kg, goal, goal_kcal)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(req.userId, todayStr(), next.bmr, next.daily_movement_kcal, next.digestion_kcal, next.weight_kg, next.goal, next.goal_kcal);

  res.json(getProfile(req.userId));
});

// Profile as it was on `date` — latest profile_history snapshot at or before that date, falling
// back to the earliest snapshot available for dates before tracking started.
function profileAsOf(userId, date) {
  const row =
    db.prepare('SELECT * FROM profile_history WHERE user_id = ? AND date <= ? ORDER BY date DESC, id DESC LIMIT 1').get(userId, date) ||
    db.prepare('SELECT * FROM profile_history WHERE user_id = ? ORDER BY date ASC, id ASC LIMIT 1').get(userId);
  return row || getProfile(userId);
}

// Weight actually logged closest to (at or before) `date`, falling back to whatever the profile
// said at the time — used so past-week protein/fat targets (weight-based) reflect the weight
// that was current that week, not today's.
function weightAsOf(userId, date) {
  const row = db.prepare('SELECT weight_kg FROM weight_logs WHERE user_id = ? AND date <= ? ORDER BY date DESC LIMIT 1').get(userId, date);
  return row ? row.weight_kg : profileAsOf(userId, date).weight_kg || 100;
}

// --- Activity logs ---
app.get('/api/activities', (req, res) => {
  const date = req.query.date || todayStr();
  const logs = db
    .prepare('SELECT * FROM activity_logs WHERE user_id = ? AND date = ? ORDER BY id')
    .all(req.userId, date);
  res.json(logs);
});

app.post('/api/activities', (req, res) => {
  const { date, type, duration_minutes, kcal, label, recurringGroupId } = req.body;
  if (!type || !duration_minutes) {
    return res.status(400).json({ error: 'type et duration_minutes requis' });
  }

  const finalDate = date || todayStr();
  const finalKcal =
    kcal !== undefined && kcal !== null
      ? Number(kcal)
      : kcalPerHourFor(req.userId, type) * (Number(duration_minutes) / 60);
  const finalLabel = label && label.trim() ? label.trim() : null;

  const result = db
    .prepare(
      `INSERT INTO activity_logs (user_id, date, type, duration_minutes, kcal, label, plan_group_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.userId, finalDate, type, Number(duration_minutes), finalKcal, finalLabel, recurringGroupId || null);

  const log = db.prepare('SELECT * FROM activity_logs WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, req.userId);
  res.status(201).json(log);
});

const markPlanAppliedToday = db.prepare(
  'INSERT OR IGNORE INTO activity_plan_applied (user_id, date, activity_plan_id) VALUES (?, ?, ?)'
);

app.put('/api/activities/:id', (req, res) => {
  const log = db.prepare('SELECT * FROM activity_logs WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!log) return res.status(404).json({ error: 'introuvable' });

  const finalLabel = req.body.label && req.body.label.trim() ? req.body.label.trim() : null;
  const finalDuration = req.body.duration_minutes != null ? Number(req.body.duration_minutes) : log.duration_minutes;
  const finalKcal = req.body.kcal != null ? Number(req.body.kcal) : log.kcal;

  db.prepare('UPDATE activity_logs SET label = ?, duration_minutes = ?, kcal = ? WHERE id = ? AND user_id = ?').run(
    finalLabel,
    finalDuration,
    finalKcal,
    req.params.id,
    req.userId
  );

  if (Array.isArray(req.body.recurringDays)) {
    const recurringDays = req.body.recurringDays.filter((d) => PLAN_DAYS.some((p) => p.key === d));
    let groupId = log.plan_group_id;

    if (groupId) {
      db.prepare('DELETE FROM activity_plan WHERE user_id = ? AND group_id = ?').run(req.userId, groupId);
    }

    if (recurringDays.length === 0) {
      groupId = null;
    } else {
      groupId = groupId || crypto.randomUUID();
      const insert = db.prepare(
        'INSERT INTO activity_plan (user_id, day, type, duration_minutes, label, group_id) VALUES (?, ?, ?, ?, ?, ?)'
      );
      const today = todayStr();
      const todayPlanDay = WEEKDAY_TO_PLAN_DAY[new Date(`${today}T00:00:00Z`).getUTCDay()];
      for (const day of recurringDays) {
        const result = insert.run(req.userId, day, log.type, finalDuration, finalLabel, groupId);
        if (day === todayPlanDay) markPlanAppliedToday.run(req.userId, today, result.lastInsertRowid);
      }
    }

    db.prepare('UPDATE activity_logs SET plan_group_id = ? WHERE id = ? AND user_id = ?').run(groupId, req.params.id, req.userId);
  } else if (log.plan_group_id) {
    // Recurrence itself wasn't touched — just keep the existing group's rows (label/duration)
    // in sync so future auto-logged occurrences reflect the edit too.
    db.prepare('UPDATE activity_plan SET label = ?, duration_minutes = ? WHERE user_id = ? AND group_id = ?').run(
      finalLabel,
      finalDuration,
      req.userId,
      log.plan_group_id
    );
  }

  res.json(db.prepare('SELECT * FROM activity_logs WHERE id = ? AND user_id = ?').get(req.params.id, req.userId));
});

app.delete('/api/activities/:id', (req, res) => {
  db.prepare('DELETE FROM activity_exercises WHERE activity_log_id = ? AND user_id = ?').run(req.params.id, req.userId);
  db.prepare('DELETE FROM activity_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).end();
});

// --- Exercises within a strength-training activity_logs entry (type='force') ---
app.get('/api/activities/:id/exercises', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM activity_exercises WHERE activity_log_id = ? AND user_id = ? ORDER BY order_index, id')
    .all(req.params.id, req.userId);
  res.json(rows);
});

app.post('/api/activities/:id/exercises', (req, res) => {
  const { name, sets, reps, weight_kg } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });
  const activity = db.prepare('SELECT id FROM activity_logs WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!activity) return res.status(404).json({ error: 'Activité introuvable' });

  const { maxOrder } = db
    .prepare('SELECT COALESCE(MAX(order_index), -1) AS maxOrder FROM activity_exercises WHERE activity_log_id = ? AND user_id = ?')
    .get(req.params.id, req.userId);

  const result = db
    .prepare(
      `INSERT INTO activity_exercises (user_id, activity_log_id, name, sets, reps, weight_kg, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.userId, req.params.id, name, Number(sets) || 3, Number(reps) || 10, weight_kg != null && weight_kg !== '' ? Number(weight_kg) : null, maxOrder + 1);

  res.status(201).json(db.prepare('SELECT * FROM activity_exercises WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/exercises/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM activity_exercises WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Exercice introuvable' });
  const { name, sets, reps, weight_kg } = req.body;
  db.prepare('UPDATE activity_exercises SET name = ?, sets = ?, reps = ?, weight_kg = ? WHERE id = ? AND user_id = ?').run(
    name ?? existing.name,
    sets != null ? Number(sets) : existing.sets,
    reps != null ? Number(reps) : existing.reps,
    weight_kg !== undefined ? (weight_kg !== '' && weight_kg !== null ? Number(weight_kg) : null) : existing.weight_kg,
    req.params.id,
    req.userId
  );
  res.json(db.prepare('SELECT * FROM activity_exercises WHERE id = ?').get(req.params.id));
});

app.delete('/api/exercises/:id', (req, res) => {
  db.prepare('DELETE FROM activity_exercises WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).end();
});

// --- Saved workout templates (reusable exercise lists for a "force" session) ---
function serializeWorkoutTemplate(row) {
  return { ...row, exercises: JSON.parse(row.exercises) };
}

app.get('/api/workout-templates', (req, res) => {
  const rows = db.prepare('SELECT * FROM workout_templates WHERE user_id = ? ORDER BY id DESC').all(req.userId);
  res.json(rows.map(serializeWorkoutTemplate));
});

app.post('/api/workout-templates', (req, res) => {
  const { name, exercises } = req.body;
  if (!name || !name.trim() || !Array.isArray(exercises) || exercises.length === 0) {
    return res.status(400).json({ error: 'name et exercises requis' });
  }
  const cleanExercises = exercises
    .filter((e) => e && e.name && String(e.name).trim())
    .map((e) => ({
      name: String(e.name).trim(),
      sets: Number(e.sets) || 3,
      reps: Number(e.reps) || 10,
      weight_kg: e.weight_kg != null && e.weight_kg !== '' ? Number(e.weight_kg) : null,
    }));
  const result = db
    .prepare('INSERT INTO workout_templates (user_id, name, exercises) VALUES (?, ?, ?)')
    .run(req.userId, name.trim(), JSON.stringify(cleanExercises));
  res.status(201).json(serializeWorkoutTemplate(db.prepare('SELECT * FROM workout_templates WHERE id = ?').get(result.lastInsertRowid)));
});

app.delete('/api/workout-templates/:id', (req, res) => {
  db.prepare('DELETE FROM workout_templates WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).end();
});

// --- Recurring activity plan (day-of-week template, e.g. "Course à pied" every mon/wed/fri) ---
app.get('/api/activity-plan', (req, res) => {
  const rows = db.prepare('SELECT * FROM activity_plan WHERE user_id = ? ORDER BY id').all(req.userId);
  res.json({ days: PLAN_DAYS, entries: rows });
});

app.post('/api/activity-plan', (req, res) => {
  const { days, type, duration_minutes, label, groupId } = req.body;
  if (!Array.isArray(days) || days.length === 0 || !type || !duration_minutes) {
    return res.status(400).json({ error: 'days, type et duration_minutes requis' });
  }
  if (!days.every((d) => PLAN_DAYS.some((p) => p.key === d))) {
    return res.status(400).json({ error: 'jour invalide' });
  }
  const finalLabel = label && label.trim() ? label.trim() : null;
  const finalGroupId = groupId || crypto.randomUUID();
  const insert = db.prepare('INSERT INTO activity_plan (user_id, day, type, duration_minutes, label, group_id) VALUES (?, ?, ?, ?, ?, ?)');
  const rows = days.map((d) => {
    const result = insert.run(req.userId, d, type, Number(duration_minutes), finalLabel, finalGroupId);
    return db.prepare('SELECT * FROM activity_plan WHERE id = ?').get(result.lastInsertRowid);
  });

  // The "Ajouter une activité" flow always logs today's occurrence directly (a separate
  // activity_logs row) in the same request cycle as creating the recurring template. If the
  // template also covers today's weekday, mark it pre-applied so the next apply-to-log call
  // doesn't materialize a second, duplicate entry for today.
  const today = todayStr();
  const todayPlanDay = WEEKDAY_TO_PLAN_DAY[new Date(`${today}T00:00:00Z`).getUTCDay()];
  const markApplied = db.prepare(
    'INSERT OR IGNORE INTO activity_plan_applied (user_id, date, activity_plan_id) VALUES (?, ?, ?)'
  );
  for (const row of rows) {
    if (row.day === todayPlanDay) markApplied.run(req.userId, today, row.id);
  }

  res.status(201).json(rows);
});

// Edit or remove a whole recurring group (used for a "scheduled" future occurrence that hasn't
// materialized into a real activity_logs row yet, so there's no /api/activities/:id to hit).
app.put('/api/activity-plan/group/:groupId', (req, res) => {
  const { groupId } = req.params;
  const existing = db.prepare('SELECT * FROM activity_plan WHERE user_id = ? AND group_id = ?').all(req.userId, groupId);
  if (existing.length === 0) return res.status(404).json({ error: 'introuvable' });

  const { label, duration_minutes, days } = req.body;
  const finalLabel = label && label.trim() ? label.trim() : null;
  const finalDuration = duration_minutes != null ? Number(duration_minutes) : existing[0].duration_minutes;
  const type = existing[0].type;

  db.prepare('DELETE FROM activity_plan WHERE user_id = ? AND group_id = ?').run(req.userId, groupId);

  const validDays = Array.isArray(days) ? days.filter((d) => PLAN_DAYS.some((p) => p.key === d)) : [];
  const insert = db.prepare(
    'INSERT INTO activity_plan (user_id, day, type, duration_minutes, label, group_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const today = todayStr();
  const todayPlanDay = WEEKDAY_TO_PLAN_DAY[new Date(`${today}T00:00:00Z`).getUTCDay()];
  const rows = validDays.map((day) => {
    const result = insert.run(req.userId, day, type, finalDuration, finalLabel, groupId);
    if (day === todayPlanDay) markPlanAppliedToday.run(req.userId, today, result.lastInsertRowid);
    return db.prepare('SELECT * FROM activity_plan WHERE id = ?').get(result.lastInsertRowid);
  });

  // Keep already-materialized logs for this group in sync too.
  db.prepare('UPDATE activity_logs SET label = ?, duration_minutes = ? WHERE user_id = ? AND plan_group_id = ?').run(
    finalLabel,
    finalDuration,
    req.userId,
    groupId
  );

  res.json(rows);
});

app.delete('/api/activity-plan/group/:groupId', (req, res) => {
  db.prepare('DELETE FROM activity_plan WHERE user_id = ? AND group_id = ?').run(req.userId, req.params.groupId);
  db.prepare('UPDATE activity_logs SET plan_group_id = NULL WHERE user_id = ? AND plan_group_id = ?').run(req.userId, req.params.groupId);
  res.status(204).end();
});

app.delete('/api/activity-plan/:id', (req, res) => {
  db.prepare('DELETE FROM activity_plan WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).end();
});

// Auto-logs today's recurring activities into activity_logs — same "already applied" pattern as
// the meal plan's apply-to-journal, so deleting an auto-logged activity doesn't bring it back.
app.post('/api/activity-plan/apply-to-log', (req, res) => {
  const date = req.body.date || todayStr();
  const planDay = WEEKDAY_TO_PLAN_DAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const entries = db.prepare('SELECT * FROM activity_plan WHERE user_id = ? AND day = ?').all(req.userId, planDay);

  const appliedIds = new Set(
    db
      .prepare('SELECT activity_plan_id FROM activity_plan_applied WHERE user_id = ? AND date = ?')
      .all(req.userId, date)
      .map((r) => r.activity_plan_id)
  );
  const markApplied = db.prepare(
    'INSERT OR IGNORE INTO activity_plan_applied (user_id, date, activity_plan_id) VALUES (?, ?, ?)'
  );

  const added = [];
  for (const entry of entries) {
    markApplied.run(req.userId, date, entry.id);
    if (appliedIds.has(entry.id)) continue;
    const kcal = kcalPerHourFor(req.userId, entry.type) * (entry.duration_minutes / 60);
    const result = db
      .prepare('INSERT INTO activity_logs (user_id, date, type, duration_minutes, kcal, label, plan_group_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.userId, date, entry.type, entry.duration_minutes, kcal, entry.label ?? null, entry.group_id ?? null);
    added.push(db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(result.lastInsertRowid));
  }
  res.json({ date, planDay, added });
});

// --- Water logs (700ml servings) ---
app.get('/api/water', (req, res) => {
  const date = req.query.date || todayStr();
  const logs = db.prepare('SELECT * FROM water_logs WHERE user_id = ? AND date = ? ORDER BY id').all(req.userId, date);
  const manualMl = logs.reduce((s, l) => s + l.amount_ml, 0);
  // Foods/drinks logged in ml (e.g. milk, coffee) count toward water too, on top of manual servings.
  const drinkFoodLogs = db
    .prepare(`SELECT label, quantity FROM food_logs WHERE user_id = ? AND date = ? AND unit = 'ml' ORDER BY quantity DESC`)
    .all(req.userId, date);
  const fromDrinksMl = drinkFoodLogs.reduce((s, l) => s + l.quantity, 0);
  const coffeeDrinkLogs = db
    .prepare('SELECT type, water_ml FROM coffee_logs WHERE user_id = ? AND date = ? ORDER BY water_ml DESC')
    .all(req.userId, date);
  const fromCoffeeMl = coffeeDrinkLogs.reduce((s, l) => s + l.water_ml, 0);
  const drinkSources = [
    ...drinkFoodLogs.map((l) => ({ label: l.label, value: l.quantity })),
    ...coffeeDrinkLogs.map((l) => ({ label: DRINK_TYPES[l.type]?.label || l.type, value: l.water_ml })),
  ].sort((a, b) => b.value - a.value);
  res.json({
    logs,
    totalMl: manualMl + fromDrinksMl + fromCoffeeMl,
    manualMl,
    fromDrinksMl,
    fromCoffeeMl,
    drinkSources,
  });
});

app.post('/api/water', (req, res) => {
  const date = req.body.date || todayStr();
  const result = db
    .prepare('INSERT INTO water_logs (user_id, date, amount_ml) VALUES (?, ?, 700)')
    .run(req.userId, date);
  const log = db.prepare('SELECT * FROM water_logs WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(log);
});

app.delete('/api/water/:id', (req, res) => {
  db.prepare('DELETE FROM water_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).end();
});

// --- "Boisson énergisante" logs ---
// Flexpresso is a fixed preset (700ml, 80mg) regardless of quantity picked — it's also what
// gets auto-applied when the "Flexpresso" food is spotted logged in breakfast (see below).
// The other three scale caffeine with the chosen liquid quantity (250-500ml).
const DRINK_TYPES = {
  eau: { label: 'Eau', caffeinePer100ml: 0 },
  // One shot of espresso (fixed 63mg caffeine, fixed kcal/macros for the espresso + 150ml
  // almond milk) regardless of the water_ml quantity picked — that's just how much of it you're
  // counting toward hydration, not how many espresso shots went into it.
  cafe_latte: {
    label: 'Café latte',
    fixedCaffeineMg: 63,
    fixedMacros: { kcal: 24.5, protein: 0.75, carbs: 0.15, fat: 1.95 },
  },
  the_vert: { label: 'Thé vert', caffeinePer100ml: 12 },
  matcha: { label: 'Matcha', caffeinePer100ml: 20 },
  whey: { label: 'Whey shaker', caffeinePer100ml: 0, hidden: true },
};

app.get('/api/coffee', (req, res) => {
  const date = req.query.date || todayStr();
  const logs = db.prepare('SELECT * FROM coffee_logs WHERE user_id = ? AND date = ? ORDER BY id').all(req.userId, date);
  res.json({
    types: DRINK_TYPES,
    logs,
    totalCaffeineMg: logs.reduce((s, l) => s + l.caffeine_mg, 0),
    totalWaterMl: logs.reduce((s, l) => s + l.water_ml, 0),
  });
});

app.post('/api/coffee', (req, res) => {
  const date = req.body.date || todayStr();
  const type = DRINK_TYPES[req.body.type] ? req.body.type : 'cafe_latte';
  const config = DRINK_TYPES[type];

  const waterMl =
    config.fixedWaterMl != null
      ? config.fixedWaterMl
      : Math.min(700, Math.max(250, Number(req.body.water_ml) || 250));
  const caffeineMg =
    config.fixedCaffeineMg ?? Math.round((config.caffeinePer100ml * waterMl) / 100);
  const macros = config.fixedMacros || { kcal: 0, protein: 0, carbs: 0, fat: 0 };

  const result = db
    .prepare(
      'INSERT INTO coffee_logs (user_id, date, type, caffeine_mg, water_ml, kcal, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(req.userId, date, type, caffeineMg, waterMl, macros.kcal, macros.protein, macros.carbs, macros.fat);
  const log = db.prepare('SELECT * FROM coffee_logs WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(log);
});

app.delete('/api/coffee/:id', (req, res) => {
  db.prepare('DELETE FROM coffee_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).end();
});

// --- Daily summary ---
app.get('/api/summary', (req, res) => {
  const date = req.query.date || todayStr();
  res.json(computeSummary(req.userId, date));
});

// --- Recipes ---
function serializeRecipe(row) {
  return {
    ...row,
    ingredients: JSON.parse(row.ingredients),
    steps: JSON.parse(row.steps),
    favorite: !!row.favorite,
    tags: JSON.parse(row.tags || '[]'),
  };
}

app.get('/api/recipes', (req, res) => {
  const rows = db.prepare('SELECT * FROM recipes WHERE user_id = ? ORDER BY id DESC').all(req.userId);
  res.json(rows.map(serializeRecipe));
});

app.post('/api/recipes', (req, res) => {
  const { title, description, image, portions, ingredients, steps } = req.body;
  if (!title || !title.trim() || !Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'title et ingredients requis' });
  }

  const cleanIngredients = ingredients
    .filter((i) => i.nom && i.nom.trim())
    .map((i) => ({
      nom: i.nom.trim(),
      qte: Number(i.qte) || 0,
      unite: i.unite || null,
      kcal: Number(i.kcal) || 0,
      proteines: Number(i.proteines) || 0,
      glucides: Number(i.glucides) || 0,
      lipides: Number(i.lipides) || 0,
    }));
  if (cleanIngredients.length === 0) {
    return res.status(400).json({ error: 'au moins un ingrédient valide requis' });
  }

  const cleanSteps = Array.isArray(steps) ? steps.filter((s) => s && s.trim()) : [];

  const result = db
    .prepare(
      `INSERT INTO recipes (user_id, title, description, image, portions, ingredients, steps)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.userId,
      title.trim(),
      description || null,
      image || null,
      Number(portions) || 1,
      JSON.stringify(cleanIngredients),
      JSON.stringify(cleanSteps)
    );

  const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(serializeRecipe(row));
});

app.post('/api/recipes/import', async (req, res) => {
  const { mode, text } = req.body;
  try {
    // URL import (web_search) was dropped — unreliable (frequent overload / empty / truncated
    // results, high token cost) compared to pasting the text, which just works.
    if (mode !== 'text') {
      return res.status(400).json({ error: 'mode invalide' });
    }
    if (!text) return res.status(400).json({ error: 'texte requis' });
    const recipe = await importRecipeFromText(text);

    const result = db
      .prepare(
        `INSERT INTO recipes (user_id, title, description, image, portions, ingredients, steps)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.userId,
        recipe.titre,
        recipe.description,
        recipe.image,
        recipe.portions || 1,
        JSON.stringify(recipe.ingredients),
        JSON.stringify(recipe.etapes)
      );

    const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(serializeRecipe(row));
  } catch (err) {
    res.status(422).json({ error: friendlyImportError(err) });
  }
});

// The Anthropic SDK's error message is sometimes the raw API error JSON (e.g. for streamed
// requests) — surface something a user can actually read instead of dumping that at them.
function friendlyImportError(err) {
  const raw = err?.message || '';
  if (raw.includes('overloaded_error') || err?.status === 529) {
    return "Le service est actuellement surchargé côté Claude — réessaie dans quelques minutes, ou utilise \"Coller le texte\" à la place.";
  }
  if (err?.status === 429) {
    return 'Trop de requêtes pour le moment — réessaie dans une minute.';
  }
  if (raw.startsWith('{')) {
    return "Échec de l'import (le service Claude a renvoyé une erreur inattendue).";
  }
  return raw || "Échec de l'import";
}

app.put('/api/recipes/:id', (req, res) => {
  const { title, description, steps, portions, ingredients, image, favorite, tags } = req.body;
  const current = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!current) return res.status(404).json({ error: 'recette introuvable' });

  const nextTitle = title !== undefined && title.trim() ? title.trim() : current.title;
  const nextDescription = description !== undefined ? description : current.description;
  const nextSteps = steps !== undefined ? JSON.stringify(steps.filter((s) => s.trim())) : current.steps;
  const nextPortions = portions ?? current.portions;
  const nextIngredients = ingredients ?? JSON.parse(current.ingredients);
  const nextImage = image !== undefined ? image : current.image;
  const nextFavorite = favorite !== undefined ? (favorite ? 1 : 0) : current.favorite;
  const nextTags = tags !== undefined ? JSON.stringify(tags) : current.tags;

  db.prepare(
    'UPDATE recipes SET title = ?, description = ?, steps = ?, portions = ?, ingredients = ?, image = ?, favorite = ?, tags = ? WHERE id = ? AND user_id = ?'
  ).run(
    nextTitle, nextDescription, nextSteps, nextPortions, JSON.stringify(nextIngredients), nextImage,
    nextFavorite, nextTags, req.params.id, req.userId
  );

  const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  res.json(serializeRecipe(row));
});

app.delete('/api/recipes/:id', (req, res) => {
  db.prepare('DELETE FROM recipes WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).end();
});

// --- Foods (personal library, macros per 100g) ---
app.get('/api/foods', (req, res) => {
  res.json(db.prepare('SELECT * FROM foods WHERE user_id = ? ORDER BY name').all(req.userId));
});

app.get('/api/foods/lookup/:barcode', async (req, res) => {
  try {
    const result = await lookupBarcode(req.params.barcode);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get('/api/foods/search-online', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    res.json(await searchFoodsOnline(q));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Manual trigger (also runs automatically once a day — see runDailyNutrientEstimation below).
app.post('/api/foods/estimate-missing-nutrients', async (req, res) => {
  try {
    res.json(await estimateMissingNutrients(db, req.userId, NUTRIENT_KEYS, INGREDIENT_NUTRIENT_FIELDS));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/foods/parse-text', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'texte requis' });
  }

  try {
    const parsed = await parseFoodText(text);
    const factor = 100 / parsed.quantite_g;

    const result = {
      name: parsed.nom,
      suggestedQuantity: parsed.quantite_g,
      kcal_per_100g: parsed.kcal * factor,
      protein_per_100g: parsed.proteines * factor,
      carbs_per_100g: parsed.glucides * factor,
      fat_per_100g: parsed.lipides * factor,
    };
    for (const key of NUTRIENT_KEYS) {
      result[`${key}_per_100g`] = (parsed[INGREDIENT_NUTRIENT_FIELDS[key]] || 0) * factor;
    }

    res.json(result);
  } catch (err) {
    res.status(422).json({ error: err.message || "Échec de l'analyse" });
  }
});

const SUPPORTED_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

app.post('/api/foods/parse-photo', uploadFoodPhoto.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'photo requise' });
  }
  const mediaType = SUPPORTED_PHOTO_MIME_TYPES.has(req.file.mimetype) ? req.file.mimetype : 'image/jpeg';

  try {
    const parsed = await parseFoodPhoto(req.file.buffer.toString('base64'), mediaType);
    const factor = 100 / parsed.quantite_g;

    const result = {
      name: parsed.nom,
      suggestedQuantity: parsed.quantite_g,
      kcal_per_100g: parsed.kcal * factor,
      protein_per_100g: parsed.proteines * factor,
      carbs_per_100g: parsed.glucides * factor,
      fat_per_100g: parsed.lipides * factor,
    };
    for (const key of NUTRIENT_KEYS) {
      result[`${key}_per_100g`] = (parsed[INGREDIENT_NUTRIENT_FIELDS[key]] || 0) * factor;
    }

    res.json(result);
  } catch (err) {
    res.status(422).json({ error: err.message || "Échec de l'analyse" });
  }
});

app.post('/api/foods', async (req, res) => {
  const { name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, category } = req.body;
  if (!name || kcal_per_100g === undefined) {
    return res.status(400).json({ error: 'name et kcal_per_100g requis' });
  }

  // Same product scanned/typed twice (or two brands sharing an identical name) should reuse the
  // existing row instead of creating a duplicate — case/whitespace-insensitive exact match, since
  // there's no barcode column to key off yet.
  const existing = db
    .prepare('SELECT * FROM foods WHERE user_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))')
    .get(req.userId, name);
  if (existing) {
    return res.status(200).json(existing);
  }

  const nutrientValues = {};
  for (const k of NUTRIENT_KEYS) nutrientValues[k] = Number(req.body[`${k}_per_100g`]) || 0;

  // Any newly created food gets its missing micronutrients filled in — manual entries (no
  // category) go straight to the AI; a barcode scan (category set) first tries copying from
  // another already-estimated food in the same OFF category (a second brand of eggs/skyr reuses
  // the first one's profile) and only calls the AI for whatever no peer has either.
  // "Missing" means the client didn't send the field at all — not just that it's 0, since the
  // manual creation form lets 0 be typed in as a real value (e.g. "this really has no sodium")
  // that must not get silently overwritten by an estimate.
  const missingKeys = NUTRIENT_KEYS.filter((k) => req.body[`${k}_per_100g`] === undefined);
  if (missingKeys.length > 0) {
    let stillMissing = missingKeys;
    if (category) {
      const categoryPeers = db.prepare('SELECT * FROM foods WHERE user_id = ? AND category = ?').all(req.userId, category);
      stillMissing = [];
      for (const k of missingKeys) {
        const peer = categoryPeers.find((p) => p[`${k}_per_100g`]);
        if (peer) nutrientValues[k] = peer[`${k}_per_100g`];
        else stillMissing.push(k);
      }
    }
    if (stillMissing.length > 0) {
      try {
        const estimated = await estimateNutrientsForFood(name, stillMissing, INGREDIENT_NUTRIENT_FIELDS);
        for (const k of stillMissing) nutrientValues[k] = estimated[k] || 0;
      } catch (err) {
        console.error('Nutrient estimation failed for', name, ':', err.message);
      }
    }
  }

  let microbiome = { plant_name: null, is_fermented: 0, is_prebiotic: 0, is_polyphenol: 0 };
  let microbiomeClassified = 0;
  try {
    microbiome = await classifyFood(name);
    microbiomeClassified = 1;
  } catch (err) {
    console.error('Microbiome classification failed for', name, ':', err.message);
  }

  const nutrientCols = NUTRIENT_KEYS.map((k) => `${k}_per_100g`);
  const result = db
    .prepare(
      `INSERT INTO foods (user_id, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, category, ${nutrientCols.join(', ')}, plant_name, is_fermented, is_prebiotic, is_polyphenol, microbiome_classified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ${nutrientCols.map(() => '?').join(', ')}, ?, ?, ?, ?, ?)`
    )
    .run(
      req.userId,
      name,
      Number(kcal_per_100g),
      Number(protein_per_100g) || 0,
      Number(carbs_per_100g) || 0,
      Number(fat_per_100g) || 0,
      category || '',
      ...NUTRIENT_KEYS.map((k) => nutrientValues[k]),
      microbiome.plant_name,
      microbiome.is_fermented,
      microbiome.is_prebiotic,
      microbiome.is_polyphenol,
      microbiomeClassified
    );

  const row = db.prepare('SELECT * FROM foods WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/api/foods/:id', async (req, res) => {
  const current = db.prepare('SELECT * FROM foods WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!current) return res.status(404).json({ error: 'aliment introuvable' });

  const baseFields = ['name', 'kcal_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g'];
  const allCols = [...baseFields, ...NUTRIENT_KEYS.map((k) => `${k}_per_100g`)];
  const values = {};
  for (const c of allCols) {
    values[c] = req.body[c] === undefined ? current[c] : c === 'name' ? req.body[c] : Number(req.body[c]) || 0;
  }

  // Same auto-fill as creation: this food may predate estimation, or have been created manually
  // (no category to trigger it) — whatever micronutrient is still 0 after this edit gets
  // estimated instead of silently staying at 0 forever.
  const missingKeys = NUTRIENT_KEYS.filter((k) => !values[`${k}_per_100g`]);
  if (missingKeys.length > 0) {
    try {
      const estimated = await estimateNutrientsForFood(values.name, missingKeys, INGREDIENT_NUTRIENT_FIELDS);
      for (const k of missingKeys) values[`${k}_per_100g`] = estimated[k] || 0;
    } catch (err) {
      console.error('Nutrient estimation failed for', values.name, ':', err.message);
    }
  }

  const setCols = allCols.map((c) => `${c} = ?`);
  db.prepare(`UPDATE foods SET ${setCols.join(', ')} WHERE id = ? AND user_id = ?`).run(
    ...allCols.map((c) => values[c]),
    req.params.id,
    req.userId
  );
  res.json(db.prepare('SELECT * FROM foods WHERE id = ?').get(req.params.id));
});

app.delete('/api/foods/:id', (req, res) => {
  db.prepare('DELETE FROM foods WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).end();
});

app.get('/api/foods/frequent', (req, res) => {
  const limit = Number(req.query.limit) || 10;
  // Recipes are logged as one 'recipe_ingredient' row per ingredient (not one 'recipe' row), so
  // "how many times was this recipe added" is COUNT(DISTINCT date+meal) over its ingredient rows.
  const rows = db
    .prepare(
      `SELECT source_type, source_id, label, use_count, last_used FROM (
         SELECT 'food' as source_type, fl.source_id as source_id, MAX(fl.label) as label,
           COUNT(*) as use_count, MAX(fl.created_at) as last_used
         FROM food_logs fl
         WHERE fl.user_id = ? AND fl.source_type = 'food' AND EXISTS (SELECT 1 FROM foods f WHERE f.id = fl.source_id AND f.user_id = fl.user_id)
         GROUP BY fl.source_id

         UNION ALL

         SELECT 'recipe' as source_type, fl.source_id as source_id,
           (SELECT r.title FROM recipes r WHERE r.id = fl.source_id) as label,
           COUNT(DISTINCT fl.date || '|' || fl.meal) as use_count, MAX(fl.created_at) as last_used
         FROM food_logs fl
         WHERE fl.user_id = ? AND fl.source_type = 'recipe_ingredient' AND EXISTS (SELECT 1 FROM recipes r WHERE r.id = fl.source_id AND r.user_id = fl.user_id)
         GROUP BY fl.source_id
       )
       ORDER BY use_count DESC, last_used DESC
       LIMIT ?`
    )
    .all(req.userId, req.userId, limit);
  res.json(rows);
});

// --- Macro log ---
function recipeMacrosPerPortion(userId, recipeId) {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(recipeId, userId);
  if (!recipe) return null;

  const ingredients = JSON.parse(recipe.ingredients);
  const totals = ingredients.reduce(
    (acc, i) => {
      acc.kcal += Number(i.kcal) || 0;
      acc.protein += Number(i.proteines) || 0;
      acc.carbs += Number(i.glucides) || 0;
      acc.fat += Number(i.lipides) || 0;
      for (const key of NUTRIENT_KEYS) {
        acc[key] += Number(i[INGREDIENT_NUTRIENT_FIELDS[key]]) || 0;
      }
      return acc;
    },
    Object.fromEntries([
      ['kcal', 0], ['protein', 0], ['carbs', 0], ['fat', 0],
      ...NUTRIENT_KEYS.map((k) => [k, 0]),
    ])
  );

  const portions = recipe.portions || 1;
  const perPortion = { title: recipe.title };
  for (const key of Object.keys(totals)) {
    perPortion[key] = totals[key] / portions;
  }
  return perPortion;
}

// Recipes are logged as one row per ingredient (source_type 'recipe_ingredient'), so the portions
// the user actually asked for isn't stored directly — recover it from the logged kcal total for
// that occurrence divided by the recipe's kcal-per-portion.
app.get('/api/food-logs/last-quantity', (req, res) => {
  const { source_type, source_id, meal } = req.query;
  if (!source_type || !source_id || !meal) return res.json({ quantity: null });

  if (source_type === 'food') {
    const row = db
      .prepare(
        `SELECT quantity FROM food_logs WHERE user_id = ? AND source_type = 'food' AND source_id = ? AND meal = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(req.userId, source_id, meal);
    return res.json({ quantity: row ? row.quantity : null });
  }

  if (source_type === 'recipe') {
    const group = db
      .prepare(
        `SELECT date, SUM(kcal) as total_kcal, MAX(created_at) as last_used
         FROM food_logs
         WHERE user_id = ? AND source_type = 'recipe_ingredient' AND source_id = ? AND meal = ?
         GROUP BY date
         ORDER BY last_used DESC
         LIMIT 1`
      )
      .get(req.userId, source_id, meal);
    if (!group) return res.json({ quantity: null });
    const perPortion = recipeMacrosPerPortion(req.userId, Number(source_id));
    if (!perPortion || !perPortion.kcal) return res.json({ quantity: null });
    return res.json({ quantity: Math.round((group.total_kcal / perPortion.kcal) * 100) / 100 });
  }

  res.json({ quantity: null });
});

app.get('/api/food-log', (req, res) => {
  const date = req.query.date || todayStr();
  if (req.query.meal) {
    res.json(
      db
        .prepare('SELECT * FROM food_logs WHERE user_id = ? AND date = ? AND meal = ? ORDER BY id')
        .all(req.userId, date, req.query.meal)
    );
  } else {
    res.json(db.prepare('SELECT * FROM food_logs WHERE user_id = ? AND date = ? ORDER BY id').all(req.userId, date));
  }
});

const nutrientCols = NUTRIENT_KEYS;

function insertFoodLogRow(userId, date, meal, source_type, source_id, label, qty, kcal, protein, carbs, fat, nutrients, unit = 'g', microbiome = null) {
  const m = microbiome || { plant_name: null, is_fermented: 0, is_prebiotic: 0, is_polyphenol: 0 };
  const result = db
    .prepare(
      `INSERT INTO food_logs (user_id, date, meal, source_type, source_id, label, quantity, kcal, protein, carbs, fat, unit, ${nutrientCols.join(', ')}, plant_name, is_fermented, is_prebiotic, is_polyphenol)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${nutrientCols.map(() => '?').join(', ')}, ?, ?, ?, ?)`
    )
    .run(
      userId, date, meal, source_type, source_id, label, qty, kcal, protein, carbs, fat, unit,
      ...nutrientCols.map((k) => nutrients[k]),
      m.plant_name, m.is_fermented ? 1 : 0, m.is_prebiotic ? 1 : 0, m.is_polyphenol ? 1 : 0
    );
  return db.prepare('SELECT * FROM food_logs WHERE id = ?').get(result.lastInsertRowid);
}

// Shared by the manual "add to journal" flow and the meal-plan -> journal sync, so both
// compute macros/micros from the live food/recipe data the same way. A recipe is logged as
// one row PER INGREDIENT (not one aggregate row) so the Journal shows what was actually eaten.
// `unit` is purely a display/water-tracking tag (a food's macros are still keyed per 100g,
// treating an ml of a drink as equivalent to a gram) — logging a food in ml means "this was a
// drink", so its quantity also counts toward the day's water total (see GET /api/water).
function insertFoodLog(userId, date, meal, source_type, source_id, quantity, unit = 'g') {
  const qty = Number(quantity);

  if (source_type === 'food') {
    const food = db.prepare('SELECT * FROM foods WHERE id = ? AND user_id = ?').get(source_id, userId);
    if (!food) throw new Error('aliment introuvable');
    const factor = qty / 100;
    const nutrients = {};
    for (const key of NUTRIENT_KEYS) nutrients[key] = (food[`${key}_per_100g`] || 0) * factor;
    return [
      insertFoodLogRow(
        userId, date, meal, 'food', source_id, food.name, qty,
        food.kcal_per_100g * factor, food.protein_per_100g * factor,
        food.carbs_per_100g * factor, food.fat_per_100g * factor, nutrients, unit,
        { plant_name: food.plant_name, is_fermented: food.is_fermented, is_prebiotic: food.is_prebiotic, is_polyphenol: food.is_polyphenol }
      ),
    ];
  }

  if (source_type === 'recipe') {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(source_id, userId);
    if (!recipe) throw new Error('recette introuvable');
    const ingredients = JSON.parse(recipe.ingredients);
    const scale = qty / (recipe.portions || 1);

    return ingredients.map((ing) => {
      const nutrients = {};
      for (const key of NUTRIENT_KEYS) {
        nutrients[key] = (Number(ing[INGREDIENT_NUTRIENT_FIELDS[key]]) || 0) * scale;
      }
      return insertFoodLogRow(
        userId, date, meal, 'recipe_ingredient', source_id, ing.nom, (Number(ing.qte) || 0) * scale,
        (Number(ing.kcal) || 0) * scale, (Number(ing.proteines) || 0) * scale,
        (Number(ing.glucides) || 0) * scale, (Number(ing.lipides) || 0) * scale, nutrients, ing.unite || 'g',
        { plant_name: ing.plant_name || null, is_fermented: ing.is_fermented, is_prebiotic: ing.is_prebiotic, is_polyphenol: ing.is_polyphenol }
      );
    });
  }

  throw new Error('source_type invalide');
}

app.post('/api/food-log', (req, res) => {
  const { date, meal, source_type, source_id, quantity, unit } = req.body;
  if (!source_type || !source_id || !quantity) {
    return res.status(400).json({ error: 'source_type, source_id et quantity requis' });
  }
  if (!mealsFor(getProfile(req.userId)).some((m) => m.key === meal)) {
    return res.status(400).json({ error: 'meal invalide' });
  }

  try {
    const rows = insertFoodLog(req.userId, date || todayStr(), meal, source_type, source_id, quantity, unit || 'g');
    res.status(201).json(rows);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.put('/api/food-log/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM food_logs WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!current) return res.status(404).json({ error: 'entrée introuvable' });

  const newQty = Number(req.body.quantity);
  if (!newQty || newQty <= 0) return res.status(400).json({ error: 'quantity invalide' });
  const factor = newQty / current.quantity;
  // unit is a display/water-tracking tag only (1ml treated as 1g for macro purposes), so
  // changing it alongside quantity doesn't affect the scaling math below.
  const unit = req.body.unit === 'ml' || req.body.unit === 'g' ? req.body.unit : current.unit;

  const setCols = [
    'quantity = ?', 'unit = ?', 'kcal = ?', 'protein = ?', 'carbs = ?', 'fat = ?',
    ...NUTRIENT_KEYS.map((k) => `${k} = ?`),
  ];
  const values = [
    newQty, unit, current.kcal * factor, current.protein * factor, current.carbs * factor, current.fat * factor,
    ...NUTRIENT_KEYS.map((k) => (current[k] || 0) * factor),
  ];
  db.prepare(`UPDATE food_logs SET ${setCols.join(', ')} WHERE id = ? AND user_id = ?`).run(...values, req.params.id, req.userId);

  res.json(db.prepare('SELECT * FROM food_logs WHERE id = ?').get(req.params.id));
});

app.delete('/api/food-log/:id', (req, res) => {
  db.prepare('DELETE FROM food_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).end();
});

// --- Meals / dashboard ---
app.get('/api/meal-types', (req, res) => {
  res.json(mealsFor(getProfile(req.userId)).map(({ key, label }) => ({ key, label })));
});

// --- Meal favorites (recurring foods/recipes for a given meal) ---
app.get('/api/meal-favorites', (req, res) => {
  const meal = req.query.meal;
  if (meal) {
    return res.json(db.prepare('SELECT * FROM meal_favorites WHERE user_id = ? AND meal = ? ORDER BY label').all(req.userId, meal));
  }
  res.json(db.prepare('SELECT * FROM meal_favorites WHERE user_id = ? ORDER BY label').all(req.userId));
});

app.post('/api/meal-favorites', (req, res) => {
  const { meal, source_type, source_id, label } = req.body;
  if (!mealsFor(getProfile(req.userId)).some((m) => m.key === meal)) {
    return res.status(400).json({ error: 'meal invalide' });
  }
  if (!source_type || !source_id || !label) {
    return res.status(400).json({ error: 'source_type, source_id et label requis' });
  }

  const result = db
    .prepare(
      `INSERT OR IGNORE INTO meal_favorites (user_id, meal, source_type, source_id, label)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(req.userId, meal, source_type, source_id, label);

  const row = result.lastInsertRowid
    ? db.prepare('SELECT * FROM meal_favorites WHERE id = ?').get(result.lastInsertRowid)
    : db
        .prepare('SELECT * FROM meal_favorites WHERE user_id = ? AND meal = ? AND source_type = ? AND source_id = ?')
        .get(req.userId, meal, source_type, source_id);

  res.status(201).json(row);
});

app.delete('/api/meal-favorites/:id', (req, res) => {
  db.prepare('DELETE FROM meal_favorites WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).end();
});

// Fat-soluble vitamins (+ B12) are stored by the body over weeks/months, so a single day's
// value isn't physiologically meaningful — averages the last 7 days (ending at `endDate`) over
// however many of them actually have logs, same day-skipping approach as the weekly Rapport.
function weeklyAvgNutrients(userId, endDate) {
  const end = new Date(`${endDate}T00:00:00Z`);
  const totals = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
  let daysWithData = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayLogs = db.prepare('SELECT * FROM food_logs WHERE user_id = ? AND date = ?').all(userId, dateStr);
    if (dayLogs.length === 0) continue;
    daysWithData += 1;
    for (const l of dayLogs) {
      for (const key of NUTRIENT_KEYS) totals[key] += l[key] || 0;
    }
  }
  const n = daysWithData || 1;
  const avg = {};
  for (const key of NUTRIENT_KEYS) avg[key] = totals[key] / n;
  return avg;
}

// Monday-Sunday calendar week, offset weeks from the current one (0 = this week, -1 = last
// week). The current week stops at today (no point listing future dates); a past week is the
// full 7 days since it's already over.
function calendarWeekDates(offset = 0) {
  const today = new Date(`${todayStr()}T00:00:00Z`);
  const dow = today.getUTCDay() === 0 ? 7 : today.getUTCDay(); // Mon=1..Sun=7
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - (dow - 1) + offset * 7);
  const lastDay = offset === 0 ? today : new Date(monday.getTime() + 6 * 86400000);
  const dates = [];
  for (let d = new Date(monday); d <= lastDay; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// Previous full calendar month (e.g. today in July -> all of June), not a rolling 30-day window.
function previousCalendarMonthDates() {
  const today = new Date(`${todayStr()}T00:00:00Z`);
  const firstOfThisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 86400000);
  const firstOfPrevMonth = new Date(Date.UTC(lastOfPrevMonth.getUTCFullYear(), lastOfPrevMonth.getUTCMonth(), 1));
  const dates = [];
  for (let d = new Date(firstOfPrevMonth); d <= lastOfPrevMonth; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// Previous full calendar quarter (Jan-Mar / Apr-Jun / Jul-Sep / Oct-Dec) — e.g. today in July
// (Q3) -> all of Q2 (Apr 1 - Jun 30).
function previousCalendarQuarterDates() {
  const today = new Date(`${todayStr()}T00:00:00Z`);
  const currentQuarterStartMonth = Math.floor(today.getUTCMonth() / 3) * 3;
  const firstOfThisQuarter = new Date(Date.UTC(today.getUTCFullYear(), currentQuarterStartMonth, 1));
  const lastOfPrevQuarter = new Date(firstOfThisQuarter.getTime() - 86400000);
  const prevQuarterStartMonth = Math.floor(lastOfPrevQuarter.getUTCMonth() / 3) * 3;
  const firstOfPrevQuarter = new Date(Date.UTC(lastOfPrevQuarter.getUTCFullYear(), prevQuarterStartMonth, 1));
  const dates = [];
  for (let d = new Date(firstOfPrevQuarter); d <= lastOfPrevQuarter; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// Groups a list of dates into Monday-anchored week buckets. For a single calendar week (7 or
// fewer dates) this produces exactly one bucket, so weekly-target math (sum vs weekly target)
// stays correct for "Semaine en cours"/"Semaine passée". For "Mois passé" it produces ~4-5
// buckets (including partial weeks at the month's edges), letting weekly objectives and plant
// diversity be averaged across the month's weeks instead of summed against an inflated target.
function weekBuckets(dates) {
  const buckets = new Map();
  for (const date of dates) {
    const d = new Date(`${date}T00:00:00Z`);
    const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - (dow - 1));
    const key = monday.toISOString().slice(0, 10);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(date);
  }
  return [...buckets.values()];
}

// Plant diversity + fermented/prebiotic/polyphenol sources over a given calendar week (see
// calendarWeekDates) — "30 plants/week" only means something on a real Monday-Sunday week.
// `food`/`recipe_ingredient` rows carry their own plant_name snapshot; `recipe` (single
// aggregate row) rows don't, so as a best-effort fallback this looks up the still-existing
// recipe's current ingredients — a deleted recipe's plants are lost, same known gap as omega3.
function microbiomeSummaryForWeek(userId, dates) {
  const placeholders = dates.map(() => '?').join(',');
  const logs = db.prepare(`SELECT * FROM food_logs WHERE user_id = ? AND date IN (${placeholders})`).all(userId, ...dates);

  const plants = new Set();
  for (const l of logs) {
    if (l.plant_name) plants.add(l.plant_name);
  }
  const recipeRowIds = [...new Set(logs.filter((l) => l.source_type === 'recipe').map((l) => l.source_id))];
  if (recipeRowIds.length > 0) {
    const placeholders2 = recipeRowIds.map(() => '?').join(',');
    const recipes = db.prepare(`SELECT id, ingredients FROM recipes WHERE user_id = ? AND id IN (${placeholders2})`).all(userId, ...recipeRowIds);
    for (const r of recipes) {
      try {
        for (const ing of JSON.parse(r.ingredients)) {
          if (ing.plant_name) plants.add(ing.plant_name);
        }
      } catch {
        // ignore unparsable recipe JSON
      }
    }
  }

  return { plantCount: plants.size, plantList: [...plants].sort((a, b) => a.localeCompare(b, 'fr')) };
}

// FR/EN strings for buildPreviousDayImprovements below — this is the only server-generated text
// surfaced in the Journal UI, so it's the only spot that needs its own small i18n table rather
// than being hardcoded French like the rest of the (French-only) nutrition engine.
const IMPROVEMENT_I18N = {
  fr: {
    calories: 'Calories',
    proteines: 'Protéines',
    sodium: 'Sodium',
    cafeine: 'Caféine',
    microLabels: { fiber: 'Fibres', potassium: 'Potassium', magnesium: 'Magnésium', calcium: 'Calcium', vitamin_c: 'Vitamine C', zinc: 'Zinc', iron: 'Fer' },
    proteinSuggestion: '150 g de blanc de poulet ou 200 g de skyr (≈ 30-35 g de protéines)',
    microSuggestions: {
      fiber: 'des légumineuses, flocons d\'avoine, légumes ou fruits',
      potassium: "une pomme de terre avec la peau (300 g ≈ 900 mg) ou une poignée d'épinards",
      magnesium: '30 g d\'amandes (≈ 75 mg), des épinards, du chocolat noir ou des graines de courge',
      calcium: 'un laitage, 100 g de sardines, 30 g d\'amandes ou du tofu',
      vitamin_c: "un kiwi ou la moitié d'un poivron rouge (≈ 70-90 mg)",
      zinc: 'de la viande rouge, des fruits de mer, des œufs ou des graines de courge',
      iron: '100 g de lentilles cuites (≈ 3 mg) ou un steak de bœuf',
    },
    kcalOver: (n) => `${n} kcal au-dessus de ta cible hier — vise un peu moins aujourd'hui.`,
    kcalUnder: (n) => `${n} kcal en dessous de ta cible hier — vise un peu plus aujourd'hui.`,
    proteinDetail: (pct, suggestion) => `${pct}% de ta cible hier — ajoute ${suggestion} aujourd'hui.`,
    sodiumDetail: (n) => `Dépassé de ${n} mg hier — réduis le sel aujourd'hui.`,
    caffeineDetail: (n) => `Dépassée de ${n} mg hier — limite les cafés aujourd'hui.`,
    microDetail: (pct, suggestion) => `${pct}% de ta cible hier — ajoute ${suggestion} aujourd'hui.`,
  },
  en: {
    calories: 'Calories',
    proteines: 'Protein',
    sodium: 'Sodium',
    cafeine: 'Caffeine',
    microLabels: { fiber: 'Fiber', potassium: 'Potassium', magnesium: 'Magnesium', calcium: 'Calcium', vitamin_c: 'Vitamin C', zinc: 'Zinc', iron: 'Iron' },
    proteinSuggestion: '150 g of chicken breast or 200 g of skyr (≈ 30-35 g protein)',
    microSuggestions: {
      fiber: 'legumes, oats, vegetables or fruit',
      potassium: 'a potato with the skin on (300 g ≈ 900 mg) or a handful of spinach',
      magnesium: '30 g of almonds (≈ 75 mg), spinach, dark chocolate or pumpkin seeds',
      calcium: 'a dairy portion, 100 g of sardines, 30 g of almonds or tofu',
      vitamin_c: 'a kiwi or half a red bell pepper (≈ 70-90 mg)',
      zinc: 'red meat, seafood, eggs or pumpkin seeds',
      iron: '100 g of cooked lentils (≈ 3 mg) or a beef steak',
    },
    kcalOver: (n) => `${n} kcal above your target yesterday — aim a bit lower today.`,
    kcalUnder: (n) => `${n} kcal below your target yesterday — aim a bit higher today.`,
    proteinDetail: (pct, suggestion) => `${pct}% of your target yesterday — add ${suggestion} today.`,
    sodiumDetail: (n) => `Exceeded by ${n} mg yesterday — cut back on salt today.`,
    caffeineDetail: (n) => `Exceeded by ${n} mg yesterday — limit coffee today.`,
    microDetail: (pct, suggestion) => `${pct}% of your target yesterday — add ${suggestion} today.`,
  },
};

// Everything worth improving today, based on the previous day's numbers — one item per nutrient
// that missed the mark (kcal, protein, sodium/caffeine limits, daily-goal micros), sorted worst
// first. Only "needs improvement" items are returned (nothing for things that were fine), so the
// Journal banner can show a short, purely actionable list instead of a full recap.
function buildPreviousDayImprovements(userId, date, lang) {
  const S = IMPROVEMENT_I18N[lang] || IMPROVEMENT_I18N.fr;
  const prev = new Date(`${date}T00:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  const prevDate = prev.toISOString().slice(0, 10);

  const logs = db.prepare('SELECT * FROM food_logs WHERE user_id = ? AND date = ?').all(userId, prevDate);
  if (logs.length === 0) return null;

  const summary = computeSummary(userId, prevDate);
  const consumed = logs.reduce((acc, l) => {
    acc.kcal += l.kcal;
    acc.protein += l.protein;
    for (const key of NUTRIENT_KEYS) acc[key] += l[key] || 0;
    return acc;
  }, EMPTY_TOTALS());
  const drinkLogs = db.prepare('SELECT * FROM coffee_logs WHERE user_id = ? AND date = ?').all(userId, prevDate);
  consumed.caffeine += drinkLogs.reduce((s, l) => s + l.caffeine_mg, 0);
  consumed.kcal += drinkLogs.reduce((s, l) => s + l.kcal, 0);
  consumed.protein += drinkLogs.reduce((s, l) => s + l.protein, 0);

  const profile = getProfile(userId);
  const { proteinTarget } = macroFloorsAndTargets(profile.weight_kg || 100);

  const items = [];
  const KCAL_TOLERANCE = 50;
  const kcalDiff = consumed.kcal - summary.targetIntake;
  if (kcalDiff > KCAL_TOLERANCE) {
    items.push({
      key: 'kcal',
      label: S.calories,
      severity: kcalDiff,
      detail: S.kcalOver(Math.round(kcalDiff)),
    });
  } else if (kcalDiff < -KCAL_TOLERANCE) {
    items.push({
      key: 'kcal',
      label: S.calories,
      severity: -kcalDiff,
      detail: S.kcalUnder(Math.round(-kcalDiff)),
    });
  }

  if (consumed.protein < proteinTarget * 0.9) {
    const pct = (consumed.protein / proteinTarget) * 100;
    items.push({
      key: 'protein',
      label: S.proteines,
      severity: 100 - pct,
      detail: S.proteinDetail(Math.round(pct), S.proteinSuggestion),
    });
  }

  if (consumed.sodium > MICRO_REFERENCE.sodium.reference) {
    items.push({
      key: 'sodium',
      label: S.sodium,
      severity: consumed.sodium - MICRO_REFERENCE.sodium.reference,
      detail: S.sodiumDetail(Math.round(consumed.sodium - MICRO_REFERENCE.sodium.reference)),
    });
  }
  if (consumed.caffeine > MICRO_REFERENCE.caffeine.reference) {
    items.push({
      key: 'caffeine',
      label: S.cafeine,
      severity: consumed.caffeine - MICRO_REFERENCE.caffeine.reference,
      detail: S.caffeineDetail(Math.round(consumed.caffeine - MICRO_REFERENCE.caffeine.reference)),
    });
  }

  const DAILY_GOAL_MICRO_KEYS = ['fiber', 'potassium', 'magnesium', 'calcium', 'vitamin_c', 'zinc', 'iron'];
  for (const key of DAILY_GOAL_MICRO_KEYS) {
    const ref = MICRO_REFERENCE[key];
    const pct = (consumed[key] / ref.reference) * 100;
    if (pct < 80) {
      items.push({
        key,
        label: S.microLabels[key] || ref.label,
        severity: 80 - pct,
        detail: S.microDetail(Math.round(pct), S.microSuggestions[key] || ref.label),
      });
    }
  }

  items.sort((a, b) => b.severity - a.severity);
  return { date: prevDate, items: items.map(({ key, label, detail }) => ({ key, label, detail })) };
}

app.get('/api/dashboard', (req, res) => {
  const date = req.query.date || todayStr();
  const lang = req.query.lang === 'en' ? 'en' : 'fr';
  const summary = computeSummary(req.userId, date);
  const logs = db.prepare('SELECT * FROM food_logs WHERE user_id = ? AND date = ? ORDER BY id').all(req.userId, date);

  const consumed = logs.reduce((acc, l) => {
    acc.kcal += l.kcal;
    acc.protein += l.protein;
    acc.carbs += l.carbs;
    acc.fat += l.fat;
    for (const key of NUTRIENT_KEYS) acc[key] += l[key] || 0;
    return acc;
  }, EMPTY_TOTALS());

  // "Boisson énergisante" drinks: caffeine always counts toward the micronutrient total, and
  // whichever ones have a real recipe behind them (café latte's espresso + almond milk) also
  // count toward kcal/macros.
  const drinkLogs = db.prepare('SELECT * FROM coffee_logs WHERE user_id = ? AND date = ?').all(req.userId, date);
  const coffeeCaffeineMg = drinkLogs.reduce((s, l) => s + l.caffeine_mg, 0);
  consumed.caffeine += coffeeCaffeineMg;
  for (const l of drinkLogs) {
    consumed.kcal += l.kcal;
    consumed.protein += l.protein;
    consumed.carbs += l.carbs;
    consumed.fat += l.fat;
  }

  const macroTargets = computeMacroTargets(summary.targetIntake, summary.profile);
  const weeklyAvg = weeklyAvgNutrients(req.userId, date);
  const micros = buildMicroList(NUTRIENT_KEYS, (key) =>
    MICRO_REFERENCE[key]?.weeklyAvg ? weeklyAvg[key] : consumed[key]
  );

  // Which logged foods/ingredients contributed to each micronutrient today, so "3.4/8mg fer"
  // can be traced back to "Œufs 1.8mg, Poulet 1.2mg..." instead of staying an opaque total.
  const microSources = {};
  for (const key of NUTRIENT_KEYS) {
    microSources[key] = logs
      .filter((l) => (l[key] || 0) > 0)
      .map((l) => ({ label: l.label, value: l[key] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }
  if (drinkLogs.length > 0) {
    const byType = {};
    for (const l of drinkLogs) {
      byType[l.type] = (byType[l.type] || 0) + l.caffeine_mg;
    }
    const drinkSources = Object.entries(byType)
      .filter(([, value]) => value > 0)
      .map(([type, value]) => ({ label: DRINK_TYPES[type]?.label || type, value }));
    microSources.caffeine = [...microSources.caffeine, ...drinkSources].sort((a, b) => b.value - a.value);
  }

  const meals = mealsFor(summary.profile).map((m) => {
    const mealLogs = logs.filter((l) => l.meal === m.key);
    const mealTotals = mealLogs.reduce(
      (acc, l) => ({
        kcal: acc.kcal + l.kcal,
        protein: acc.protein + l.protein,
        carbs: acc.carbs + l.carbs,
        fat: acc.fat + l.fat,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    );
    return {
      key: m.key,
      label: m.label,
      budgetKcal: summary.targetIntake * m.share,
      consumedKcal: mealTotals.kcal,
      consumedProtein: mealTotals.protein,
      consumedCarbs: mealTotals.carbs,
      consumedFat: mealTotals.fat,
    };
  });

  res.json({
    date,
    targetIntake: summary.targetIntake,
    consumedKcal: consumed.kcal,
    remainingKcal: summary.targetIntake - consumed.kcal,
    burnedKcal: summary.activitiesKcal,
    macros: {
      carbs: { consumed: consumed.carbs, target: macroTargets.carbs },
      protein: { consumed: consumed.protein, target: macroTargets.protein },
      fat: { consumed: consumed.fat, target: macroTargets.fat },
    },
    micros,
    microSources,
    meals,
    previousDayImprovements: buildPreviousDayImprovements(req.userId, date, lang),
  });
});

// "Aujourd'hui" report: everything expressed as what's left, not what's been eaten — answers
// "what can I still eat today" instead of the trend Rapport's "how am I doing over time".
app.get('/api/today-report', (req, res) => {
  const date = req.query.date || todayStr();
  const logs = db.prepare('SELECT * FROM food_logs WHERE user_id = ? AND date = ?').all(req.userId, date);

  const consumed = logs.reduce((acc, l) => {
    acc.kcal += l.kcal;
    acc.protein += l.protein;
    acc.carbs += l.carbs;
    acc.fat += l.fat;
    for (const key of NUTRIENT_KEYS) acc[key] += l[key] || 0;
    return acc;
  }, EMPTY_TOTALS());

  const drinkLogs = db.prepare('SELECT * FROM coffee_logs WHERE user_id = ? AND date = ?').all(req.userId, date);
  consumed.caffeine += drinkLogs.reduce((s, l) => s + l.caffeine_mg, 0);
  for (const l of drinkLogs) {
    consumed.kcal += l.kcal;
    consumed.protein += l.protein;
    consumed.carbs += l.carbs;
    consumed.fat += l.fat;
  }

  // 1. Seuils à ne pas dépasser (sodium/caféine) — inverted logic, low = good.
  const limits = Object.entries(MICRO_REFERENCE)
    .filter(([, ref]) => ref.kind === 'limit')
    .map(([key, ref]) => ({
      key,
      label: ref.label,
      unit: ref.unit,
      consumed: consumed[key] || 0,
      reference: ref.reference,
      remaining: ref.reference - (consumed[key] || 0),
    }));

  // 2. Objectifs du jour — only nutrients with a real daily requirement (kcal, protein first,
  // then the dailyGoal:true micros). Sodium already lives in `limits`, not duplicated here.
  const dailyGoals = [];
  const DAILY_GOAL_MICRO_KEYS = ['fiber', 'potassium', 'magnesium', 'calcium', 'vitamin_c', 'zinc', 'iron'];
  for (const key of DAILY_GOAL_MICRO_KEYS) {
    const ref = MICRO_REFERENCE[key];
    dailyGoals.push({
      key,
      label: ref.label,
      unit: ref.unit,
      consumed: consumed[key] || 0,
      target: ref.reference,
      remaining: ref.reference - (consumed[key] || 0),
    });
  }

  // 3. Nutrients with no meaningful daily target — either stored over weeks (fat-soluble
  // vitamins, B12) or naturally lumpy (omega-3, folate, selenium, iodine, choline). Just today's
  // amount, no bar/%/color — the real target lives in the weekly Rapport.
  const noGoalMicros = NUTRIENT_KEYS.filter((k) => MICRO_REFERENCE[k] && !hasDailyGoal(k)).map((key) => {
    const ref = MICRO_REFERENCE[key];
    return { key, label: ref.label, unit: ref.unit, consumed: consumed[key] || 0 };
  });
  noGoalMicros.push({ key: 'carbs', label: 'Glucides', unit: 'g', consumed: consumed.carbs });

  // 4. Microbiote — plant counter now matches the calendar week used by the weekly Rapport
  // (Monday-Sunday), not a trailing 7-day window.
  const fermentedFoods = logs.filter((l) => l.is_fermented).map((l) => l.label);
  const { plantCount, plantList } = microbiomeSummaryForWeek(req.userId, calendarWeekDates(0));
  const catalogPlants = db
    .prepare("SELECT DISTINCT plant_name FROM foods WHERE user_id = ? AND plant_name IS NOT NULL AND plant_name != ''")
    .all(req.userId)
    .map((r) => r.plant_name);
  const notYetEaten = catalogPlants.filter((p) => !plantList.includes(p));
  const plantSuggestionToday = notYetEaten.length > 0 ? notYetEaten[Math.floor(Math.random() * notYetEaten.length)] : null;

  // Which logged foods contributed to each nutrient today, so a click on any row can show
  // "d'où ça vient" instead of staying an opaque total — same source shape as the weekly/monthly
  // reports (buildMicroSources with n=1, i.e. today's raw values instead of a period average).
  const microSources = buildMicroSources(logs, 1);
  if (drinkLogs.length > 0) {
    const byType = {};
    for (const l of drinkLogs) byType[l.type] = (byType[l.type] || 0) + l.caffeine_mg;
    const drinkSources = Object.entries(byType)
      .filter(([, value]) => value > 0)
      .map(([type, value]) => ({ label: DRINK_TYPES[type]?.label || type, value }));
    microSources.caffeine = [...microSources.caffeine, ...drinkSources].sort((a, b) => b.value - a.value);
  }

  res.json({
    date,
    limits,
    dailyGoals,
    noGoalMicros,
    microSources,
    microbiote: {
      fermentedToday: fermentedFoods.length,
      fermentedFoods,
      plantSuggestionToday,
      plantCount,
      plantTarget: 30,
    },
  });
});

app.get('/api/meals/:key', (req, res) => {
  const date = req.query.date || todayStr();
  const summary = computeSummary(req.userId, date);
  const mealDef = mealsFor(summary.profile).find((m) => m.key === req.params.key);
  if (!mealDef) return res.status(404).json({ error: 'repas inconnu' });

  const entries = db
    .prepare('SELECT * FROM food_logs WHERE user_id = ? AND date = ? AND meal = ? ORDER BY id')
    .all(req.userId, date, mealDef.key);

  const consumed = entries.reduce(
    (acc, l) => ({
      kcal: acc.kcal + l.kcal,
      protein: acc.protein + l.protein,
      carbs: acc.carbs + l.carbs,
      fat: acc.fat + l.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const dayMacroTargets = computeMacroTargets(summary.targetIntake, summary.profile);
  const mealShare = mealDef.share;
  const macroTargets = {
    carbs: dayMacroTargets.carbs * mealShare,
    protein: dayMacroTargets.protein * mealShare,
    fat: dayMacroTargets.fat * mealShare,
  };

  res.json({
    key: mealDef.key,
    label: mealDef.label,
    budgetKcal: summary.targetIntake * mealShare,
    consumed,
    macroTargets,
    entries,
  });
});

// --- Report (Rapport) ---
// Protein/fat aren't in MICRO_REFERENCE (they're macros), so they stay here rather than in
// nutrientReference.js's shared NUTRIENT_SUGGESTIONS.
const FOOD_SUGGESTIONS = {
  protein: '150 g de blanc de poulet ou 200 g de skyr (≈ 30-35 g de protéines)',
  fat: "une cuillère à soupe d'huile d'olive ou 30 g d'amandes",
};

// Weight-based protein/fat targets, shared by the trend Rapport and the "Aujourd'hui" report so
// the two views never disagree on what "165g de protéines" means for the same profile.
function macroFloorsAndTargets(referenceWeightKg) {
  return {
    proteinTarget: referenceWeightKg * 2.0,
    proteinFloor: referenceWeightKg * 1.6,
    fatTargetMin: referenceWeightKg * 0.8,
    fatTargetMax: referenceWeightKg * 1.0,
    fatFloor: referenceWeightKg * 0.6,
  };
}

// All date-only arithmetic here uses the UTC getters/setters (and a 'Z'-suffixed parse) so a
// local-midnight Date is never round-tripped through toISOString() (which returns UTC) — that
// mismatch silently shifts every date back by a day in any timezone ahead of UTC.
function isNextDay(prevDateStr, dateStr) {
  const prev = new Date(`${prevDateStr}T00:00:00Z`);
  const cur = new Date(`${dateStr}T00:00:00Z`);
  return cur - prev === 86400000;
}

function rangeDates(range) {
  const dates = [];
  const today = new Date(`${todayStr()}T00:00:00Z`);
  if (range === 'week') {
    const dow = today.getUTCDay() === 0 ? 7 : today.getUTCDay(); // Mon=1..Sun=7
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() - (dow - 1));
    for (let d = new Date(monday); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }
  } else if (range === 'month') {
    // Previous full calendar month (e.g. today in July -> all of June), not a rolling 30-day
    // window — matches the calendar-week logic used by "Semaine passée".
    const firstOfThisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 86400000);
    const firstOfPrevMonth = new Date(Date.UTC(lastOfPrevMonth.getUTCFullYear(), lastOfPrevMonth.getUTCMonth(), 1));
    for (let d = new Date(firstOfPrevMonth); d <= lastOfPrevMonth; d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }
  } else {
    const n = { 7: 7, 14: 14, 30: 30, 60: 60, 90: 90 }[range] || 7;
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
  }
  return dates;
}

const EMPTY_TOTALS = () =>
  Object.fromEntries([
    ['kcal', 0], ['protein', 0], ['carbs', 0], ['fat', 0],
    ...NUTRIENT_KEYS.map((k) => [k, 0]),
  ]);

// Which logged foods/ingredients contributed to each micronutrient over a period, so "450mg/j"
// can be traced back to "Saumon 300mg, Œufs 100mg..." instead of staying an opaque average.
function buildMicroSources(allLogs, n) {
  const sources = {};
  for (const key of NUTRIENT_KEYS) {
    const byLabel = new Map();
    for (const l of allLogs) {
      const value = l[key] || 0;
      if (value <= 0) continue;
      byLabel.set(l.label, (byLabel.get(l.label) || 0) + value);
    }
    sources[key] = [...byLabel.entries()]
      .map(([label, total]) => ({ label, value: total / n }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }
  return sources;
}

// Shared "what should I actually do about this" builder for the Semaine passée / 30 jours
// reports: deficiencies (floor nutrients under 80%) with a food suggestion, excesses (limit
// nutrients over 100%, i.e. sodium/caffeine) with their biggest contributing foods so there's
// something concrete to cut, and supplements for the handful of nutrients where food alone
// often isn't enough (see SUPPLEMENT_SUGGESTIONS).
function buildImprovementInsights(microList, sources) {
  const deficiencies = microList
    .filter((m) => m.kind !== 'limit' && m.pct < 80)
    .map((m) => ({ key: m.key, label: m.label, pct: m.pct, suggestion: NUTRIENT_SUGGESTIONS[m.key] || null }))
    .sort((a, b) => a.pct - b.pct);
  const excesses = microList
    .filter((m) => m.kind === 'limit' && m.pct > 100)
    .map((m) => ({ key: m.key, label: m.label, pct: m.pct, topSources: (sources[m.key] || []).slice(0, 3) }))
    .sort((a, b) => b.pct - a.pct);
  const supplements = microList
    .filter((m) => m.kind !== 'limit' && m.pct < 80 && SUPPLEMENT_SUGGESTIONS[m.key])
    .map((m) => ({ key: m.key, label: m.label, suggestion: SUPPLEMENT_SUGGESTIONS[m.key] }));
  return { deficiencies, excesses, supplements };
}

// First/last logged weight within a date range, for the 30-day trend view. Uses whatever weight
// was actually logged closest to (at or after) the range start / (at or before) the range end —
// not necessarily on those exact dates.
function weightEvolutionForRange(userId, dates) {
  const start = dates[0];
  const end = dates[dates.length - 1];
  const first = db.prepare('SELECT date, weight_kg FROM weight_logs WHERE user_id = ? AND date >= ? ORDER BY date ASC LIMIT 1').get(userId, start);
  const last = db.prepare('SELECT date, weight_kg FROM weight_logs WHERE user_id = ? AND date <= ? ORDER BY date DESC LIMIT 1').get(userId, end);
  if (!first || !last || first.date === last.date) return null;
  return {
    startDate: first.date,
    endDate: last.date,
    startWeightKg: first.weight_kg,
    endWeightKg: last.weight_kg,
    changeKg: last.weight_kg - first.weight_kg,
  };
}

app.get('/api/report', (req, res) => {
  const range = ['7', '14', '30', 'week', 'month'].includes(req.query.range) ? req.query.range : '7';
  const dates = rangeDates(range);
  const profile = getProfile(req.userId);
  const referenceWeightKg = profile.weight_kg || 100;

  const dayResults = [];
  const allLogs = [];
  const dailyAll = [];
  for (const date of dates) {
    const logs = db.prepare('SELECT * FROM food_logs WHERE user_id = ? AND date = ?').all(req.userId, date);
    const summary = computeSummary(req.userId, date);
    if (logs.length === 0) {
      dailyAll.push({ date, consumed: null, target: summary.targetIntake, logged: false });
      continue;
    }
    const totals = logs.reduce((acc, l) => {
      acc.kcal += l.kcal;
      acc.protein += l.protein;
      acc.carbs += l.carbs;
      acc.fat += l.fat;
      for (const key of NUTRIENT_KEYS) acc[key] += l[key] || 0;
      return acc;
    }, EMPTY_TOTALS());
    dayResults.push({ date, consumed: totals, target: summary.targetIntake });
    dailyAll.push({ date, consumed: totals.kcal, target: summary.targetIntake, logged: true });
    allLogs.push(...logs);
  }

  if (dayResults.length < 3) {
    return res.json({
      range,
      insufficientData: true,
      daysLogged: dayResults.length,
      daysInRange: dates.length,
    });
  }

  const n = dayResults.length;
  const avg = (sel) => dayResults.reduce((s, d) => s + sel(d), 0) / n;

  const avgConsumedKcal = avg((d) => d.consumed.kcal);
  const avgTargetKcal = avg((d) => d.target);
  const avgDiff = avgConsumedKcal - avgTargetKcal;
  const avgDiffPct = avgTargetKcal > 0 ? (avgDiff / avgTargetKcal) * 100 : 0;
  const cumulativeDeficit = dayResults.reduce((s, d) => s + (d.target - d.consumed.kcal), 0);
  const theoreticalWeightLossKg = cumulativeDeficit / 7700;
  const daysUnder2000 = dayResults.filter((d) => d.consumed.kcal < 2000).map((d) => d.date);

  const avgProtein = avg((d) => d.consumed.protein);
  const avgCarbs = avg((d) => d.consumed.carbs);
  const avgFat = avg((d) => d.consumed.fat);
  const avgFiber = avg((d) => d.consumed.fiber);

  const { proteinTarget, proteinFloor, fatTargetMin, fatTargetMax, fatFloor } =
    macroFloorsAndTargets(referenceWeightKg);

  // 'Correct' requires being within 10% of the actual target, not just above the (lower) floor —
  // 140g against a 165g target is still a real deficit (85%), even though it clears the 132g
  // floor. The floor stays as the "how urgent" signal for the low-fat consecutive-days check
  // below; it's no longer what decides the displayed status.
  const macros = {
    protein: {
      avg: avgProtein,
      target: proteinTarget,
      floor: proteinFloor,
      status: avgProtein < proteinTarget * 0.9 ? 'deficit' : 'correct',
    },
    fat: {
      avg: avgFat,
      targetMin: fatTargetMin,
      targetMax: fatTargetMax,
      floor: fatFloor,
      status: avgFat < fatFloor ? 'deficit' : avgFat < fatTargetMin ? 'faible' : 'correct',
    },
    carbs: { avg: avgCarbs },
    fiber: {
      avg: avgFiber,
      targetMin: 30,
      targetMax: 38,
      floor: 25,
      status: avgFiber < 25 ? 'deficit' : avgFiber < 30 ? 'faible' : 'correct',
    },
  };

  // Consecutive calendar-day check for the fat floor (not just consecutive logged entries).
  let maxConsecutiveFatLow = 0;
  let run = 0;
  let prevDate = null;
  for (const d of dayResults) {
    const low = d.consumed.fat < fatFloor;
    if (low && prevDate && isNextDay(prevDate, d.date)) run += 1;
    else run = low ? 1 : 0;
    maxConsecutiveFatLow = Math.max(maxConsecutiveFatLow, run);
    prevDate = d.date;
  }

  const micros = buildMicroList(NUTRIENT_KEYS, (key) => avg((d) => d.consumed[key]));
  const microSources = buildMicroSources(allLogs, n);
  const insights = buildImprovementInsights(micros, microSources);

  const recommendations = [];
  if (macros.protein.status === 'deficit') {
    recommendations.push(
      `Protéines sous le plancher (${avgProtein.toFixed(0)} g/j pour ${proteinFloor.toFixed(0)} g mini) : ajoute ${FOOD_SUGGESTIONS.protein} pour préserver ta masse musculaire en déficit.`
    );
  }
  if (macros.fat.status === 'deficit' || maxConsecutiveFatLow >= 2) {
    recommendations.push(
      `Lipides sous le plancher hormonal (${avgFat.toFixed(0)} g/j pour ${fatFloor.toFixed(0)} g mini)${maxConsecutiveFatLow >= 2 ? `, ${maxConsecutiveFatLow} jours d'affilée` : ''} : ajoute ${FOOD_SUGGESTIONS.fat}.`
    );
  }
  if (daysUnder2000.length >= 3) {
    recommendations.push(
      `${daysUnder2000.length} jours sous le plancher de 2000 kcal cette période : ce n'est pas un objectif à tenir, remonte vers ta cible (${avgTargetKcal.toFixed(0)} kcal).`
    );
  } else if (daysUnder2000.length > 0) {
    recommendations.push(
      `${daysUnder2000.length} jour(s) sous 2000 kcal (${daysUnder2000.join(', ')}) — un plancher, pas une performance.`
    );
  }
  for (const m of micros.filter((m) => m.suggestion).slice(0, 2)) {
    recommendations.push(`${m.label} à ${Math.round(m.pct)} % : ajoute ${m.suggestion}.`);
  }
  if (recommendations.length === 0) {
    recommendations.push('Macros et micronutriments dans les clous sur la période — rien à signaler.');
  }

  res.json({
    range,
    daysInRange: dates.length,
    daysLogged: n,
    loggedDates: dayResults.map((d) => d.date),
    referenceWeightKg,
    calories: {
      avgConsumed: avgConsumedKcal,
      avgTarget: avgTargetKcal,
      avgDiff,
      avgDiffPct,
      cumulativeDeficit,
      theoreticalWeightLossKg,
      daily: dailyAll,
      daysUnder2000,
    },
    macros,
    micros,
    microSources,
    weightEvolution: weightEvolutionForRange(req.userId, dates),
    insights,
    reliabilityWarning:
      n / dates.length < 0.7
        ? `Moyenne calculée sur ${n} jour${n > 1 ? 's' : ''} sur ${dates.length} — fiabilité limitée.`
        : null,
    recommendations: recommendations.slice(0, 5),
  });
});

// "Semaine en cours" / "Semaine passée": Monday-Sunday calendar week (not a rolling 7 days).
// Weekly objectives use targets valid AT THE TIME for a past week (profileAsOf/weightAsOf), so
// changing your profile today doesn't retroactively change last week's verdicts.
app.get('/api/week-report', (req, res) => {
  const period = ['past', 'month', 'quarter'].includes(req.query.period) ? req.query.period : 'current';
  const dates =
    period === 'month'
      ? previousCalendarMonthDates()
      : period === 'quarter'
        ? previousCalendarQuarterDates()
        : calendarWeekDates(period === 'past' ? -1 : 0);
  const referenceDate = dates[dates.length - 1];
  const isCompletedPeriod = period !== 'current';
  const profile = isCompletedPeriod ? profileAsOf(req.userId, referenceDate) : getProfile(req.userId);
  const referenceWeightKg = isCompletedPeriod ? weightAsOf(req.userId, referenceDate) : profile.weight_kg || 100;

  const dayResults = [];
  const allLogs = [];
  for (const date of dates) {
    const logs = db.prepare('SELECT * FROM food_logs WHERE user_id = ? AND date = ?').all(req.userId, date);
    if (logs.length === 0) continue;
    const summary = computeSummary(req.userId, date, isCompletedPeriod ? profileAsOf(req.userId, date) : undefined);
    const totals = logs.reduce((acc, l) => {
      acc.kcal += l.kcal;
      acc.protein += l.protein;
      acc.carbs += l.carbs;
      acc.fat += l.fat;
      for (const key of NUTRIENT_KEYS) acc[key] += l[key] || 0;
      return acc;
    }, EMPTY_TOTALS());
    dayResults.push({ date, consumed: totals, target: summary.targetIntake, activitiesKcal: summary.activitiesKcal });
    allLogs.push(...logs);
  }

  const n = dayResults.length;
  const daysInRange = dates.length;

  if (n === 0) {
    return res.json({ period, daysInRange, daysLogged: 0, insufficientData: true });
  }

  // Daily-goal nutrients (fiber, potassium, magnesium, calcium, vitamin C, zinc, iron) shown as
  // a period average against their daily reference — same nutrients as the "Objectifs du jour"
  // section of the Aujourd'hui report, just averaged instead of a single day's value.
  const dailyAverageMicros = NUTRIENT_KEYS.filter((k) => MICRO_REFERENCE[k] && hasDailyGoal(k) && MICRO_REFERENCE[k].kind !== 'limit').map((key) => {
    const ref = MICRO_REFERENCE[key];
    const avgConsumed = dayResults.reduce((s, d) => s + (d.consumed[key] || 0), 0) / n;
    return {
      key,
      label: ref.label,
      unit: ref.unit,
      consumed: avgConsumed,
      target: ref.reference,
      pct: (avgConsumed / ref.reference) * 100,
    };
  });

  // Limits (sodium, caffeine) averaged over the period — inverted logic, over = bad.
  const limitAverages = Object.entries(MICRO_REFERENCE)
    .filter(([, ref]) => ref.kind === 'limit')
    .map(([key, ref]) => {
      const avgConsumed = dayResults.reduce((s, d) => s + (d.consumed[key] || 0), 0) / n;
      return {
        key,
        label: ref.label,
        unit: ref.unit,
        consumed: avgConsumed,
        reference: ref.reference,
        pct: (avgConsumed / ref.reference) * 100,
        over: avgConsumed > ref.reference,
      };
    });

  // Weekly objectives: only the nutrients with no meaningful daily target (dailyGoal: false) —
  // the whole point is "did you get enough of this OVER a week", so a target = daily ref × 7.
  // Bucketed by calendar week (see weekBuckets): for "Semaine en cours"/"Semaine passée" that's
  // a single bucket (sum = the whole period, same as before); for "Mois passé" it's ~4-5 weeks,
  // averaged — a week hitting 10/12/15/17 across the month averages to ~13.5, not summed to 54.
  // Met = green checkmark, "no need to eat more of this this week/month" — the key ask here.
  const buckets = weekBuckets(dates);
  const weeklyObjectives = NUTRIENT_KEYS.filter((k) => MICRO_REFERENCE[k] && !hasDailyGoal(k)).map((key) => {
    const ref = MICRO_REFERENCE[key];
    const weeklyTarget = ref.reference * 7;
    const bucketSums = buckets.map((bucketDates) => {
      const bucketDateSet = new Set(bucketDates);
      return allLogs.filter((l) => bucketDateSet.has(l.date)).reduce((s, l) => s + (l[key] || 0), 0);
    });
    const avgWeeklyConsumed = bucketSums.reduce((s, v) => s + v, 0) / bucketSums.length;
    return {
      key,
      label: ref.label,
      unit: ref.unit,
      consumed: avgWeeklyConsumed,
      target: weeklyTarget,
      pct: (avgWeeklyConsumed / weeklyTarget) * 100,
      met: avgWeeklyConsumed >= weeklyTarget,
    };
  });

  // Same bucket-averaging for plant diversity: a month's "X/30" is the average of each week's
  // count, not the count of distinct plants across the whole month (which would trivially climb
  // past 30 given enough weeks and isn't comparable to the weekly target).
  const bucketPlantCounts = buckets.map((bucketDates) => microbiomeSummaryForWeek(req.userId, bucketDates).plantCount);
  const plantCount = Math.round(bucketPlantCounts.reduce((s, v) => s + v, 0) / bucketPlantCounts.length);
  const { plantList } = microbiomeSummaryForWeek(req.userId, dates);
  const catalogPlants = db
    .prepare("SELECT DISTINCT plant_name FROM foods WHERE user_id = ? AND plant_name IS NOT NULL AND plant_name != ''")
    .all(req.userId)
    .map((r) => r.plant_name);
  const plantSuggestions = catalogPlants.filter((p) => !plantList.includes(p)).slice(0, 5);
  const fermentedTotal = allLogs.filter((l) => l.is_fermented).length;
  const fermentedFoods = [...new Set(allLogs.filter((l) => l.is_fermented).map((l) => l.label))];
  const prebioticSources = [...new Set(allLogs.filter((l) => l.is_prebiotic).map((l) => l.label))];
  const polyphenolSources = [...new Set(allLogs.filter((l) => l.is_polyphenol).map((l) => l.label))];

  // Reused both for the insights builder below and exposed directly so any nutrient row on the
  // page can show "d'où ça vient" on click.
  const microSources = buildMicroSources(allLogs, n);

  // Average calorie deficit/surplus across logged days, and the weight change over the period
  // (first vs last day, falling back to the profile's weight if nothing was logged that day) —
  // the two headline tiles at the top of the week/month report.
  const avgDeficitKcal = dayResults.reduce((s, d) => s + (d.target - d.consumed.kcal), 0) / n;
  const totalDeficitKcal = dayResults.reduce((s, d) => s + (d.target - d.consumed.kcal), 0);
  const avgActivitiesKcal = dayResults.reduce((s, d) => s + d.activitiesKcal, 0) / n;
  const weightStartKg = weightAsOf(req.userId, dates[0]);
  const weightEndKg = weightAsOf(req.userId, referenceDate);

  // Only meaningful once the period is over — the frontend only renders this for period=past
  // and period=month — but cheap enough to always compute rather than branch the route.
  const combinedMicros = [
    ...dailyAverageMicros.map((m) => ({ ...m, kind: 'floor' })),
    ...weeklyObjectives.map((m) => ({ ...m, kind: 'floor' })),
    ...limitAverages.map((m) => ({ ...m, kind: 'limit' })),
  ];
  const insights = buildImprovementInsights(combinedMicros, microSources);

  res.json({
    period,
    daysInRange,
    daysLogged: n,
    // Ratio-based so it scales from a 7-day week to a ~30-day month instead of a fixed "<5 days"
    // threshold that would barely ever fire across a whole month.
    lowCoverageWarning:
      daysInRange >= 5 && n / daysInRange < 0.5
        ? `Seulement ${n} jour(s) sur ${daysInRange} renseigné(s).`
        : null,
    referenceWeightKg,
    avgDeficitKcal,
    totalDeficitKcal,
    avgActivitiesKcal,
    weightStartKg,
    weightEndKg,
    weightDeltaKg: weightEndKg - weightStartKg,
    // Only sent when short enough to draw as a daily bar chart (a week, not a month/quarter).
    dayResults: daysInRange <= 7 ? dayResults.map((d) => ({ date: d.date, consumedKcal: d.consumed.kcal, targetKcal: d.target })) : null,
    dailyAverageMicros,
    limitAverages,
    weeklyObjectives,
    insights,
    microSources,
    microbiote: {
      plantCount,
      plantTarget: 30,
      plantList,
      plantSuggestions,
      fermentedAvgPerDay: fermentedTotal / n,
      fermentedFoods,
      prebioticSources,
      polyphenolSources,
    },
  });
});

// --- Weight tracking ---
const WEIGHT_RANGES = ['7', '14', '30', '60', '90', 'week'];

app.get('/api/weight-logs', (req, res) => {
  const range = WEIGHT_RANGES.includes(req.query.range) ? req.query.range : '30';
  const dates = rangeDates(range);
  const rows = db
    .prepare(
      `SELECT * FROM weight_logs WHERE user_id = ? AND date IN (${dates.map(() => '?').join(',')}) ORDER BY date`
    )
    .all(req.userId, ...dates);
  res.json(rows);
});

app.post('/api/weight-logs', (req, res) => {
  const { date, weight_kg, body_fat_pct, waist_cm } = req.body;
  if (!weight_kg || weight_kg <= 0) {
    return res.status(400).json({ error: 'weight_kg requis' });
  }
  const finalDate = date || todayStr();
  // COALESCE so re-saving weight alone for a date that already has body_fat_pct/waist_cm
  // doesn't blank them out — only a non-empty submitted value overwrites the stored one.
  db.prepare(
    `INSERT INTO weight_logs (user_id, date, weight_kg, body_fat_pct, waist_cm) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET weight_kg = excluded.weight_kg,
       body_fat_pct = COALESCE(excluded.body_fat_pct, weight_logs.body_fat_pct),
       waist_cm = COALESCE(excluded.waist_cm, weight_logs.waist_cm)`
  ).run(
    req.userId,
    finalDate,
    Number(weight_kg),
    body_fat_pct !== undefined && body_fat_pct !== '' ? Number(body_fat_pct) : null,
    waist_cm !== undefined && waist_cm !== '' ? Number(waist_cm) : null
  );
  const row = db.prepare('SELECT * FROM weight_logs WHERE user_id = ? AND date = ?').get(req.userId, finalDate);
  res.status(201).json(row);
});

app.delete('/api/weight-logs/:id', (req, res) => {
  db.prepare('DELETE FROM weight_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).end();
});

// Builds min/max/avg/delta/weeklyRate + a chart series for one metric field, skipping
// dates where that particular metric wasn't logged (e.g. weight logged daily, body fat weekly).
function metricStats(rows, field) {
  const points = rows.filter((r) => r[field] !== null && r[field] !== undefined);
  if (points.length < 2) return null;

  const first = points[0][field];
  const last = points[points.length - 1][field];
  const delta = last - first;
  const min = Math.min(...points.map((p) => p[field]));
  const max = Math.max(...points.map((p) => p[field]));
  const avg = points.reduce((s, p) => s + p[field], 0) / points.length;
  const spanDays =
    (new Date(`${points[points.length - 1].date}T00:00:00Z`) - new Date(`${points[0].date}T00:00:00Z`)) /
    86400000;
  const weeklyRate = spanDays > 0 ? delta / (spanDays / 7) : 0;

  return {
    first,
    last,
    delta,
    min,
    max,
    avg,
    weeklyRate,
    series: points.map((p) => ({ date: p.date, value: p[field] })),
  };
}

app.get('/api/weight-report', (req, res) => {
  const range = WEIGHT_RANGES.includes(req.query.range) ? req.query.range : '30';
  const dates = rangeDates(range);
  const rows = db
    .prepare(
      `SELECT date, weight_kg, body_fat_pct, waist_cm FROM weight_logs
       WHERE user_id = ? AND date IN (${dates.map(() => '?').join(',')}) ORDER BY date`
    )
    .all(req.userId, ...dates);

  const weight = metricStats(rows, 'weight_kg');

  // "Poids perdu" grid on the dedicated weight-report screen shows every fixed window
  // (7/14/30/60/90 days) side by side, not just whichever one is currently selected for the
  // chart above — computed here from one all-time fetch instead of five separate requests.
  const allRows = db.prepare('SELECT date, weight_kg FROM weight_logs WHERE user_id = ? ORDER BY date').all(req.userId);
  const statsForWindow = (days) => {
    const windowDates = new Set(rangeDates(String(days)));
    return metricStats(allRows.filter((r) => windowDates.has(r.date)), 'weight_kg');
  };
  const allTime = metricStats(allRows, 'weight_kg');
  const weightLoss = {
    d7: statsForWindow(7)?.delta ?? null,
    d14: statsForWindow(14)?.delta ?? null,
    d30: statsForWindow(30)?.delta ?? null,
    d60: statsForWindow(60)?.delta ?? null,
    d90: statsForWindow(90)?.delta ?? null,
    total: allTime?.delta ?? null,
  };

  if (!weight) {
    return res.json({
      range,
      insufficientData: true,
      daysLogged: rows.length,
      daysInRange: dates.length,
      weightLoss,
      weightStart: allTime?.first ?? null,
      weightCurrent: allTime?.last ?? null,
    });
  }

  res.json({
    range,
    insufficientData: false,
    daysLogged: rows.length,
    daysInRange: dates.length,
    weight,
    bodyFat: metricStats(rows, 'body_fat_pct'),
    waist: metricStats(rows, 'waist_cm'),
    weightLoss,
    weightStart: allTime?.first ?? null,
    weightCurrent: allTime?.last ?? null,
  });
});

app.get('/api/weight-photos', (req, res) => {
  const range = WEIGHT_RANGES.includes(req.query.range) ? req.query.range : '30';
  const dates = rangeDates(range);
  const rows = db
    .prepare(
      `SELECT * FROM weight_photos WHERE user_id = ? AND date IN (${dates.map(() => '?').join(',')}) ORDER BY date DESC, id DESC`
    )
    .all(req.userId, ...dates);
  res.json(rows.map((r) => ({ ...r, url: `/uploads/weight-photos/${r.filename}` })));
});

const PHOTO_ANGLES = ['front', 'back', 'side'];

app.post('/api/weight-photos', uploadWeightPhotos.array('photos', 20), (req, res) => {
  const date = req.body.date || todayStr();
  const angle = PHOTO_ANGLES.includes(req.body.angle) ? req.body.angle : 'front';
  const insert = db.prepare('INSERT INTO weight_photos (user_id, date, filename, angle) VALUES (?, ?, ?, ?)');
  const rows = (req.files || []).map((file) => {
    const result = insert.run(req.userId, date, file.filename, angle);
    return {
      id: result.lastInsertRowid,
      date,
      filename: file.filename,
      angle,
      url: `/uploads/weight-photos/${file.filename}`,
    };
  });
  res.status(201).json(rows);
});

app.delete('/api/weight-photos/:id', (req, res) => {
  const photo = db.prepare('SELECT * FROM weight_photos WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (photo) {
    fs.unlink(path.join(WEIGHT_PHOTOS_DIR, photo.filename), () => {});
    db.prepare('DELETE FROM weight_photos WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  }
  res.status(204).end();
});

// --- Weekly meal plan (day-of-week template, not tied to a real calendar date) ---
const PLAN_DAYS = [
  { key: 'mon', label: 'Lundi' },
  { key: 'tue', label: 'Mardi' },
  { key: 'wed', label: 'Mercredi' },
  { key: 'thu', label: 'Jeudi' },
  { key: 'fri', label: 'Vendredi' },
  { key: 'sat', label: 'Samedi' },
  { key: 'sun', label: 'Dimanche' },
];

function macrosForSource(userId, source_type, source_id, quantity) {
  const qty = Number(quantity) || 1;
  if (source_type === 'food') {
    const food = db.prepare('SELECT * FROM foods WHERE id = ? AND user_id = ?').get(source_id, userId);
    if (!food) return null;
    const factor = qty / 100;
    return {
      label: food.name,
      kcal: food.kcal_per_100g * factor,
      protein: food.protein_per_100g * factor,
      carbs: food.carbs_per_100g * factor,
      fat: food.fat_per_100g * factor,
    };
  }
  if (source_type === 'recipe') {
    const perPortion = recipeMacrosPerPortion(userId, source_id);
    if (!perPortion) return null;
    return {
      label: perPortion.title,
      kcal: perPortion.kcal * qty,
      protein: perPortion.protein * qty,
      carbs: perPortion.carbs * qty,
      fat: perPortion.fat * qty,
    };
  }
  return null;
}

// Conflict target includes source_type/source_id (not just day+meal) so a meal slot can hold
// several distinct items (e.g. yogurt + a fruit) — re-picking the SAME item just updates it.
const upsertPlanEntry = () =>
  db.prepare(
    `INSERT INTO meal_plan_entries (user_id, day, meal, source_type, source_id, label, quantity, kcal, protein, carbs, fat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, day, meal, source_type, source_id) DO UPDATE SET
       label = excluded.label, quantity = excluded.quantity,
       kcal = excluded.kcal, protein = excluded.protein, carbs = excluded.carbs, fat = excluded.fat`
  );

app.get('/api/meal-plan', (req, res) => {
  const rows = db.prepare('SELECT * FROM meal_plan_entries WHERE user_id = ?').all(req.userId);
  const planSummary = computeSummary(req.userId, todayStr());
  const targetIntake = planSummary.targetIntake;
  const dayMacroTargets = computeMacroTargets(targetIntake, planSummary.profile);
  const meals = mealsFor(planSummary.profile).map((m) => ({
    key: m.key,
    label: m.label,
    budgetKcal: targetIntake * m.share,
    macroTargets: {
      carbs: dayMacroTargets.carbs * m.share,
      protein: dayMacroTargets.protein * m.share,
      fat: dayMacroTargets.fat * m.share,
    },
  }));
  res.json({ days: PLAN_DAYS, meals, entries: rows, targetIntake });
});

// Wipes the whole week's plan in one go, EXCEPT recurring meals (same day/meal/source on all 7
// days — a stable routine, not a one-off plan to discard) which are left untouched. Also cleans
// up today's Journal for whatever's actually removed, same as deleting a single entry below.
app.delete('/api/meal-plan', (req, res) => {
  const allEntries = db.prepare('SELECT * FROM meal_plan_entries WHERE user_id = ?').all(req.userId);

  const recurringKeysByMeal = new Map();
  for (const meal of new Set(allEntries.map((e) => e.meal))) {
    const perDay = PLAN_DAYS.map((d) => allEntries.filter((e) => e.day === d.key && e.meal === meal));
    if (perDay.some((list) => list.length === 0)) continue;
    const [first, ...rest] = perDay;
    const recurring = first.filter((item) =>
      rest.every((dayItems) => dayItems.some((e) => e.source_type === item.source_type && e.source_id === item.source_id))
    );
    recurringKeysByMeal.set(meal, new Set(recurring.map((r) => `${r.source_type}-${r.source_id}`)));
  }

  const today = todayStr();
  const todayPlanDay = WEEKDAY_TO_PLAN_DAY[new Date(`${today}T00:00:00Z`).getUTCDay()];
  const toDelete = allEntries.filter((e) => !recurringKeysByMeal.get(e.meal)?.has(`${e.source_type}-${e.source_id}`));

  for (const entry of toDelete) {
    if (entry.day === todayPlanDay) {
      const logSourceType = entry.source_type === 'recipe' ? 'recipe_ingredient' : entry.source_type;
      db.prepare(
        'DELETE FROM food_logs WHERE user_id = ? AND date = ? AND meal = ? AND source_type = ? AND source_id = ?'
      ).run(req.userId, today, entry.meal, logSourceType, entry.source_id);
    }
    db.prepare('DELETE FROM meal_plan_entries WHERE id = ?').run(entry.id);
  }

  res.status(204).end();
});

app.post('/api/meal-plan/entry', (req, res) => {
  const { day, meal, source_type, source_id, quantity } = req.body;
  if (!PLAN_DAYS.some((d) => d.key === day)) return res.status(400).json({ error: 'day invalide' });
  if (!mealsFor(getProfile(req.userId)).some((m) => m.key === meal)) return res.status(400).json({ error: 'meal invalide' });
  const macros = macrosForSource(req.userId, source_type, source_id, quantity);
  if (!macros) return res.status(404).json({ error: 'aliment/recette introuvable' });

  upsertPlanEntry().run(
    req.userId, day, meal, source_type, source_id, macros.label, Number(quantity) || 1,
    macros.kcal, macros.protein, macros.carbs, macros.fat
  );

  const row = db
    .prepare('SELECT * FROM meal_plan_entries WHERE user_id = ? AND day = ? AND meal = ? AND source_type = ? AND source_id = ?')
    .get(req.userId, day, meal, source_type, source_id);
  res.status(201).json(row);
});

app.post('/api/meal-plan/apply-all', (req, res) => {
  const { meal, source_type, source_id, quantity } = req.body;
  if (!mealsFor(getProfile(req.userId)).some((m) => m.key === meal)) return res.status(400).json({ error: 'meal invalide' });
  const macros = macrosForSource(req.userId, source_type, source_id, quantity);
  if (!macros) return res.status(404).json({ error: 'aliment/recette introuvable' });

  const upsert = upsertPlanEntry();
  for (const d of PLAN_DAYS) {
    upsert.run(
      req.userId, d.key, meal, source_type, source_id, macros.label, Number(quantity) || 1,
      macros.kcal, macros.protein, macros.carbs, macros.fat
    );
  }
  res.json(db.prepare('SELECT * FROM meal_plan_entries WHERE user_id = ? AND meal = ?').all(req.userId, meal));
});

app.delete('/api/meal-plan/entry/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM meal_plan_entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  db.prepare('DELETE FROM meal_plan_entries WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);

  // If this was today's planned entry, also clear its reflection in the Journal — the daily
  // auto-apply (apply-to-journal) may have already logged it, and changing your mind about a
  // plan entry should mean it's gone from today's Journal too, not just from future days.
  if (entry) {
    const today = todayStr();
    const todayPlanDay = WEEKDAY_TO_PLAN_DAY[new Date(`${today}T00:00:00Z`).getUTCDay()];
    if (entry.day === todayPlanDay) {
      const logSourceType = entry.source_type === 'recipe' ? 'recipe_ingredient' : entry.source_type;
      db.prepare(
        'DELETE FROM food_logs WHERE user_id = ? AND date = ? AND meal = ? AND source_type = ? AND source_id = ?'
      ).run(req.userId, today, entry.meal, logSourceType, entry.source_id);
    }
  }

  res.status(204).end();
});

// Un-marks a food/recipe as recurring for a meal — the inverse of apply-all, which is how
// something becomes recurring in the first place (one row per day, every day of the week).
app.delete('/api/meal-plan/by-source', (req, res) => {
  const { meal, source_type, source_id } = req.query;
  if (!mealsFor(getProfile(req.userId)).some((m) => m.key === meal)) return res.status(400).json({ error: 'meal invalide' });
  db.prepare('DELETE FROM meal_plan_entries WHERE user_id = ? AND meal = ? AND source_type = ? AND source_id = ?').run(
    req.userId,
    meal,
    source_type,
    source_id
  );
  res.status(204).end();
});

// Turns a recipe or food into a common shape for macro-ratio matching: kcal/protein/carbs/fat
// "per unit" (per portion for a recipe, per 100g for a food) plus the unit each is quantified in.
function toMatchItem(userId, source_type, source_id) {
  if (source_type === 'recipe') {
    const p = recipeMacrosPerPortion(userId, source_id);
    if (!p || p.kcal <= 0) return null;
    return { source_type, source_id, label: p.title, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat };
  }
  if (source_type === 'food') {
    const food = db.prepare('SELECT * FROM foods WHERE id = ? AND user_id = ?').get(source_id, userId);
    if (!food || food.kcal_per_100g <= 0) return null;
    return {
      source_type, source_id, label: food.name, kcal: food.kcal_per_100g,
      protein: food.protein_per_100g, carbs: food.carbs_per_100g, fat: food.fat_per_100g,
    };
  }
  return null;
}

// Picks whichever candidate's macro RATIO (protein/carbs/fat as a share of its own kcal) is
// closest to the target ratio. The caller then scales quantity to hit the kcal target exactly,
// so matching the ratio (not the absolute grams) is what makes the scaled-up macros land close too.
// `usageCounts` (key -> times already used for this meal earlier in the same week-generation run)
// keeps any single dish capped at `maxRepeats` occurrences per week instead of collapsing onto
// the single best-scoring match every day.
function pickBestMatch(items, macroTargets, kcalTarget, usageCounts = new Map(), maxRepeats = 2) {
  const targetShares = {
    protein: (macroTargets.protein * 4) / kcalTarget,
    carbs: (macroTargets.carbs * 4) / kcalTarget,
    fat: (macroTargets.fat * 9) / kcalTarget,
  };
  const scored = [];
  for (const item of items) {
    if (!item) continue;
    const pShare = (item.protein * 4) / item.kcal;
    const cShare = (item.carbs * 4) / item.kcal;
    const fShare = (item.fat * 9) / item.kcal;
    const score =
      (pShare - targetShares.protein) ** 2 + (cShare - targetShares.carbs) ** 2 + (fShare - targetShares.fat) ** 2;
    scored.push({ item, score });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => a.score - b.score);

  const underCap = scored.filter(
    (s) => (usageCounts.get(`${s.item.source_type}:${s.item.source_id}`) || 0) < maxRepeats
  );
  const pool = underCap.length > 0 ? underCap : scored;
  // Pick randomly among the closest few matches (not always the single top one) for variety.
  const topN = pool.slice(0, Math.min(3, pool.length));
  return topN[Math.floor(Math.random() * topN.length)].item;
}

app.post('/api/meal-plan/generate', async (req, res) => {
  const {
    day,
    meal,
    mode, // 'ai' (default) | 'library' | 'favorites'
    targetIntake: targetIntakeOverride,
    proteinTarget,
    carbsTarget,
    fatTarget,
    excludeIds, // ["recipe:12", "food:3", ...] already used for this meal earlier this run
    avoidTitles, // recipe titles already generated for this meal earlier this run (AI mode)
  } = req.body;
  if (!PLAN_DAYS.some((d) => d.key === day)) {
    return res.status(400).json({ error: 'day/meal invalide' });
  }

  try {
    const genSummary = computeSummary(req.userId, todayStr());
    const mealDef = mealsFor(genSummary.profile).find((m) => m.key === meal);
    if (!mealDef) return res.status(400).json({ error: 'day/meal invalide' });
    const targetIntake = Number(targetIntakeOverride) || genSummary.targetIntake;
    // Custom daily protein/carbs/fat (grams) override the automatic 30/35/35% split when provided.
    const autoMacros = computeMacroTargets(targetIntake, genSummary.profile);
    const dayMacroTargets = {
      protein: Number(proteinTarget) || autoMacros.protein,
      carbs: Number(carbsTarget) || autoMacros.carbs,
      fat: Number(fatTarget) || autoMacros.fat,
    };
    const genMealShare = mealDef.share;
    const kcalTarget = targetIntake * genMealShare;
    const macroTargets = {
      protein: dayMacroTargets.protein * genMealShare,
      carbs: dayMacroTargets.carbs * genMealShare,
      fat: dayMacroTargets.fat * genMealShare,
    };

    if (mode === 'library' || mode === 'favorites') {
      // A snack is normally 1-2 simple foods, not a full composed dish — restrict the pool to
      // standalone foods rather than recipes (favorites are the user's own call, left as-is).
      const restrictToFoods = mode === 'library' && meal.startsWith('snack');
      // The recipe library is mostly lunch/dinner-style dishes with no inherent "breakfast"
      // tag, so pure macro-ratio matching can hand breakfast a chili con carne. Only consider
      // recipes the user has actually favorited for breakfast; plain foods are always fine.
      const breakfastFavRecipeIds =
        mode === 'library' && meal === 'breakfast'
          ? new Set(
              db
                .prepare("SELECT source_id FROM meal_favorites WHERE user_id = ? AND meal = 'breakfast' AND source_type = 'recipe'")
                .all(req.userId)
                .map((r) => r.source_id)
            )
          : null;
      const candidates =
        mode === 'favorites'
          ? db
              .prepare('SELECT source_type, source_id FROM meal_favorites WHERE user_id = ? AND meal = ?')
              .all(req.userId, meal)
              .map((f) => toMatchItem(req.userId, f.source_type, f.source_id))
          : [
              ...(restrictToFoods
                ? []
                : db
                    .prepare('SELECT id FROM recipes WHERE user_id = ?')
                    .all(req.userId)
                    .filter((r) => !breakfastFavRecipeIds || breakfastFavRecipeIds.has(r.id))
                    .map((r) => toMatchItem(req.userId, 'recipe', r.id))),
              ...db.prepare('SELECT id FROM foods WHERE user_id = ?').all(req.userId).map((f) => toMatchItem(req.userId, 'food', f.id)),
            ];

      const usageCounts = new Map();
      for (const key of excludeIds || []) usageCounts.set(key, (usageCounts.get(key) || 0) + 1);
      // Cap repeats at 2/week for lunch & dinner; other meals just prefer not repeating at all
      // (cap of 1) unless the candidate pool is too small to avoid it.
      const maxRepeats = meal === 'lunch' || meal === 'dinner' ? 2 : 1;

      // Reject candidates whose kcal density would force an unrealistic serving to hit the
      // target (e.g. ~1L of almond milk for a 150 kcal snack) — a bad match is still bad even
      // if its macro ratio scores well.
      const gramsBounds = meal === 'snack' ? [10, 250] : [10, 500];
      const portionBounds = [0.3, 3];
      const plausible = candidates.filter((item) => {
        if (!item) return false;
        if (item.source_type === 'food') {
          const grams = (kcalTarget / item.kcal) * 100;
          return grams >= gramsBounds[0] && grams <= gramsBounds[1];
        }
        const portions = kcalTarget / item.kcal;
        return portions >= portionBounds[0] && portions <= portionBounds[1];
      });

      const best = pickBestMatch(plausible.length > 0 ? plausible : candidates, macroTargets, kcalTarget, usageCounts, maxRepeats);
      if (!best) {
        const poolName = mode === 'favorites' ? 'favoris pour ce repas' : 'recettes/aliments';
        return res.status(404).json({ error: `Aucun(e) ${poolName} disponible.` });
      }

      // Scale the quantity so this entry's kcal lands exactly on the target, regardless of
      // whether the match was a recipe (quantity = portions) or a food (quantity = grams).
      const quantity =
        best.source_type === 'recipe' ? kcalTarget / best.kcal : (kcalTarget / best.kcal) * 100;
      const macros = macrosForSource(req.userId, best.source_type, best.source_id, quantity);

      upsertPlanEntry().run(
        req.userId, day, meal, best.source_type, best.source_id, macros.label, quantity,
        macros.kcal, macros.protein, macros.carbs, macros.fat
      );

      const entryRow = db
        .prepare('SELECT * FROM meal_plan_entries WHERE user_id = ? AND day = ? AND meal = ? AND source_type = ? AND source_id = ?')
        .get(req.userId, day, meal, best.source_type, best.source_id);
      return res.status(201).json({ entry: entryRow, recipe: null });
    }

    const recipe = await generateRecipeForTarget(mealDef.label, kcalTarget, macroTargets, avoidTitles || []);

    const result = db
      .prepare(
        `INSERT INTO recipes (user_id, title, description, image, portions, ingredients, steps)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.userId,
        recipe.titre,
        recipe.description,
        recipe.image,
        recipe.portions || 1,
        JSON.stringify(recipe.ingredients),
        JSON.stringify(recipe.etapes)
      );

    const recipeRow = db.prepare('SELECT * FROM recipes WHERE id = ?').get(result.lastInsertRowid);
    const perPortion = recipeMacrosPerPortion(req.userId, result.lastInsertRowid);

    // Scale quantity (fractional portions) so the logged kcal lands exactly on kcalTarget,
    // even though the AI's estimate for "1 portion" is rarely spot on.
    const quantity = perPortion.kcal > 0 ? kcalTarget / perPortion.kcal : 1;
    const macros = macrosForSource(req.userId, 'recipe', result.lastInsertRowid, quantity);

    upsertPlanEntry().run(
      req.userId, day, meal, 'recipe', result.lastInsertRowid, macros.label, quantity,
      macros.kcal, macros.protein, macros.carbs, macros.fat
    );

    const entryRow = db
      .prepare('SELECT * FROM meal_plan_entries WHERE user_id = ? AND day = ? AND meal = ? AND source_type = ? AND source_id = ?')
      .get(req.userId, day, meal, 'recipe', result.lastInsertRowid);
    res.status(201).json({ entry: entryRow, recipe: serializeRecipe(recipeRow) });
  } catch (err) {
    res.status(422).json({ error: err.message || "Échec de la génération" });
  }
});

const WEEKDAY_TO_PLAN_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

app.post('/api/meal-plan/apply-to-journal', (req, res) => {
  const date = req.body.date || todayStr();
  const planDay = WEEKDAY_TO_PLAN_DAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const planEntries = db.prepare('SELECT * FROM meal_plan_entries WHERE user_id = ? AND day = ?').all(req.userId, planDay);

  // Checked once up front (not per plan-entry) — a meal can now hold several items, and
  // logging the first one shouldn't make the check think the meal is "already logged" and
  // skip the rest.
  const alreadyLoggedMeals = new Set(
    db.prepare('SELECT DISTINCT meal FROM food_logs WHERE user_id = ? AND date = ?').all(req.userId, date).map((r) => r.meal)
  );
  // Once a meal has been handled for this date (applied, or already had entries), it's
  // remembered here for good — otherwise deleting the last logged entry of a recurring meal
  // would make food_logs look "empty" again and the plan would silently reapply it.
  const alreadyAppliedMeals = new Set(
    db.prepare('SELECT meal FROM meal_plan_applied WHERE user_id = ? AND date = ?').all(req.userId, date).map((r) => r.meal)
  );
  const markApplied = db.prepare('INSERT OR IGNORE INTO meal_plan_applied (user_id, date, meal) VALUES (?, ?, ?)');
  for (const meal of new Set(planEntries.map((e) => e.meal))) {
    markApplied.run(req.userId, date, meal);
  }

  const added = [];
  const skipped = [];
  for (const entry of planEntries) {
    if (alreadyLoggedMeals.has(entry.meal) || alreadyAppliedMeals.has(entry.meal)) {
      skipped.push(entry.meal);
      continue;
    }
    try {
      const rows = insertFoodLog(req.userId, date, entry.meal, entry.source_type, entry.source_id, entry.quantity);
      added.push(...rows);
    } catch {
      skipped.push(entry.meal);
    }
  }

  res.json({ date, planDay, added, skipped });
});

// Classifies every food/recipe-ingredient still missing microbiome fields (plant_name,
// is_fermented, is_prebiotic, is_polyphenol). Foods use the `microbiome_classified` flag (0/1);
// recipe ingredients use the presence of the `plant_name` key on the ingredient object itself,
// since they live in a JSON blob rather than DB columns.
async function classifyMissingMicrobiome(userId) {
  let foodsUpdated = 0;
  let recipesUpdated = 0;

  const unclassifiedFoods = db.prepare('SELECT id, name FROM foods WHERE user_id = ? AND microbiome_classified = 0').all(userId);
  if (unclassifiedFoods.length > 0) {
    const results = await classifyFoodsBatch(unclassifiedFoods);
    const update = db.prepare(
      'UPDATE foods SET plant_name = ?, is_fermented = ?, is_prebiotic = ?, is_polyphenol = ?, microbiome_classified = 1 WHERE id = ?'
    );
    for (const food of unclassifiedFoods) {
      const row = results.get(food.id) || { plant_name: null, is_fermented: 0, is_prebiotic: 0, is_polyphenol: 0 };
      update.run(row.plant_name, row.is_fermented, row.is_prebiotic, row.is_polyphenol, food.id);
      foodsUpdated += 1;
    }
  }

  const recipes = db.prepare('SELECT id, ingredients FROM recipes WHERE user_id = ?').all(userId);
  const namesNeeded = new Set();
  const parsedRecipes = [];
  for (const r of recipes) {
    let ingredients;
    try {
      ingredients = JSON.parse(r.ingredients);
    } catch {
      continue;
    }
    const hasGap = ingredients.some((ing) => ing.plant_name === undefined);
    if (!hasGap) continue;
    parsedRecipes.push({ id: r.id, ingredients });
    for (const ing of ingredients) {
      if (ing.plant_name === undefined) namesNeeded.add(ing.nom);
    }
  }
  if (namesNeeded.size > 0) {
    const results = await classifyIngredientsBatch([...namesNeeded]);
    const updateRecipe = db.prepare('UPDATE recipes SET ingredients = ? WHERE id = ?');
    for (const r of parsedRecipes) {
      let changed = false;
      for (const ing of r.ingredients) {
        if (ing.plant_name === undefined) {
          const row = results.get(ing.nom) || { plant_name: null, is_fermented: 0, is_prebiotic: 0, is_polyphenol: 0 };
          ing.plant_name = row.plant_name;
          ing.is_fermented = row.is_fermented;
          ing.is_prebiotic = row.is_prebiotic;
          ing.is_polyphenol = row.is_polyphenol;
          changed = true;
        }
      }
      if (changed) {
        updateRecipe.run(JSON.stringify(r.ingredients), r.id);
        recipesUpdated += 1;
      }
    }
  }

  return { foodsUpdated, recipesUpdated };
}

app.post('/api/microbiome/classify', async (req, res) => {
  try {
    res.json(await classifyMissingMicrobiome(req.userId));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Runs the missing-micronutrient AI estimation once per calendar day per account (tracked in
// nutrient_estimation_runs, now keyed by user_id+date since each account's catalog is separate),
// instead of adding an AI call to every barcode scan.
async function runDailyNutrientEstimation() {
  const today = todayStr();
  const users = db.prepare('SELECT id FROM users').all();
  for (const { id: userId } of users) {
    const already = db.prepare('SELECT 1 FROM nutrient_estimation_runs WHERE user_id = ? AND date = ?').get(userId, today);
    if (already) continue;
    db.prepare('INSERT INTO nutrient_estimation_runs (user_id, date) VALUES (?, ?)').run(userId, today);
    try {
      const { updated } = await estimateMissingNutrients(db, userId, NUTRIENT_KEYS, INGREDIENT_NUTRIENT_FIELDS);
      console.log(`Nutrient estimation: updated ${updated} food(s) for user ${userId} on ${today}`);
    } catch (err) {
      console.error(`Nutrient estimation failed for user ${userId}:`, err.message);
    }
  }
}

// Same one-per-day-per-account guard as runDailyNutrientEstimation, for the microbiome
// classification batch.
async function runDailyMicrobiomeClassification() {
  const today = todayStr();
  const users = db.prepare('SELECT id FROM users').all();
  for (const { id: userId } of users) {
    const already = db.prepare('SELECT 1 FROM microbiome_classification_runs WHERE user_id = ? AND date = ?').get(userId, today);
    if (already) continue;
    db.prepare('INSERT INTO microbiome_classification_runs (user_id, date) VALUES (?, ?)').run(userId, today);
    try {
      const { foodsUpdated, recipesUpdated } = await classifyMissingMicrobiome(userId);
      console.log(`Microbiome classification: ${foodsUpdated} food(s), ${recipesUpdated} recipe(s) updated for user ${userId} on ${today}`);
    } catch (err) {
      console.error(`Microbiome classification failed for user ${userId}:`, err.message);
    }
  }
}

// In production there's no separate Vite dev server — this Express process serves the built
// React app directly, so the whole thing is one deployable service on one origin/port (no CORS,
// no separate frontend host to configure). The catch-all excludes /api and /uploads so it never
// shadows those routes; it must stay the LAST route registered.
if (IS_PROD) {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|uploads).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`FitTrack server listening on http://localhost:${PORT}`);
  runDailyNutrientEstimation();
  runDailyMicrobiomeClassification();
});
