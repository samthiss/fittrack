import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR points at a mounted persistent volume in production (e.g. Railway) so the database
// survives redeploys — the container filesystem itself is ephemeral and gets wiped otherwise.
const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'fittrack.sqlite'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Backing store for express-session (see auth.js) — sessions survive a server restart instead
  -- of living only in memory, and expired rows are swept lazily on lookup.
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    user_id INTEGER,
    expires INTEGER NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    bmr REAL NOT NULL DEFAULT 0,
    daily_movement_kcal REAL NOT NULL DEFAULT 0,
    digestion_kcal REAL NOT NULL DEFAULT 0,
    weight_kg REAL NOT NULL DEFAULT 70,
    goal TEXT NOT NULL DEFAULT 'lose',
    goal_kcal REAL NOT NULL DEFAULT 750
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    duration_minutes REAL NOT NULL,
    kcal REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Strength-training breakdown for one activity_logs row (e.g. "Développé couché · 4 séries ·
  -- 10 reps · 40kg"). Only meaningful for type='force' entries; cardio activities have none.
  -- Brand-new table, so user_id ships directly in the CREATE (older tables added it later via
  -- a backfill migration — see addUserIdColumn below — because they predate multi-tenancy).
  CREATE TABLE IF NOT EXISTS activity_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    activity_log_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sets INTEGER NOT NULL DEFAULT 3,
    reps INTEGER NOT NULL DEFAULT 10,
    weight_kg REAL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_settings (
    type TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    kcal_per_hour REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    image TEXT,
    portions REAL NOT NULL DEFAULT 1,
    ingredients TEXT NOT NULL,
    steps TEXT NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS foods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kcal_per_100g REAL NOT NULL,
    protein_per_100g REAL NOT NULL DEFAULT 0,
    carbs_per_100g REAL NOT NULL DEFAULT 0,
    fat_per_100g REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS food_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    quantity REAL NOT NULL,
    kcal REAL NOT NULL,
    protein REAL NOT NULL,
    carbs REAL NOT NULL,
    fat REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meal_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(meal, source_type, source_id)
  );

  CREATE TABLE IF NOT EXISTS weight_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    weight_kg REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS weight_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Weekly meal-plan template (day-of-week, not a real date): a meal slot can hold several
  -- dishes/foods (e.g. "yogurt + a fruit" for snack), reusable every week. Snapshot macros so
  -- editing a recipe later doesn't retroactively change a plan built from it, like food_logs.
  CREATE TABLE IF NOT EXISTS meal_plan_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    meal TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    kcal REAL NOT NULL,
    protein REAL NOT NULL,
    carbs REAL NOT NULL,
    fat REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(day, meal, source_type, source_id)
  );

  -- Tracks which (date, meal) slots have already had the plan auto-applied to the Journal, so
  -- deleting the last logged entry of a recurring meal doesn't make it silently reappear on the
  -- next refresh — "already handled today" is remembered independently of whether any food_logs
  -- rows currently exist for that meal.
  CREATE TABLE IF NOT EXISTS meal_plan_applied (
    date TEXT NOT NULL,
    meal TEXT NOT NULL,
    PRIMARY KEY (date, meal)
  );

  -- Each row is one 700ml serving logged for that day (tap "+ Ajouter" once per glass/bottle).
  CREATE TABLE IF NOT EXISTS water_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    amount_ml INTEGER NOT NULL DEFAULT 700,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- "Boisson énergisante" — one row per drink logged (café latte, Flexpresso, thé vert, matcha).
  -- Counts toward both water and the caffeine micronutrient, kept separate from food_logs since
  -- it's not tracked as food/macros. auto_linked_food_log_id marks a row that was auto-created
  -- because the "Flexpresso" food was spotted in today's breakfast (see apply-flexpresso-auto) —
  -- keeps that detection idempotent per food_log row.
  CREATE TABLE IF NOT EXISTS coffee_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'cafe_latte',
    caffeine_mg INTEGER NOT NULL DEFAULT 63,
    water_ml INTEGER NOT NULL DEFAULT 150,
    auto_linked_food_log_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Day-of-week template (like meal_plan_entries) for activities that repeat every week —
  -- e.g. "Course à pied" every mon/wed/fri, auto-logged into activity_logs on those days.
  CREATE TABLE IF NOT EXISTS activity_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    type TEXT NOT NULL,
    duration_minutes REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Tracks which activity_plan entries have already been auto-applied for a given date, so
  -- deleting today's auto-logged activity doesn't make it silently reappear on next refresh
  -- (same fix as meal_plan_applied).
  CREATE TABLE IF NOT EXISTS activity_plan_applied (
    date TEXT NOT NULL,
    activity_plan_id INTEGER NOT NULL,
    PRIMARY KEY (date, activity_plan_id)
  );

  -- Marks that the daily "estimate missing micronutrients" AI batch job already ran for a given
  -- date, so it fires once per day instead of on every request.
  CREATE TABLE IF NOT EXISTS nutrient_estimation_runs (
    date TEXT PRIMARY KEY
  );

  -- Same one-per-day guard as nutrient_estimation_runs, for the microbiome classification batch.
  CREATE TABLE IF NOT EXISTS microbiome_classification_runs (
    date TEXT PRIMARY KEY
  );

  -- Snapshot of the profile every time it's saved, so "Semaine passée" can judge against the
  -- targets that were actually in force that week instead of retroactively applying today's
  -- profile. One row per PUT /api/profile call (not one per day) — profileAsOf() in index.js
  -- picks the latest snapshot at or before a given date.
  CREATE TABLE IF NOT EXISTS profile_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    bmr REAL NOT NULL,
    daily_movement_kcal REAL NOT NULL,
    digestion_kcal REAL NOT NULL,
    weight_kg REAL NOT NULL,
    goal TEXT NOT NULL,
    goal_kcal REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const mealPlanColumns = db.prepare('PRAGMA table_info(meal_plan_entries)').all().map((c) => c.name);
