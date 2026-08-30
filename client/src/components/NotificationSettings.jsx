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
export default function NotificationSettings({ profile, onSaveProfile }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [morning, setMorning] = useState(profile?.reminder_morning_at || '08:00');
  const [evening, setEvening] = useState(profile?.reminder_evening_at || '20:00');
  const [morningOn, setMorningOn] = useState(Boolean(profile?.reminder_morning_at));
  const [eveningOn, setEveningOn] = useState(Boolean(profile?.reminder_evening_at));
  const [repeat, setRepeat] = useState(Boolean(profile?.reminder_repeat));

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

      {subscribed && (
        <>
          <h4 className="section-label">{t('push.scheduleTitle')}</h4>
          <div className="card">
            <div className="row">
              <span className="row-icon-box weight-icon-box">
                <Icon name="sunrise" size={20} />
              </span>
              <label className="name" htmlFor="reminder-morning">{t('supplements.moment_matin')}</label>
              <div className="field">
                <input
                  id="reminder-morning"
                  type="time"
                  value={morning}
                  disabled={!morningOn}
                  onChange={(e) => setMorning(e.target.value)}
                />
                <input
                  type="checkbox"
                  checked={morningOn}
                  aria-label={t('supplements.moment_matin')}
                  onChange={(e) => setMorningOn(e.target.checked)}
                />
              </div>
            </div>
            <div className="row">
              <span className="row-icon-box weight-icon-box">
                <Icon name="moon" size={20} />
              </span>
              <label className="name" htmlFor="reminder-evening">{t('supplements.moment_soir')}</label>
              <div className="field">
                <input
                  id="reminder-evening"
                  type="time"
                  value={evening}
                  disabled={!eveningOn}
                  onChange={(e) => setEvening(e.target.value)}
                />
                <input
                  type="checkbox"
                  checked={eveningOn}
                  aria-label={t('supplements.moment_soir')}
                  onChange={(e) => setEveningOn(e.target.checked)}
                />
              </div>
            </div>
            <div className="row">
              <span className="row-icon-box weight-icon-box">
                <Icon name="repeat" size={20} />
              </span>
              <label className="name" htmlFor="reminder-repeat">
                {t('push.repeat')}
                <div className="hint" style={{ padding: 0 }}>{t('push.repeatHint')}</div>
              </label>
              <div className="field">
                <input
                  id="reminder-repeat"
                  type="checkbox"
                  checked={repeat}
                  onChange={(e) => setRepeat(e.target.checked)}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            className="meal-add-cta"
            style={{ marginTop: 16 }}
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  onSaveProfile({
                    reminder_morning_at: morningOn ? morning : null,
                    reminder_evening_at: eveningOn ? evening : null,
                    // Sent with every save: the server schedules in the user's own wall clock,
                    // and this is the only place that knows what it is.
                    reminder_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    reminder_repeat: repeat,
                  }),
                t('push.scheduleSaved')
              )
            }
          >
            <Icon name="check" size={19} />
            {t('meal.save')}
          </button>

          <p className="hint">{t('push.scheduleHint')}</p>
        </>
      )}

      <p className="hint" style={{ marginTop: 18 }}>{t('push.hint')}</p>
    </div>
  );
}
