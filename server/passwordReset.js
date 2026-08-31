import crypto from 'crypto';

// Password reset: making the token, judging whether one is still good, and writing the email.
// Kept out of index.js and free of database access so the parts that decide who gets back into
// an account can be tested against a fixed clock, like reminders.js and restTimer.js.

// An hour is long enough to walk to a computer and short enough that a link left sitting in a
// mailbox stops working. It is deliberately not a day: the mailbox is the weak link in this whole
// flow, and a token's lifetime is how long that weakness is worth anything to an attacker.
export const TOKEN_TTL_MS = 60 * 60 * 1000;

// Enough entropy that guessing is not a strategy — 32 bytes, the same order as a session id.
export const TOKEN_BYTES = 32;

// How many resets one account may ask for in a window. The cap exists to stop an inbox being
// flooded by someone typing a victim's address over and over; the victim is the one who would
// suffer, not the sender. Legitimate use never comes near it — the honest case is one request,
// occasionally a second when the first mail is slow.
export const MAX_REQUESTS_PER_WINDOW = 3;
export const REQUEST_WINDOW_MS = 15 * 60 * 1000;

export function generateToken() {
  // base64url: goes into a URL untouched, and is shorter than hex for the same entropy.
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * What gets stored. The database holds only the hash, never the token itself — the token exists
 * in the email and nowhere else. A stolen database backup therefore yields no usable reset links,
 * which is the whole reason for hashing something that already expires within the hour.
 *
 * Plain SHA-256, not bcrypt: this input is 32 random bytes, so there is no dictionary to slow an
 * attacker down with, and the work factor would only cost the server.
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Whether a stored reset row can still be used. Expiry and single-use are checked here together
 * because forgetting either one is the classic way this feature goes wrong: a link that works
 * twice is a link that still works after the legitimate reset.
 */
export function isTokenUsable(row, now = Date.now()) {
  if (!row) return false;
  if (row.used_at) return false;
  return Number(row.expires_at_ms) > now;
}

/**
 * Whether this account has asked too often lately. Counting rows rather than keeping a separate
 * counter means a server restart cannot wipe the limit — the evidence is the reset rows
 * themselves.
 */
export function isRateLimited(recentCount, max = MAX_REQUESTS_PER_WINDOW) {
  return recentCount >= max;
}

// Constant-time compare, for the one place a secret is compared against user input.
export function tokensMatch(storedHash, candidateHash) {
  const a = Buffer.from(String(storedHash), 'utf8');
  const b = Buffer.from(String(candidateHash), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// The link the user clicks. The token travels in the query string rather than the path so the
// existing single-page app serves it without a new server route.
export function buildResetUrl(baseUrl, token) {
  return `${String(baseUrl).replace(/\/+$/, '')}/?reset=${encodeURIComponent(token)}`;
}

/**
 * The reset email. Plain text alongside the HTML because a password-reset mail that renders as
 * blank in a text-only client is a locked-out user, and because mail with no text part is scored
 * as spam more often — the one message that must not land in spam is this one.
 */
export function buildResetEmail({ url, ttlMinutes = TOKEN_TTL_MS / 60000 }) {
  const subject = 'Réinitialiser ton mot de passe FitTrack';
  const text = [
    'Tu as demandé à réinitialiser ton mot de passe FitTrack.',
    '',
    'Ouvre ce lien pour en choisir un nouveau :',
    url,
    '',
    `Ce lien expire dans ${ttlMinutes} minutes et ne fonctionne qu'une fois.`,
    "Si tu n'es pas à l'origine de cette demande, ignore ce message : ton mot de passe reste inchangé.",
  ].join('\n');
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#111">
  <p>Tu as demandé à réinitialiser ton mot de passe FitTrack.</p>
  <p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;background:#111;color:#fff;border-radius:8px;text-decoration:none">Choisir un nouveau mot de passe</a></p>
  <p style="color:#666;font-size:13px">Ce lien expire dans ${ttlMinutes} minutes et ne fonctionne qu'une fois.<br>
  Si tu n'es pas à l'origine de cette demande, ignore ce message : ton mot de passe reste inchangé.</p>
  <p style="color:#999;font-size:12px;word-break:break-all">${escapeHtml(url)}</p>
</div>`;
  return { subject, text, html };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