if (!mealPlanColumns.includes('quantity')) {
  db.exec(`ALTER TABLE meal_plan_entries ADD COLUMN quantity REAL NOT NULL DEFAULT 1`);
}

// Older DBs have UNIQUE(day, meal) baked into the table, which caps each slot at one dish —
// rebuild onto UNIQUE(day, meal, source_type, source_id) so a meal can hold several items.
const mealPlanTableSql = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'meal_plan_entries'")
  .get();
if (mealPlanTableSql && /UNIQUE\s*\(\s*day\s*,\s*meal\s*\)/i.test(mealPlanTableSql.sql)) {
  db.exec(`
    CREATE TABLE meal_plan_entries_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      meal TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      kcal REAL NOT NULL,
      protein REAL NOT NULL,
      carbs REAL NOT NULL,
      fat REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(day, meal, source_type, source_id)
    );
    INSERT INTO meal_plan_entries_new
      (id, day, meal, source_type, source_id, label, quantity, kcal, protein, carbs, fat, created_at)
      SELECT id, day, meal, source_type, source_id, label, quantity, kcal, protein, carbs, fat, created_at
      FROM meal_plan_entries;
    DROP TABLE meal_plan_entries;
    ALTER TABLE meal_plan_entries_new RENAME TO meal_plan_entries;
  `);
}

const foodLogColumns = db.prepare('PRAGMA table_info(food_logs)').all();
if (!foodLogColumns.some((c) => c.name === 'meal')) {
  db.exec(`ALTER TABLE food_logs ADD COLUMN meal TEXT NOT NULL DEFAULT 'lunch'`);
}
// Logging a food in ml instead of g (e.g. milk, coffee) means "this was a drink" — its quantity
// then also counts toward the day's water total (see GET /api/water), on top of manual servings.
if (!foodLogColumns.some((c) => c.name === 'unit')) {
  db.exec(`ALTER TABLE food_logs ADD COLUMN unit TEXT NOT NULL DEFAULT 'g'`);
}

