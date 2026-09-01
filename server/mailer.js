import nodemailer from 'nodemailer';

// Outgoing mail, over whichever channel the deployment can actually use.
//
// Two transports, because plain SMTP is not available everywhere: Railway (and most hosting
// platforms) block outbound port 587 and 465 outright, to stop a compromised container becoming a
// spam relay. A password reset that times out after two minutes is indistinguishable from a
// broken app, so an HTTP API — port 443, never blocked — is the transport that works there, and
// SMTP stays for local runs and hosts that allow it.
//
// Like Web Push (see PUSH_ENABLED in index.js), the feature stays off rather than half-working
// when neither is configured.

const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
// The address mail is sent from. With Brevo this must be a sender you have verified with them;
// with SMTP most relays refuse a From that isn't the authenticated account, hence the fallback.
const MAIL_FROM_EMAIL = process.env.MAIL_FROM || SMTP_USER;
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'FitTrack';

const USE_BREVO = Boolean(BREVO_API_KEY && MAIL_FROM_EMAIL);
const USE_SMTP = !USE_BREVO && Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
export const MAIL_ENABLED = USE_BREVO || USE_SMTP;

// Configured is not the same as working: a revoked key, an unverified sender or a blocked port
// all leave MAIL_ENABLED true and every send failing. verifyMailer() writes its verdict here, and
// the login screen asks for *this* before offering a reset link — configuration alone is not a
// promise the app should make to a locked-out user.
let mailVerified = null; // null = not checked yet, treated as usable until proven otherwise
export function isMailReady() {
  return MAIL_ENABLED && mailVerified !== false;
}

let transporter = null;
if (USE_SMTP) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    // 465 is implicit TLS; 587 opens plain and upgrades via STARTTLS, which nodemailer does on
    // its own when secure is false.
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Fail in seconds, not minutes. Where the port is blocked there is nothing to wait for, and
    // the default timeouts leave the user staring at a spinner for two minutes before an error.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });
} else if (!USE_BREVO) {
  console.warn('Email disabled: set BREVO_API_KEY (recommended) or SMTP_USER and SMTP_PASS.');
}

async function sendViaBrevo({ to, subject, text, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: MAIL_FROM_EMAIL, name: MAIL_FROM_NAME },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    // Brevo answers with a JSON message that names the real problem (an unverified sender, a
    // revoked key); passing it through is what makes the server log worth reading.
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Sends one message. Throws on failure rather than swallowing it: the caller decides what the
 * user is told, and for a password reset "we sent it" must never be printed over a send that
 * actually failed.
 */
export async function sendMail({ to, subject, text, html }) {
  if (USE_BREVO) return sendViaBrevo({ to, subject, text, html });
  if (!transporter) throw new Error("Envoi d'email non configuré sur le serveur");
  return transporter.sendMail({
    from: `${MAIL_FROM_NAME} <${MAIL_FROM_EMAIL}>`,
    to,
    subject,
    text,
    html,
  });
}

// Checks the channel works at boot, so a misconfiguration shows up in the log rather than the
// first time someone is locked out of their account.
export async function verifyMailer() {
  if (USE_BREVO) {
    try {
      const res = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': BREVO_API_KEY, accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`Email ready: Brevo API, from ${MAIL_FROM_EMAIL}`);
      mailVerified = true;
      return true;
    } catch (err) {
      console.error('Email misconfigured (Brevo), password reset will fail:', err.message);
      mailVerified = false;
      return false;
    }
  }
  if (!transporter) return false;
  try {
    await transporter.verify();
    console.log(`Email ready: ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_USER}`);
    mailVerified = true;
    return true;
  } catch (err) {
    console.error('Email misconfigured, password reset will fail:', err.message);
    mailVerified = false;
    return false;
  }
}
