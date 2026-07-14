import { useState } from 'react';
import { api } from '../api';
import { useLanguage } from '../i18n/LanguageContext';

export default function AccountSettings({ email, mustChangePassword, onLogout }) {
  const { t, lang, setLang } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleChangePassword(e) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setStatus({ text: t('account.passwordTooShort'), error: true });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setStatus({ text: t('account.passwordUpdated'), error: false });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setStatus({ text: err.message || t('account.passwordChangeFailed'), error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>{t('account.title')}</h2>
      <div className="card">
        <div className="row">
          <div className="name">
            <span>{email}</span>
          </div>
        </div>

        <div className="row">
          <div className="name">
            <span>{t('account.language')}</span>
          </div>
          <div className="field">
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {mustChangePassword && (
          <p className="hint error" style={{ marginTop: 8 }}>
            {t('account.mustChangePassword')}
          </p>
        )}

        <form onSubmit={handleChangePassword} style={{ marginTop: 10 }}>
          <div className="row">
            <label>{t('account.currentPassword')}</label>
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
            <label>{t('account.newPassword')}</label>
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
              {loading ? t('common.saving') : t('account.changePassword')}
            </button>
          </div>
          {status && <p className={status.error ? 'hint error' : 'hint success'}>{status.text}</p>}
        </form>

        <div className="card-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn-ghost" onClick={onLogout}>
            {t('account.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
