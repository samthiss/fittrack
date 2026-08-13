// Run with: npm test --prefix server
//
// The schema and the two queries behind the strength history, exercised against a real SQLite
// engine. Uses node:sqlite (built into Node) rather than the app's better-sqlite3 so it needs no
// native build and no server running — the DDL is read out of db.js so it can't drift from what
// ships, and the SQL below is the same text as the routes in index.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbSource = readFileSync(path.join(here, 'db.js'), 'utf8');

// Mirrors exerciseNameKey() in index.js.
const nameKey = (name) => String(name || '').trim().toLowerCase();

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(/CREATE TABLE IF NOT EXISTS exercise_sets \([\s\S]*?\);/.exec(dbSource)[0]);
  db.exec(/CREATE INDEX IF NOT EXISTS idx_exercise_sets_history[\s\S]*?;/.exec(dbSource)[0]);

  const stmt = db.prepare(
    `INSERT INTO exercise_sets (user_id, activity_log_id, activity_exercise_id, exercise_name, name_key, date, set_index, weight_kg, reps)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (activity_exercise_id, set_index)
     DO UPDATE SET weight_kg = excluded.weight_kg, reps = excluded.reps`
  );
  const saveSet = (userId, logId, exId, name, date, index, kg, reps) =>
    stmt.run(userId, logId, exId, name, nameKey(name), date, index, kg, reps);

  const history = (userId, name, excludeActivityId, limit) => {
    const rows = db
      .prepare(
        `SELECT activity_log_id, date, set_index, weight_kg, reps
         FROM exercise_sets
         WHERE user_id = ? AND name_key = ? AND activity_log_id != ?
         ORDER BY date DESC, activity_log_id DESC, set_index ASC`
      )
      .all(userId, nameKey(name), excludeActivityId);
    const sessions = [];
    for (const row of rows) {
      let session = sessions[sessions.length - 1];
      if (!session || session.activity_log_id !== row.activity_log_id) {
        if (sessions.length === limit) break;
        session = { activity_log_id: row.activity_log_id, date: row.date, sets: [] };
        sessions.push(session);
      }
      session.sets.push({ set_index: row.set_index, weight_kg: row.weight_kg, reps: row.reps });
    }
    return sessions;
  };

  return { db, saveSet, history };
}

// Two past sessions of the same movement (a different activity_exercises row each time, as really
// happens), one belonging to somebody else, and the session in progress.
function seed({ saveSet }) {
  saveSet(1, 10, 100, 'Développé couché', '2026-08-01', 0, 60, 8);
  saveSet(1, 10, 100, 'Développé couché', '2026-08-01', 1, 60, 7);
  saveSet(1, 20, 200, 'Développé couché', '2026-08-08', 0, 62.5, 8);
  saveSet(1, 20, 200, 'DÉVELOPPÉ COUCHÉ', '2026-08-08', 1, 62.5, 6);
  saveSet(2, 30, 300, 'Développé couché', '2026-08-09', 0, 100, 10);
  saveSet(1, 40, 400, 'Développé couché', '2026-08-13', 0, 65, 5);
}

test('a corrected set overwrites rather than logging the set twice', () => {
  const ctx = freshDb();
  seed(ctx);
  ctx.saveSet(1, 20, 200, 'Développé couché', '2026-08-08', 1, 62.5, 7);

  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM exercise_sets').get().n, 6);
  const [last] = ctx.history(1, 'Développé couché', 40, 1);
  assert.deepEqual(last.sets[1], { set_index: 1, weight_kg: 62.5, reps: 7 });
});

// The reason name_key exists: SQLite's own case folding (COLLATE NOCASE, LOWER()) is ASCII-only,
// so it treats "DÉVELOPPÉ COUCHÉ" and "développé couché" as two different movements.
test('history matches across case and accents, and ignores surrounding space', () => {
  const ctx = freshDb();
  seed(ctx);
  const sessions = ctx.history(1, '  Développé Couché ', 40, 10);
  assert.deepEqual(
    sessions.map((s) => s.date),
    ['2026-08-08', '2026-08-01']
  );
  assert.equal(sessions[0].sets.length, 2, 'the all-caps set belongs to the same movement');
});

test("history excludes the session in progress and other users' sets", () => {
  const ctx = freshDb();
  seed(ctx);
  const sessions = ctx.history(1, 'Développé couché', 40, 10);
  const ids = sessions.map((s) => s.activity_log_id);
  assert.ok(!ids.includes(40), 'an exercise must not compare against itself');
  assert.ok(!ids.includes(30), "another account's sets stay out");
});

test('sessions come back most recent first, sets in order, limited by session', () => {
  const ctx = freshDb();
  seed(ctx);
  const sessions = ctx.history(1, 'Développé couché', 40, 1);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].date, '2026-08-08');
  assert.deepEqual(
    sessions[0].sets.map((s) => s.set_index),
    [0, 1]
  );
});

test('a movement never done before has no history', () => {
  const ctx = freshDb();
  seed(ctx);
  assert.deepEqual(ctx.history(1, 'Rowing barre', 40, 10), []);
});