const recipeColumns = db.prepare('PRAGMA table_info(recipes)').all().map((c) => c.name);
if (!recipeColumns.includes('favorite')) {
  db.exec(`ALTER TABLE recipes ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0`);
}
if (!recipeColumns.includes('tags')) {
  db.exec(`ALTER TABLE recipes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`);
}

const weightLogColumns = db.prepare('PRAGMA table_info(weight_logs)').all().map((c) => c.name);
if (!weightLogColumns.includes('body_fat_pct')) {
  db.exec(`ALTER TABLE weight_logs ADD COLUMN body_fat_pct REAL`);
}
if (!weightLogColumns.includes('waist_cm')) {
  db.exec(`ALTER TABLE weight_logs ADD COLUMN waist_cm REAL`);
}

const weightPhotoColumns = db.prepare('PRAGMA table_info(weight_photos)').all().map((c) => c.name);
if (!weightPhotoColumns.includes('angle')) {
  db.exec(`ALTER TABLE weight_photos ADD COLUMN angle TEXT NOT NULL DEFAULT 'front'`);
}

// Micronutrients: fiber + 14 vitamins/minerals, added to both the food library (per 100g)
// and food_logs (snapshot at log time), matching the existing kcal/protein/carbs/fat pattern.
export const NUTRIENT_KEYS = [
  'fiber',
  'sodium',
  'potassium',
  'magnesium',
  'calcium',
  'zinc',
  'iron',
  'selenium',
  'iodine',
  'vitamin_c',
  'vitamin_a',
  'vitamin_d',
  'vitamin_e',
  'vitamin_k',
  'folate',
  'b12',
  'choline',
  'omega3',
  'caffeine',
];

const foodColumns = db.prepare('PRAGMA table_info(foods)').all().map((c) => c.name);
for (const key of NUTRIENT_KEYS) {
  const col = `${key}_per_100g`;
  if (!foodColumns.includes(col)) {
    db.exec(`ALTER TABLE foods ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`);
  }
}
// OFF category tag (e.g. "en:greek-yogurts") for foods created from a barcode scan — lets a new
// scan reuse an already-estimated micronutrient profile from another food in the same category
// instead of calling the AI again.
if (!foodColumns.includes('category')) {
  db.exec(`ALTER TABLE foods ADD COLUMN category TEXT NOT NULL DEFAULT ''`);
}

const foodLogColumns2 = db.prepare('PRAGMA table_info(food_logs)').all().map((c) => c.name);
for (const key of NUTRIENT_KEYS) {
  if (!foodLogColumns2.includes(key)) {
    db.exec(`ALTER TABLE food_logs ADD COLUMN ${key} REAL NOT NULL DEFAULT 0`);
  }
}

