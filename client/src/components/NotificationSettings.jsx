import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';
import { pushSupported, isStandalone, currentSubscription, enablePush, disablePush } from '../data/push';

/**
 * Turning reminders on for this device. Kept honest about the three ways it can be unavailable —
 * an unsupported browser, an iPhone running the app from Safari instead of the Home Screen, and a
 * server with no VAPID keys — because "nothing happens" is the worst possible answer here.
 */
export default function NotificationSettings() {
  const { t } = useLanguage();
  const [status, setStatus] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const supported = pushSupported();
  // Safari on iOS exposes the APIs but refuses to subscribe; only the installed app can.
  const iosNeedsInstall = supported && !isStandalone() && /iPhone|iPad|iPod/.test(navigator.userAgent);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.getPushStatus());
      setSubscribed(Boolean(await currentSubscription()));
    } catch (e) {
      setError(e.message || String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(action, successMessage) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (successMessage) setNotice(successMessage);
      await refresh();
    } catch (e) {
      setError(e.message || String(e));
    }
    setBusy(false);
  }

  return (
    <div>
      <h4 className="section-label" style={{ marginTop: 0 }}>{t('push.deviceTitle')}</h4>

      {!supported && <p className="hint">{t('push.unsupported')}</p>}
      {iosNeedsInstall && <p className="hint">{t('push.iosInstall')}</p>}
      {status && !status.enabled && <p className="hint">{t('push.serverOff')}</p>}

      {supported && status?.enabled && (
        <div className="card">
          <div className="row">
            <span className="row-icon-box weight-icon-box">
              <Icon name={subscribed ? 'bell' : 'bell-off'} size={20} />
            </span>
            <div className="name">
              {subscribed ? t('push.on') : t('push.off')}
              <div className="hint" style={{ padding: 0 }}>
                {t('push.devices').replace('{count}', status.devices)}
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <p className="hint error">{error}</p>}
      {notice && <p className="hint success">{notice}</p>}

      {supported && status?.enabled && (
        <>
          {!subscribed ? (
            <button
              type="button"
              className="meal-add-cta"
              style={{ marginTop: 16 }}
              disabled={busy}
              onClick={() => run(enablePush, t('push.enabled'))}
            >
              <Icon name="bell" size={19} />
              {t('push.enable')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="meal-add-cta"
                style={{ marginTop: 16 }}
                disabled={busy}
                onClick={() => run(() => api.sendTestPush(), t('push.testSent'))}
              >
                <Icon name="send" size={19} />
                {t('push.test')}
              </button>
              <button
                type="button"
                className="btn btn-block btn-block-secondary"
                style={{ marginTop: 10 }}
                disabled={busy}
                onClick={() => run(disablePush, t('push.disabled'))}
              >
                {t('push.disable')}
              </button>
            </>
          )}
        </>
      )}

      <p className="hint" style={{ marginTop: 18 }}>{t('push.hint')}</p>
    </div>
  );
}
