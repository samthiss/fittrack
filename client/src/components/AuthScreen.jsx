import { useState, useEffect } from 'react';
import { api } from '../api';
import { useLanguage } from '../i18n/LanguageContext';

export default function AuthScreen({ onAuthenticated }) {
  const { t } = useLanguage();
  const [legacyClaimed, setLegacyClaimed] = useState(true);
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const TABS = [
    { key: 'login', label: t('auth.login') },
    { key: 'register', label: t('auth.register') },
  ];

  useEffect(() => {
    api
      .getLegacyStatus()
      .then((s) => setLegacyClaimed(s.claimed))
      .catch(() => setLegacyClaimed(true));
  }, []);

  // The very first account created on a fresh install "claims" the pre-existing data (recipes,
  // journal, weight...) instead of starting empty — after that, it's a normal signup.
  const isClaimFlow = !legacyClaimed && tab === 'register';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || password.length < 8) {
      setStatus({ text: t('auth.requiredFields'), error: true });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const account = isClaimFlow
        ? await api.claimLegacy(email.trim(), password)
        : tab === 'login'
          ? await api.login(email.trim(), password)
          : await api.register(email.trim(), password);
      onAuthenticated(account);
    } catch (err) {
      setStatus({ text: err.message || t('auth.genericError'), error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <div className="shell">
        <main className="app-main" style={{ paddingTop: 40 }}>
          <h1 style={{ textAlign: 'center' }}>FitTrack</h1>

          <div className="view-toggle">
            {TABS.map((tb) => (
              <button key={tb.key} type="button" className={tab === tb.key ? 'active' : ''} onClick={() => setTab(tb.key)}>
                {tb.label}
              </button>
            ))}
          </div>

          {isClaimFlow && (
            <p className="hint" style={{ marginTop: 10 }}>
              {t('auth.claimFlowHint')}
            </p>
          )}

          <form onSubmit={handleSubmit} className="card" style={{ marginTop: 14 }}>
            <div className="row">
              <label>{t('auth.email')}</label>
              <div className="field">
                <input
                  type="email"
                  className="wide"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>
            <div className="row">
              <label>{t('auth.password')}</label>
              <div className="field">
                <input
                  type="password"
                  className="wide"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  required
                />
              </div>
            </div>
            <div className="card-actions">
              <button type="submit" className="btn btn-block" disabled={loading}>
                {loading
                  ? t('auth.submitting')
                  : isClaimFlow
                    ? t('auth.claimSubmit')
                    : tab === 'login'
                      ? t('auth.login')
                      : t('auth.registerSubmit')}
              </button>
            </div>
            {status && <p className={status.error ? 'hint error' : 'hint success'}>{status.text}</p>}
          </form>
        </main>
      </div>
    </div>
  );
}
