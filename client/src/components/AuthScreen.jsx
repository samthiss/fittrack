import { useState, useEffect } from 'react';
import { api } from '../api';

const TABS = [
  { key: 'login', label: 'Se connecter' },
  { key: 'register', label: 'Créer un compte' },
];

export default function AuthScreen({ onAuthenticated }) {
  const [legacyClaimed, setLegacyClaimed] = useState(true);
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

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
      setStatus({ text: 'Email et mot de passe (8 caractères minimum) requis.', error: true });
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
      setStatus({ text: err.message || 'Échec.', error: true });
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
            {TABS.map((t) => (
              <button key={t.key} type="button" className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {isClaimFlow && (
            <p className="hint" style={{ marginTop: 10 }}>
              Premier compte sur cette installation — il récupère automatiquement les données déjà présentes
              (aliments, recettes, journal, poids...).
            </p>
          )}

          <form onSubmit={handleSubmit} className="card" style={{ marginTop: 14 }}>
            <div className="row">
              <label>Email</label>
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
              <label>Mot de passe</label>
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
                  ? 'Un instant…'
                  : isClaimFlow
                    ? 'Créer mon compte et récupérer mes données'
                    : tab === 'login'
                      ? 'Se connecter'
                      : 'Créer le compte'}
              </button>
            </div>
            {status && <p className={status.error ? 'hint error' : 'hint success'}>{status.text}</p>}
          </form>
        </main>
      </div>
    </div>
  );
}