// Microbiome-relevant classification: plant_name is the canonical, distinct-species name used
// to dedupe the "30 plants/week" counter (e.g. "Brocoli" — two brands of the same vegetable
// count once, but "Brocoli" and "Chou-fleur" count separately). NULL means "not a plant".
// is_prebiotic/is_polyphenol are checked against the fixed lists in microbiomeClassification.js,
// not open-ended judgment — same table on both `foods` (current) and `food_logs` (snapshot at
// log time, so editing/deleting a food later doesn't retroactively change historical logs).
const foodColumns2 = db.prepare('PRAGMA table_info(foods)').all().map((c) => c.name);
if (!foodColumns2.includes('plant_name')) {
  db.exec(`ALTER TABLE foods ADD COLUMN plant_name TEXT`);
}
for (const col of ['is_fermented', 'is_prebiotic', 'is_polyphenol']) {
  if (!foodColumns2.includes(col)) {
    db.exec(`ALTER TABLE foods ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
  }
}
if (!foodColumns2.includes('microbiome_classified')) {
  db.exec(`ALTER TABLE foods ADD COLUMN microbiome_classified INTEGER NOT NULL DEFAULT 0`);
}

const foodLogColumns3 = db.prepare('PRAGMA table_info(food_logs)').all().map((c) => c.name);
if (!foodLogColumns3.includes('plant_name')) {
  db.exec(`ALTER TABLE food_logs ADD COLUMN plant_name TEXT`);
}
for (const col of ['is_fermented', 'is_prebiotic', 'is_polyphenol']) {
  if (!foodLogColumns3.includes(col)) {
    db.exec(`ALTER TABLE food_logs ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
  }
}

const coffeeLogColumns = db.prepare('PRAGMA table_info(coffee_logs)').all().map((c) => c.name);
if (!coffeeLogColumns.includes('type')) {
  db.exec(`ALTER TABLE coffee_logs ADD COLUMN type TEXT NOT NULL DEFAULT 'cafe_latte'`);
}
if (!coffeeLogColumns.includes('auto_linked_food_log_id')) {
  db.exec(`ALTER TABLE coffee_logs ADD COLUMN auto_linked_food_log_id INTEGER`);
}
// Café latte counts as a real "espresso + 150ml almond milk" toward the day's kcal/macros —
// unlike caffeine/water, this is a fixed per-serving amount regardless of the water_ml picked.
for (const col of ['kcal', 'protein', 'carbs', 'fat']) {
  if (!coffeeLogColumns.includes(col)) {
    db.exec(`ALTER TABLE coffee_logs ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`);
  }
}

// profile/profile_history seeding happens further down, after the user_id migration — this way
// it only ever has to deal with the final (user_id-keyed) schema, not the pre-migration one.

db.prepare(`DELETE FROM activity_settings WHERE type = 'marche_tapis_incline'`).run();

export const DEFAULT_ACTIVITY_SETTINGS = [
  { type: 'marche', label: 'Marche (tranquille)', kcal_per_hour: 250 },
  { type: 'marche_tapis', label: 'Marche sur tapis', kcal_per_hour: 230 },
  { type: 'stepper', label: 'Stepper (tranquille)', kcal_per_hour: 400 },
  { type: 'force', label: 'Entraînement de force', kcal_per_hour: 300 },
  { type: 'marche_tapis_incline_6', label: 'Tapis incliné 6%', kcal_per_hour: 550 },
  { type: 'marche_tapis_incline_8', label: 'Tapis incliné 8%', kcal_per_hour: 630 },
  { type: 'marche_tapis_incline_10', label: 'Tapis incliné 10%', kcal_per_hour: 700 },
  { type: 'marche_tapis_incline_12', label: 'Tapis incliné 12%', kcal_per_hour: 780 },
  { type: 'velo_ville', label: 'Vélo de ville', kcal_per_hour: 300 },
];

// --- Multi-user migration ---------------------------------------------------------------------
// Placeholder "legacy" account (id=1) holding everything created before auth existed. Its
// password_hash is a marker no real bcrypt hash can ever equal, so it can't be logged into as-is
// — POST /api/auth/claim-legacy (see index.js) is the one-time flow that sets a real email/
// password on it, turning it into a normal account without ever needing a temp password relayed
// through chat.
const LEGACY_MARKER = 'LEGACY_UNCLAIMED';
const anyUser = db.prepare('SELECT id FROM users LIMIT 1').get();
if (!anyUser) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, must_change_password) VALUES (1, 'legacy@local', ?, 1)`
  ).run(LEGACY_MARKER);
}

// Adds `user_id INTEGER NOT NULL DEFAULT 1` to a table if missing — 1 is the legacy account, so
// every pre-existing row is owned by it until claimed.
function addUserIdColumn(table) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes('user_id')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1`);
  }
}

for (const table of [
  'profile_history', 'activity_logs', 'recipes', 'foods', 'food_logs',
  'weight_photos', 'water_logs', 'coffee_logs', 'activity_plan',
]) {
  addUserIdColumn(table);
}

// Optional custom name for a workout (e.g. "Pecs & Triceps") shown instead of the plain
// activity-type label — added after these tables already existed, so it's a migration rather
// than part of the original CREATE TABLE like activity_exercises.
function addColumnIfMissing(table, columnName, columnDef) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(columnName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  }
}
addColumnIfMissing('activity_logs', 'label', 'label TEXT');
addColumnIfMissing('activity_plan', 'label', 'label TEXT');

