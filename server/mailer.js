import nodemailer from 'nodemailer';

// Outgoing mail. Plain SMTP rather than a provider's own API so the relay stays a deployment
// choice, not a code one: Gmail, Brevo, Mailgun and the rest all speak this, and switching means
// changing environment variables instead of this file.
//
// Like Web Push (see PUSH_ENABLED in index.js), the feature stays off rather than half-working
// when it isn't configured — a password reset that silently fails to send is worse than one the
// app openly refuses to offer.

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
// Some relays refuse a From that isn't the authenticated account, so the user doubles as the
// default sender.
const MAIL_FROM = process.env.MAIL_FROM || (SMTP_USER ? `FitTrack <${SMTP_USER}>` : '');

export const MAIL_ENABLED = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter = null;
if (MAIL_ENABLED) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    // 465 is implicit TLS; 587 opens plain and upgrades via STARTTLS, which nodemailer does on
    // its own when secure is false.
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
} else {
  console.warn('Email disabled: set SMTP_USER and SMTP_PASS to enable password reset emails.');
}

/**
 * Sends one message. Throws on failure rather than swallowing it: the caller decides what the
 * user is told, and for a password reset "we sent it" must never be printed over a send that
 * actually failed.
 */
export async function sendMail({ to, subject, text, html }) {
  if (!transporter) throw new Error('Envoi d\'email non configuré sur le serveur');
  return transporter.sendMail({ from: MAIL_FROM, to, subject, text, html });
}

// Checks the relay accepts our credentials, so a misconfiguration shows up in the boot log rather
// than the first time someone is locked out of their account.
export async function verifyMailer() {
  if (!transporter) return false;
  try {
    await transporter.verify();
    console.log(`Email ready: ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_USER}`);
    return true;
  } catch (err) {
    console.error('Email misconfigured, password reset will fail:', err.message);
    return false;
  }
}
