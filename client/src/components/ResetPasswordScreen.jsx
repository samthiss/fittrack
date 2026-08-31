import { useState, useEffect } from 'react';
import { api } from '../api';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * The screen a reset link lands on (/?reset=<token>). Shown before the login screen and without a
 * session — someone who has forgotten their password has no way to get one.
 *
 * The token is checked before the form is drawn rather than after the password is typed: an
 * expired link is far and away the common failure here (they last an hour), and finding that out
 * only after choosing a password is how a locked-out user gives up.
 */
export default function ResetPasswordScreen({ token, onDone }) {
  const { t } = useLanguage();
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .checkResetToken(token)
      .then((r) => setValid(r.valid))
      .catch(() => setValid(false))
      .finally(() => setChecking(false));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) {
      setStatus({ text: t('reset.tooShort'), error: true });
      return;
    }
    if (password !== confirm) {
      setStatus({ text: t('reset.mismatch'), error: true });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setStatus({ text: err.message || t('auth.genericError'), error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <div className="shell">
        <main className="app-main" style={{ paddingTop: 40 }}>
          <h1 style={{ textAlign: 'center' }}>FitTrack</h1>

          {checking && <p className="hint">{t('reset.checking')}</p>}

          {!checking && !valid && !done && (
            <div className="card" style={{ marginTop: 14 }}>
              <p className="hint error">{t('reset.invalid')}</p>
              <div className="card-actions">
                <button type="button" className="btn btn-block" onClick={onDone}>
                  {t('reset.backToLogin')}
                </button>
              </div>
            </div>
          )}

          {done && (
            <div className="card" style={{ marginTop: 14 }}>
              <p className="hint success">{t('reset.success')}</p>
              <div className="card-actions">
                <button type="button" className="btn btn-block" onClick={onDone}>
                  {t('reset.backToLogin')}
                </button>
              </div>
            </div>
          )}

          {!checking && valid && !done && (
            <form onSubmit={handleSubmit} className="card" style={{ marginTop: 14 }}>
              <p className="hint" style={{ marginTop: 0 }}>{t('reset.intro')}</p>
              <div className="row">
                <label>{t('reset.newPassword')}</label>
                <div className="field">
                  <input
                    type="password"
                    className="wide"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
              <div className="row">
                <label>{t('reset.confirmPassword')}</label>
                <div className="field">
                  <input
                    type="password"
                    className="wide"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
              <div className="card-actions">
                <button type="submit" className="btn btn-block" disabled={saving}>
                  {saving ? t('auth.submitting') : t('reset.submit')}
                </button>
              </div>
              {status && <p className={status.error ? 'hint error' : 'hint success'}>{status.text}</p>}
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
