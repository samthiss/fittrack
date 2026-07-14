import session from 'express-session';
import bcrypt from 'bcryptjs';

// Marker password_hash for the pre-auth "legacy" account (id 1, seeded in db.js) — no real
// bcrypt hash can ever equal this string, so it can never be logged into directly. It only
// becomes a normal account once claimed via POST /api/auth/claim-legacy.
export const LEGACY_MARKER = 'LEGACY_UNCLAIMED';

// Persists express-session data in the same SQLite file (see `sessions` table in db.js) instead
// of the default in-memory store, so logins survive a server restart.
export class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
  }

  get(sid, cb) {
    const row = this.db.prepare('SELECT data, expires FROM sessions WHERE sid = ?').get(sid);
    if (!row) return cb(null, null);
    if (row.expires < Date.now()) {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      return cb(null, null);
    }
    try {
      cb(null, JSON.parse(row.data));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sessionData, cb) {
    const expires = sessionData.cookie?.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + 30 * 24 * 60 * 60 * 1000;
    this.db
      .prepare(
        `INSERT INTO sessions (sid, user_id, expires, data) VALUES (?, ?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET user_id = excluded.user_id, expires = excluded.expires, data = excluded.data`
      )
      .run(sid, sessionData.userId || null, expires, JSON.stringify(sessionData));
    cb && cb();
  }

  destroy(sid, cb) {
    this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
    cb && cb();
  }

  touch(sid, sessionData, cb) {
    this.set(sid, sessionData, cb);
  }
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  if (hash === LEGACY_MARKER) return false;
  return bcrypt.compareSync(password, hash);
}

export function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  req.userId = req.session.userId;
  next();
}
