import { useState } from 'react';
import { api } from '../api';

export default function AccountSettings({ email, mustChangePassword, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleChangePassword(e) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setStatus({ text: 'Le nouveau mot de passe doit faire au moins 8 caractères.', error: true });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setStatus({ text: 'Mot de passe mis à jour.', error: false });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setStatus({ text: err.message || 'Échec du changement de mot de passe.', error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Compte</h2>
      <div className="card">
        <div className="row">
          <div className="name">
            <span>{email}</span>
          </div>
        </div>

        {mustChangePassword && (
          <p className="hint error" style={{ marginTop: 8 }}>
            Pense à définir ton propre mot de passe ci-dessous.
          </p>
        )}

        <form onSubmit={handleChangePassword} style={{ marginTop: 10 }}>
          <div className="row">
            <label>Mot de passe actuel</label>
            <div className="field">
              <input
                type="password"
                className="wide"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>
          <div className="row">
            <label>Nouveau mot de passe</label>
            <div className="field">
              <input
                type="password"
                className="wide"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="card-actions">
            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Enregistrement…' : 'Changer le mot de passe'}
            </button>
          </div>
          {status && <p className={status.error ? 'hint error' : 'hint success'}>{status.text}</p>}
        </form>

        <div className="card-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn-ghost" onClick={onLogout}>
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