// profile: was a single CHECK(id=1) row — rebuild to one row per user, keyed by user_id.
const profileCols = db.prepare('PRAGMA table_info(profile)').all().map((c) => c.name);
if (!profileCols.includes('user_id')) {
  db.exec(`
    CREATE TABLE profile_new (
      user_id INTEGER PRIMARY KEY,
      bmr REAL NOT NULL DEFAULT 0,
      daily_movement_kcal REAL NOT NULL DEFAULT 0,
      digestion_kcal REAL NOT NULL DEFAULT 0,
      weight_kg REAL NOT NULL DEFAULT 70,
      goal TEXT NOT NULL DEFAULT 'lose',
      goal_kcal REAL NOT NULL DEFAULT 750
    );
    INSERT INTO profile_new (user_id, bmr, daily_movement_kcal, digestion_kcal, weight_kg, goal, goal_kcal)
      SELECT 1, bmr, daily_movement_kcal, digestion_kcal, weight_kg, goal, goal_kcal FROM profile;
    DROP TABLE profile;
    ALTER TABLE profile_new RENAME TO profile;
  `);
}

// Seed a profile row for the legacy account if it doesn't have one yet (e.g. a brand-new
// install where `profile` was created but never seeded before the user_id rebuild above ran).
if (!db.prepare('SELECT 1 FROM profile WHERE user_id = 1').get()) {
  db.prepare(
    `INSERT INTO profile (user_id, bmr, daily_movement_kcal, digestion_kcal, weight_kg, goal, goal_kcal)
     VALUES (1, 0, 0, 0, 70, 'lose', 750)`
  ).run();
}

// Seed one history row from the current profile if none exists yet, so profileAsOf() in
// index.js always has a fallback for dates before this feature started tracking changes.
if (!db.prepare('SELECT 1 FROM profile_history LIMIT 1').get()) {
  const p = db.prepare('SELECT * FROM profile WHERE user_id = 1').get();
  db.prepare(
    `INSERT INTO profile_history (user_id, date, bmr, daily_movement_kcal, digestion_kcal, weight_kg, goal, goal_kcal)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)`
  ).run(new Date().toISOString().slice(0, 10), p.bmr, p.daily_movement_kcal, p.digestion_kcal, p.weight_kg, p.goal, p.goal_kcal);
}

// activity_settings: was PRIMARY KEY(type) (global) — rebuild to PRIMARY KEY(user_id, type) so
// each account can tune its own kcal/hour rates.
const activitySettingsCols = db.prepare('PRAGMA table_info(activity_settings)').all().map((c) => c.name);
if (!activitySettingsCols.includes('user_id')) {
  db.exec(`
    CREATE TABLE activity_settings_new (
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      kcal_per_hour REAL NOT NULL,
      PRIMARY KEY (user_id, type)
    );
    INSERT INTO activity_settings_new (user_id, type, label, kcal_per_hour)
      SELECT 1, type, label, kcal_per_hour FROM activity_settings;
    DROP TABLE activity_settings;
    ALTER TABLE activity_settings_new RENAME TO activity_settings;
  `);
}

// meal_favorites: UNIQUE(meal, source_type, source_id) -> UNIQUE(user_id, meal, source_type, source_id).
const mealFavColumns = db.prepare('PRAGMA table_info(meal_favorites)').all().map((c) => c.name);
if (!mealFavColumns.includes('user_id')) {
  db.exec(`
    CREATE TABLE meal_favorites_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      meal TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, meal, source_type, source_id)
    );
    INSERT INTO meal_favorites_new (id, user_id, meal, source_type, source_id, label, created_at)
      SELECT id, 1, meal, source_type, source_id, label, created_at FROM meal_favorites;
    DROP TABLE meal_favorites;
    ALTER TABLE meal_favorites_new RENAME TO meal_favorites;
  `);
}

