import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOKEN_TTL_MS,
  MAX_REQUESTS_PER_WINDOW,
  generateToken,
  hashToken,
  isTokenUsable,
  isRateLimited,
  tokensMatch,
  buildResetUrl,
  buildResetEmail,
} from './passwordReset.js';

test('tokens are unguessable and never repeat', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(generateToken());
  assert.equal(seen.size, 200);
  const token = generateToken();
  assert.ok(token.length >= 40, 'a 32-byte token is at least 43 base64url chars');
  assert.match(token, /^[A-Za-z0-9_-]+$/, 'must survive a URL untouched');
});

test('what is stored is the hash, not the token', () => {
  const token = generateToken();
  const hash = hashToken(token);
  assert.notEqual(hash, token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hashToken(token), hash, 'same token must hash the same, or no link would ever work');
  assert.notEqual(hashToken(generateToken()), hash);
});

test('a link is good only while unexpired and unused', () => {
  const now = 1_700_000_000_000;
  const fresh = { used_at: null, expires_at_ms: now + TOKEN_TTL_MS };
  assert.equal(isTokenUsable(fresh, now), true);

  // Expiry is what limits how long a mailbox is worth breaking into.
  assert.equal(isTokenUsable({ ...fresh, expires_at_ms: now - 1 }, now), false);
  assert.equal(isTokenUsable({ ...fresh, expires_at_ms: now }, now), false, 'the boundary is not still valid');

  // Single use: a link that works twice still works after the legitimate reset.
  assert.equal(isTokenUsable({ ...fresh, used_at: '2026-08-31 10:00:00' }, now), false);

  // An unknown token yields no row at all.
  assert.equal(isTokenUsable(null, now), false);
  assert.equal(isTokenUsable(undefined, now), false);
});

test('an inbox cannot be flooded by repeating the request', () => {
  assert.equal(isRateLimited(0), false);
  assert.equal(isRateLimited(MAX_REQUESTS_PER_WINDOW - 1), false);
  assert.equal(isRateLimited(MAX_REQUESTS_PER_WINDOW), true);
  assert.equal(isRateLimited(MAX_REQUESTS_PER_WINDOW + 10), true);
});

test('token comparison accepts the real one and rejects near misses', () => {
  const hash = hashToken(generateToken());
  assert.equal(tokensMatch(hash, hash), true);
  assert.equal(tokensMatch(hash, hashToken(generateToken())), false);
  // Different lengths must not throw — timingSafeEqual does, on unequal buffers.
  assert.equal(tokensMatch(hash, 'short'), false);
  assert.equal(tokensMatch(hash, ''), false);
});

test('the reset URL carries the token through the query string intact', () => {
  const token = 'abc-_123';
  assert.equal(buildResetUrl('https://fittrack.app', token), 'https://fittrack.app/?reset=abc-_123');
  // A base URL with a trailing slash must not produce a double one.
  assert.equal(buildResetUrl('https://fittrack.app/', token), 'https://fittrack.app/?reset=abc-_123');
});

test('the email carries the link in both parts and says what the link does', () => {
  const url = 'https://fittrack.app/?reset=tok123';
  const mail = buildResetEmail({ url });
  assert.match(mail.subject, /mot de passe/i);
  // A text part is not optional: no-HTML clients would show a blank page, and that is a locked-out
  // user.
  assert.ok(mail.text.includes(url));
  assert.ok(mail.html.includes(url));
  assert.match(mail.text, /60 minutes/);
  assert.match(mail.text, /ignore ce message/i, 'someone who did not ask must be told to do nothing');
});

test('the email escapes the URL rather than letting it inject markup', () => {
  const mail = buildResetEmail({ url: 'https://x.app/?reset=a"><script>alert(1)</script>' });
  assert.ok(!mail.html.includes('<script>'), 'markup in the URL must not survive into the HTML body');
  assert.ok(mail.html.includes('&lt;script&gt;'));
});
