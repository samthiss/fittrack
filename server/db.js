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

  -- What was actually lifted, one row per validated set. activity_exercises holds the plan for an
  -- exercise (4 séries × 10 reps @ 40kg); this holds the performance, which is what makes a set
  -- worth validating one at a time — until now that record lived only in the phone's memory and
  -- was gone the moment the workout ended.
  --
  -- exercise_name is denormalized on purpose: progression is followed per movement across months
  -- ("développé couché"), not per activity_exercises row, since every session creates brand-new
  -- rows for the same exercise. date likewise, so a history query never joins back to activity_logs.
  --
  -- name_key is that name lowercased in JS, and is what history actually matches on. SQLite's own
  -- case-insensitivity (COLLATE NOCASE, and LOWER()) folds ASCII only, so "DÉVELOPPÉ COUCHÉ" and
  -- "développé couché" would count as two different movements — which, for a French exercise list,
  -- is most of them.
  --
  -- (activity_exercise_id, set_index) is unique: re-validating or correcting a set afterwards
  -- overwrites it rather than logging the same set twice.
  CREATE TABLE IF NOT EXISTS exercise_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    activity_log_id INTEGER NOT NULL,
    activity_exercise_id INTEGER NOT NULL,
    exercise_name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    date TEXT NOT NULL,
    set_index INTEGER NOT NULL,
    weight_kg REAL,
    reps INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (activity_exercise_id, set_index)
  );

  CREATE INDEX IF NOT EXISTS idx_exercise_sets_history
    ON exercise_sets (user_id, name_key, date DESC);

  -- A saved, reusable list of exercises (e.g. "Lower Body") the user can pick when starting a
  -- new force session instead of re-adding every exercise by hand each time. exercises is a JSON
  -- array of { name, sets, reps, weight_kg }, mirroring activity_exercises' shape but detached
  -- from any specific day's log — same storage pattern as recipes.ingredients.
  CREATE TABLE IF NOT EXISTS workout_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    exercises TEXT NOT NULL DEFAULT '[]',
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

  -- Suppléments (magnésium, vitamine D, oméga-3...) the user takes on a schedule, managed from
  -- the Journal's "Suppléments" section. "frequency" is 'daily' (times_per_day intakes every day)
  -- or 'monthly' (a single intake per calendar month). "time_of_day" is an optional JSON array of
  -- moments (matin / soir), shown as a reminder label only.
  CREATE TABLE IF NOT EXISTS supplements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'daily',
    times_per_day INTEGER NOT NULL DEFAULT 1,
    time_of_day TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per reminder actually sent, so a scheduler tick that runs twice in the same minute —
  -- or a redeploy mid-minute, which restarts the process — can't send the same reminder twice.
  CREATE TABLE IF NOT EXISTS reminder_runs (
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    slot TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    -- How many times this reminder has gone out today, and when it last did: the repeat option
    -- re-sends every quarter of an hour from here until the supplements are ticked (or the cap).
    -- Both describe a row that has been *claimed* but not yet sent, hence 0 and NULL — the column
    -- must stay nullable, or the claiming INSERT OR IGNORE silently drops the row (see below).
    attempts INTEGER NOT NULL DEFAULT 0,
    last_sent_at TEXT,
    PRIMARY KEY (user_id, date, slot)
  );

  -- One Web Push subscription per installed app (an iPhone home-screen PWA counts as one). The
  -- endpoint is the browser's own push URL and identifies the device, hence the UNIQUE on it —
  -- re-subscribing from the same device must update its keys, not pile up duplicates.
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- The rest countdown a user has running right now, so the end-of-rest notification can be sent
  -- by the server instead of by the phone. iOS suspends a backgrounded tab's JavaScript as soon
  -- as the screen locks, so a timer living only in the page fires late or not at all — which is
  -- exactly the case the notification exists for, the phone in a pocket between two sets.
  --
  -- One row per user: a rest belongs to the single workout in progress, so starting one replaces
  -- whatever was pending, and finishing, pausing or abandoning it deletes the row. fire_at_ms is
  -- epoch milliseconds rather than this schema's usual datetime() text because a rest is due to
  -- the second and the scheduler compares it every second.
  CREATE TABLE IF NOT EXISTS rest_timers (
    user_id INTEGER PRIMARY KEY,
    fire_at_ms INTEGER NOT NULL,
    exercise_name TEXT,
    set_number INTEGER,
    total_sets INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per intake ticked off: a supplement with times_per_day = 2 gets two rows on a day
  -- it was fully taken. Deleting the newest row is how un-ticking works.
  CREATE TABLE IF NOT EXISTS supplement_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    supplement_id INTEGER NOT NULL,
    date TEXT NOT NULL,
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

// DEFAULT 1 so every account that existed before this feature shipped (including the legacy
// account) is treated as "already onboarded" — only a genuinely new /api/auth/register signup
// explicitly starts at 0 and sees the onboarding wizard.
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('onboarding_completed')) {
  db.exec(`ALTER TABLE users ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 1`);
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
  { type: 'walking_pad_1_5', label: 'Walking pad 1,5 km/h', kcal_per_hour: 150 },
  { type: 'walking_pad_2', label: 'Walking pad 2 km/h', kcal_per_hour: 180 },
  { type: 'walking_pad_2_5', label: 'Walking pad 2,5 km/h', kcal_per_hour: 220 },
  { type: 'walking_pad_3', label: 'Walking pad 3 km/h', kcal_per_hour: 260 },
  { type: 'stepper', label: 'Stepper (tranquille)', kcal_per_hour: 400 },
  { type: 'force', label: 'Entraînement de force', kcal_per_hour: 300 },
  { type: 'marche_tapis_incline_6', label: 'Tapis incliné 6%', kcal_per_hour: 550 },
  { type: 'marche_tapis_incline_8', label: 'Tapis incliné 8%', kcal_per_hour: 630 },
  { type: 'marche_tapis_incline_10', label: 'Tapis incliné 10%', kcal_per_hour: 700 },
  { type: 'marche_tapis_incline_12', label: 'Tapis incliné 12%', kcal_per_hour: 780 },
  { type: 'velo_ville', label: 'Vélo de ville', kcal_per_hour: 300 },
  { type: 'corde_a_sauter', label: 'Corde à sauter', kcal_per_hour: 600 },
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
// Ties together the set of day-rows created by one "recurring" submission, so viewing an
// activity's recurring days shows only the group it actually belongs to — matching by
// type+duration alone was wrong, since unrelated recurring plans can share the same type/duration.
addColumnIfMissing('activity_plan', 'group_id', 'group_id TEXT');
addColumnIfMissing('activity_logs', 'plan_group_id', 'plan_group_id TEXT');

// The supplements table went through a few shapes while the feature was being built (a dose
// column, weekday scheduling), and CREATE TABLE IF NOT EXISTS leaves an existing one untouched —
// so a database that got an early version keeps it forever. Add whatever it's missing instead of
// letting the inserts fail at runtime; the dropped columns are harmless where they still exist.
addColumnIfMissing('supplements', 'frequency', "frequency TEXT NOT NULL DEFAULT 'daily'");
addColumnIfMissing('supplements', 'times_per_day', 'times_per_day INTEGER NOT NULL DEFAULT 1');
addColumnIfMissing('supplements', 'time_of_day', 'time_of_day TEXT');
addColumnIfMissing('supplements', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('supplements', 'archived', 'archived INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('supplement_logs', 'supplement_id', 'supplement_id INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('supplement_logs', 'date', 'date TEXT NOT NULL DEFAULT \'1970-01-01\'');

// Adding columns only goes one way: a column the code never writes but the table declares NOT
// NULL with no default makes every INSERT fail — for supplement_logs that means every attempt to
// tick a supplement dies on a NOT NULL constraint, with a checkbox that simply looks dead. When
// that's the shape we find, the table is rebuilt to the canonical one, carrying over the rows by
// the columns both shapes share.
function rebuildIfUnwritable(table, knownColumns, createSql) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.length === 0) return;
  const blocking = cols.filter((c) => c.notnull && c.dflt_value === null && !knownColumns.includes(c.name));
  if (blocking.length === 0) return;
  console.warn(
    `Rebuilding ${table}: column(s) ${blocking.map((c) => c.name).join(', ')} are NOT NULL with no ` +
      `default and are never written, so every insert into this table fails.`
  );
  const carried = knownColumns.filter((name) => cols.some((c) => c.name === name));
  const list = carried.join(', ');
  db.exec('BEGIN');
  try {
    db.exec(`ALTER TABLE ${table} RENAME TO ${table}_broken`);
    db.exec(createSql);
    if (carried.length > 0) db.exec(`INSERT INTO ${table} (${list}) SELECT ${list} FROM ${table}_broken`);
    db.exec(`DROP TABLE ${table}_broken`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// A reminder_runs from the first version of this feature declares last_sent_at NOT NULL, and the
// scheduler claims a slot by inserting NULL there. INSERT OR IGNORE swallows constraint failures
// as readily as duplicates, so on such a table every reminder was dropped without a row, an error
// or a log line. Rebuild it rather than working around the shape.
{
  const cols = db.prepare('PRAGMA table_info(reminder_runs)').all();
  const lastSent = cols.find((c) => c.name === 'last_sent_at');
  if (lastSent && lastSent.notnull) {
    console.warn('Rebuilding reminder_runs: last_sent_at is NOT NULL, which silently rejects every claimed reminder.');
    db.exec('BEGIN');
    try {
      db.exec('ALTER TABLE reminder_runs RENAME TO reminder_runs_old');
      db.exec(`CREATE TABLE reminder_runs (
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        slot TEXT NOT NULL,
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_sent_at TEXT,
        PRIMARY KEY (user_id, date, slot)
      )`);
      db.exec(`INSERT INTO reminder_runs (user_id, date, slot, sent_at, attempts, last_sent_at)
               SELECT user_id, date, slot, sent_at, attempts, last_sent_at FROM reminder_runs_old`);
      db.exec('DROP TABLE reminder_runs_old');
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

rebuildIfUnwritable(
  'supplement_logs',
  ['id', 'user_id', 'supplement_id', 'date', 'created_at'],
  `CREATE TABLE supplement_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    supplement_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`
);

rebuildIfUnwritable(
  'supplements',
  ['id', 'user_id', 'name', 'frequency', 'times_per_day', 'time_of_day', 'sort_order', 'archived', 'created_at'],
  `CREATE TABLE supplements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'daily',
    times_per_day INTEGER NOT NULL DEFAULT 1,
    time_of_day TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`
);

// Backfill: rows created before group_id existed have none yet. Group them the same way the
// old (buggy) matching used to — by user+type+duration+label — so existing recurring plans keep
// working, and each distinct combination becomes its own stable group going forward instead of
// silently merging with unrelated plans that happen to share a type/duration.
{
  const legacyPlanRows = db.prepare('SELECT * FROM activity_plan WHERE group_id IS NULL').all();
  if (legacyPlanRows.length > 0) {
    const groupIds = new Map();
    const updatePlanGroup = db.prepare('UPDATE activity_plan SET group_id = ? WHERE id = ?');
    for (const row of legacyPlanRows) {
      const key = `${row.user_id}|${row.type}|${row.duration_minutes}|${row.label || ''}`;
      if (!groupIds.has(key)) groupIds.set(key, crypto.randomUUID());
      updatePlanGroup.run(groupIds.get(key), row.id);
    }
    const updateLogGroup = db.prepare('UPDATE activity_logs SET plan_group_id = ? WHERE id = ?');
    const legacyLogs = db.prepare('SELECT * FROM activity_logs WHERE plan_group_id IS NULL').all();
    for (const log of legacyLogs) {
      const key = `${log.user_id}|${log.type}|${log.duration_minutes}|${log.label || ''}`;
      const gid = groupIds.get(key);
      if (gid) updateLogGroup.run(gid, log.id);
    }
  }
}

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

// Personal info shown on the "Éditer le profil" screen — static-ish (sex/birthdate/height never
// change day to day, body_fat_pct is a single current snapshot, not tracked historically like
// weight_logs) so these live only on the current profile row, not in profile_history.
const profileCols2 = db.prepare('PRAGMA table_info(profile)').all().map((c) => c.name);
if (!profileCols2.includes('sex')) {
  db.exec(`ALTER TABLE profile ADD COLUMN sex TEXT`);
}
if (!profileCols2.includes('birthdate')) {
  db.exec(`ALTER TABLE profile ADD COLUMN birthdate TEXT`);
}
if (!profileCols2.includes('height_cm')) {
  db.exec(`ALTER TABLE profile ADD COLUMN height_cm REAL`);
}
if (!profileCols2.includes('body_fat_pct')) {
  db.exec(`ALTER TABLE profile ADD COLUMN body_fat_pct REAL`);
}
// NULL (the default) means "adapt automatically" (bmr + movement + digestion + today's
// activities, ± the goal deficit/surplus) — set means the daily kcal target is pinned to this
// number regardless of activity, until cleared back to NULL.
if (!profileCols2.includes('manual_target_kcal')) {
  db.exec(`ALTER TABLE profile ADD COLUMN manual_target_kcal REAL`);
}
if (!profileCols2.includes('target_weight_kg')) {
  db.exec(`ALTER TABLE profile ADD COLUMN target_weight_kg REAL`);
}
if (!profileCols2.includes('steps_per_day')) {
  db.exec(`ALTER TABLE profile ADD COLUMN steps_per_day REAL`);
}
// NULL means "use the 30% protein / 35% carbs / 35% fat default" (see computeMacroTargets) —
// set via the onboarding "Ajuster les macros" step to override the day's macro split everywhere
// (dashboard, journal, weekly targets), not just as a one-off preview.
if (!profileCols2.includes('protein_pct')) {
  db.exec(`ALTER TABLE profile ADD COLUMN protein_pct REAL`);
}
if (!profileCols2.includes('carbs_pct')) {
  db.exec(`ALTER TABLE profile ADD COLUMN carbs_pct REAL`);
}
// NULL means "use the default 15/5/35/45% breakfast/snack/lunch/dinner split" (see
// mealSharesFor in index.js) — JSON object {breakfast,snack,lunch,dinner} of 0-1 shares, set via
// Réglages > Repas du jour to override each meal's kcal budget everywhere (dashboard, meal
// detail, meal plan) instead of the fixed split.
if (!profileCols2.includes('meal_shares')) {
  db.exec(`ALTER TABLE profile ADD COLUMN meal_shares TEXT`);
}
// NULL/empty means "just the one base en-cas" — JSON array of extra { key: 'snack_<n>', label,
// time } slots added via Réglages > Repas du jour ("+ Ajouter un en-cas"), each becoming a real
// meal key usable everywhere a meal is (Journal, meal plan, favorites...).
if (!profileCols2.includes('extra_snacks')) {
  db.exec(`ALTER TABLE profile ADD COLUMN extra_snacks TEXT`);
}
// Which preset (250/500/700/1000 ml) the water quick-add dropdown in the journal starts on —
// set via Réglages > Eau. NULL falls back to 700ml, the app's original fixed amount.
if (!profileCols2.includes('default_water_ml')) {
  db.exec(`ALTER TABLE profile ADD COLUMN default_water_ml REAL`);
}
// Daily water goal shown on the journal's progress bar (3L or 4L) — set via Réglages > Eau.
// NULL falls back to 4000ml, the app's original fixed goal.
if (!profileCols2.includes('water_goal_ml')) {
  db.exec(`ALTER TABLE profile ADD COLUMN water_goal_ml REAL`);
}
// Rest between sets per rep range, as a JSON object keyed by the set-target vocabulary
// (e.g. {"5-9":90,"8-12":60,...}) — set via Réglages > Temps de repos, applied automatically by
// the exercise session's rest timer. NULL falls back to DEFAULT_REST_BY_REPS on the client.
if (!profileCols2.includes('rest_by_reps')) {
  db.exec(`ALTER TABLE profile ADD COLUMN rest_by_reps TEXT`);
}
addColumnIfMissing('reminder_runs', 'attempts', 'attempts INTEGER NOT NULL DEFAULT 1');
// Nullable on the migration path on purpose: SQLite refuses ALTER TABLE ADD COLUMN with a
// non-constant default like datetime('now'), and a row that predates repeats has no last send to
// speak of — isRepeatDue() treats a NULL here as "never repeat", which is the right answer.
addColumnIfMissing('reminder_runs', 'last_sent_at', 'last_sent_at TEXT');

// Supplement reminders: "HH:MM" in the user's own timezone, NULL meaning that slot is off. The
// timezone is stored alongside because the scheduler runs on a server in UTC and has to fire at
// 08:00 where the user is, not where the container is.
if (!profileCols2.includes('reminder_morning_at')) {
  db.exec(`ALTER TABLE profile ADD COLUMN reminder_morning_at TEXT`);
}
if (!profileCols2.includes('reminder_evening_at')) {
  db.exec(`ALTER TABLE profile ADD COLUMN reminder_evening_at TEXT`);
}
if (!profileCols2.includes('reminder_timezone')) {
  db.exec(`ALTER TABLE profile ADD COLUMN reminder_timezone TEXT`);
}
// 1 = keep reminding every 15 minutes until the supplements are ticked (capped — see reminders.js).
if (!profileCols2.includes('reminder_repeat')) {
  db.exec(`ALTER TABLE profile ADD COLUMN reminder_repeat INTEGER`);
}

// The two TDEE inputs that move over time and so need a snapshot per save, alongside the bmr /
// weight / goal ones profile_history already tracked (see profileAsOf in index.js).
const profileHistoryCols = db.prepare('PRAGMA table_info(profile_history)').all().map((c) => c.name);
if (!profileHistoryCols.includes('steps_per_day')) {
  db.exec(`ALTER TABLE profile_history ADD COLUMN steps_per_day REAL`);
}
if (!profileHistoryCols.includes('bmr_method')) {
  db.exec(`ALTER TABLE profile_history ADD COLUMN bmr_method TEXT`);
}

// Which formula estimates the BMR half of the TDEE: 'katch' (body fat % + weight), 'mifflin'
// (age/height/weight/sex) or 'manual' (the typed-in profile.bmr). NULL means "pick for me" —
// Katch-McArdle once a body-fat % exists, Mifflin-St Jeor otherwise. See server/tdee.js.
if (!profileCols2.includes('bmr_method')) {
  db.exec(`ALTER TABLE profile ADD COLUMN bmr_method TEXT`);
}

// NEAT used to be folded into daily_movement_kcal (steps + an average of the planned workouts);
// it's now derived from steps_per_day alone, with the workout half coming from the day's actual
// activity logs instead. Profiles predating steps_per_day get a step count back-solved from their
// old movement figure so their TDEE doesn't jump on upgrade — inflated by the workout share it
// used to include, which is why Réglages > TDEE shows the number for the user to correct.
const legacyProfiles = db
  .prepare('SELECT user_id, daily_movement_kcal, weight_kg FROM profile WHERE steps_per_day IS NULL AND daily_movement_kcal > 0')
  .all();
if (legacyProfiles.length > 0) {
  const setSteps = db.prepare('UPDATE profile SET steps_per_day = ? WHERE user_id = ?');
  for (const p of legacyProfiles) {
    const steps = p.daily_movement_kcal / (0.04 * ((p.weight_kg || 70) / 70));
    setSteps.run(Math.min(30000, Math.round(steps)), p.user_id);
  }
}

// Free-text muscle/body-part tag per exercise (e.g. "Quadriceps") — shown above the exercise
// name and rolled up into a pill row on the exercise's saved workout_templates card.
const activityExerciseColumns = db.prepare('PRAGMA table_info(activity_exercises)').all().map((c) => c.name);
if (!activityExerciseColumns.includes('muscle_group')) {
  db.exec(`ALTER TABLE activity_exercises ADD COLUMN muscle_group TEXT`);
}
// Per-set rep targets (e.g. ["5-9↑", "10-15↓"] for a reverse-pyramid scheme) as a JSON array of
// strings — NULL means "no per-set scheme, just use sets × reps" (the original, simpler shape).
// sets/reps stay as-is alongside it (auto-derived from the scheme when one is set) so every
// existing kcal estimate / display that only knows about sets×reps keeps working unchanged.
if (!activityExerciseColumns.includes('set_targets')) {
  db.exec(`ALTER TABLE activity_exercises ADD COLUMN set_targets TEXT`);
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

// Backfill: seedDefaultUserData (index.js) only inserts DEFAULT_ACTIVITY_SETTINGS for a BRAND NEW
// account at registration time, so a type added to that list later (e.g. jump rope) never reaches
// accounts that already existed — INSERT OR IGNORE here re-runs the same seeding for every
// existing user on every boot, a no-op for types they already have.
const insertMissingSetting = db.prepare(
  `INSERT OR IGNORE INTO activity_settings (user_id, type, label, kcal_per_hour) VALUES (?, ?, ?, ?)`
);
for (const { id: userId } of db.prepare('SELECT id FROM users').all()) {
  for (const setting of DEFAULT_ACTIVITY_SETTINGS) {
    insertMissingSetting.run(userId, setting.type, setting.label, setting.kcal_per_hour);
  }
}

export default db;