// weight_logs: UNIQUE(date) -> UNIQUE(user_id, date), otherwise a second account could never log
// a weight on a date the legacy account already used.
const weightLogUserCols = db.prepare('PRAGMA table_info(weight_logs)').all().map((c) => c.name);
if (!weightLogUserCols.includes('user_id')) {
  db.exec(`
    CREATE TABLE weight_logs_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      body_fat_pct REAL,
      waist_cm REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, date)
    );
    INSERT INTO weight_logs_new (id, user_id, date, weight_kg, body_fat_pct, waist_cm, created_at)
      SELECT id, 1, date, weight_kg, body_fat_pct, waist_cm, created_at FROM weight_logs;
    DROP TABLE weight_logs;
    ALTER TABLE weight_logs_new RENAME TO weight_logs;
  `);
}

// meal_plan_entries: UNIQUE(day, meal, source_type, source_id) -> prefixed with user_id.
const mealPlanUserCols = db.prepare('PRAGMA table_info(meal_plan_entries)').all().map((c) => c.name);
if (!mealPlanUserCols.includes('user_id')) {
  db.exec(`
    CREATE TABLE meal_plan_entries_new2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      meal TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      kcal REAL NOT NULL,
      protein REAL NOT NULL,
      carbs REAL NOT NULL,
      fat REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, day, meal, source_type, source_id)
    );
    INSERT INTO meal_plan_entries_new2
      (id, user_id, day, meal, source_type, source_id, label, quantity, kcal, protein, carbs, fat, created_at)
      SELECT id, 1, day, meal, source_type, source_id, label, quantity, kcal, protein, carbs, fat, created_at
      FROM meal_plan_entries;
    DROP TABLE meal_plan_entries;
    ALTER TABLE meal_plan_entries_new2 RENAME TO meal_plan_entries;
  `);
}

// meal_plan_applied: PRIMARY KEY(date, meal) -> PRIMARY KEY(user_id, date, meal).
const mealPlanAppliedCols = db.prepare('PRAGMA table_info(meal_plan_applied)').all().map((c) => c.name);
if (!mealPlanAppliedCols.includes('user_id')) {
  db.exec(`
    CREATE TABLE meal_plan_applied_new (
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      meal TEXT NOT NULL,
      PRIMARY KEY (user_id, date, meal)
    );
    INSERT INTO meal_plan_applied_new (user_id, date, meal) SELECT 1, date, meal FROM meal_plan_applied;
    DROP TABLE meal_plan_applied;
    ALTER TABLE meal_plan_applied_new RENAME TO meal_plan_applied;
  `);
}

// activity_plan_applied: PRIMARY KEY(date, activity_plan_id) -> prefixed with user_id.
const activityPlanAppliedCols = db.prepare('PRAGMA table_info(activity_plan_applied)').all().map((c) => c.name);
if (!activityPlanAppliedCols.includes('user_id')) {
  db.exec(`
    CREATE TABLE activity_plan_applied_new (
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      activity_plan_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, date, activity_plan_id)
    );
    INSERT INTO activity_plan_applied_new (user_id, date, activity_plan_id)
      SELECT 1, date, activity_plan_id FROM activity_plan_applied;
    DROP TABLE activity_plan_applied;
    ALTER TABLE activity_plan_applied_new RENAME TO activity_plan_applied;
  `);
}

// nutrient_estimation_runs / microbiome_classification_runs: PRIMARY KEY(date) -> (user_id, date)
// — each account's food/recipe catalog is now separate, so the daily batch job runs per account.
for (const table of ['nutrient_estimation_runs', 'microbiome_classification_runs']) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes('user_id')) {
    db.exec(`
      CREATE TABLE ${table}_new (
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        PRIMARY KEY (user_id, date)
      );
      INSERT INTO ${table}_new (user_id, date) SELECT 1, date FROM ${table};
      DROP TABLE ${table};
      ALTER TABLE ${table}_new RENAME TO ${table};
    `);
  }
}

const upsertSetting = db.prepare(`
  INSERT INTO activity_settings (user_id, type, label, kcal_per_hour) VALUES (1, @type, @label, @kcal_per_hour)
  ON CONFLICT(user_id, type) DO UPDATE SET label = @label, kcal_per_hour = @kcal_per_hour
`);
for (const setting of DEFAULT_ACTIVITY_SETTINGS) {
  upsertSetting.run(setting);
}

export default db;
