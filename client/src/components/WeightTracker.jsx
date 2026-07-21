import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useLanguage } from '../i18n/LanguageContext';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function PhotoCompare({ photos, angle, label, t }) {
  const list = photos.filter((p) => p.angle === angle);
  if (list.length === 0) return null;
  const oldest = list[list.length - 1];
  const newest = list[0];

  return (
    <div className="compare-block">
      <h3>{label}</h3>
      {list.length === 1 ? (
        <div className="photo-tile compare-single">
          <img src={newest.url} alt={newest.date} />
          <div className="photo-tile-footer">
            <span>{newest.date}</span>
          </div>
        </div>
      ) : (
        <div className="compare-pair">
          <div className="photo-tile">
            <img src={oldest.url} alt={oldest.date} />
            <div className="photo-tile-footer">
              <span>{t('weight.before')} · {oldest.date}</span>
            </div>
          </div>
          <div className="photo-tile">
            <img src={newest.url} alt={newest.date} />
            <div className="photo-tile-footer">
              <span>{t('weight.after')} · {newest.date}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WeightTracker() {
  const { t } = useLanguage();
  const RANGES = [
    { key: '7', label: t('weight.range7') },
    { key: '14', label: t('weight.range14') },
    { key: '30', label: t('weight.range30') },
    { key: '60', label: t('weight.range60') },
    { key: '90', label: t('weight.range90') },
    { key: 'week', label: t('weight.rangeWeek') },
  ];
  const ANGLES = [
    { key: 'front', label: t('weight.angleFront') },
    { key: 'back', label: t('weight.angleBack') },
    { key: 'side', label: t('weight.angleSide') },
  ];
  const [range, setRange] = useState('30');
  const [logs, setLogs] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [date, setDate] = useState(todayStr());
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [waist, setWaist] = useState('');
  const [photoAngle, setPhotoAngle] = useState('front');
  const [savedMessage, setSavedMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // iPhones with a French keyboard type "," as the decimal separator, which a native
  // <input type=number> silently rejects (empty value, no error) — normalize to "." on input.
  function decimalInput(setter) {
    return (e) => setter(e.target.value.replace(',', '.'));
  }
  const fileInputRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [logsData, photosData] = await Promise.all([api.getWeightLogs(range), api.getWeightPhotos(range)]);
    setLogs(logsData);
    setPhotos(photosData);
    setLoading(false);
  }, [range]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const weightNum = Number(weight);
    if (!weight || Number.isNaN(weightNum) || weightNum <= 0) {
      setError(t('weight.invalidWeight'));
      return;
    }
    const savedDate = date;
    try {
      await api.addWeightLog({
        date,
        weight_kg: weightNum,
        body_fat_pct: bodyFat,
        waist_cm: waist,
      });
    } catch (err) {
      setError(err.message || t('weight.saveFailed'));
      return;
    }
    setWeight('');
    setBodyFat('');
    setWaist('');
    // Reset to today so forgetting to re-pick the date before the next save can only
    // ever re-save today's entry, instead of silently overwriting the previous date's row.
    setDate(todayStr());
    setSavedMessage(t('weight.savedFor').replace('{date}', savedDate));
    setTimeout(() => setSavedMessage(null), 3000);

    // If the saved date falls outside the currently displayed period, the entry would
    // silently vanish from view (e.g. saving 40 days back while "30 jours" is selected) —
    // widen the range so what was just saved is immediately visible.
    const daysAgo = Math.round(
      (new Date(`${todayStr()}T00:00:00Z`) - new Date(`${savedDate}T00:00:00Z`)) / 86400000
    );
    const numericRanges = [7, 14, 30, 60, 90];
    const currentSpan = range === 'week' ? 7 : Number(range);
    if (daysAgo > currentSpan) {
      const nextRange = numericRanges.find((n) => n >= daysAgo) || 90;
      setRange(String(nextRange));
    } else {
      await refresh();
    }
  }

  async function handleDeleteLog(id) {
    await api.deleteWeightLog(id);
    await refresh();
  }

  async function handlePhotoChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await api.uploadWeightPhotos(files, date, photoAngle);
    e.target.value = '';
    await refresh();
  }

  async function handleDeletePhoto(id) {
    await api.deleteWeightPhoto(id);
    await refresh();
  }

  return (
    <div>
      <h2>{t('weight.title')}</h2>
      <div className="card">
        <form className="stack-form" onSubmit={handleSubmit}>
          <div className="inline-row">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <input
              type="text"
              inputMode="decimal"
              placeholder={t('weight.weightPlaceholder')}
              value={weight}
              onChange={decimalInput(setWeight)}
              required
            />
          </div>
          <div className="inline-row">
            <input
              type="text"
              inputMode="decimal"
              placeholder={t('weight.bodyFatPlaceholder')}
              value={bodyFat}
              onChange={decimalInput(setBodyFat)}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder={t('weight.waistPlaceholder')}
              value={waist}
              onChange={decimalInput(setWaist)}
            />
          </div>
          <button type="submit" className="btn btn-small">
            {t('weight.save')}
          </button>
          {savedMessage && <p className="hint success">✓ {savedMessage}</p>}
          {error && <p className="hint error">{error}</p>}
        </form>

        <div className="inline-row">
          <select value={photoAngle} onChange={(e) => setPhotoAngle(e.target.value)}>
            {ANGLES.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={() => fileInputRef.current?.click()}>
            {t('weight.importPhotos')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handlePhotoChange}
          />
        </div>
      </div>

      <div className="card">
        <div className="inline-row">
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="hint">{t('weight.loading')}</p>}

      {logs.length > 0 && (
        <>
          <h2>{t('weight.history')}</h2>
          <div className="card">
            {logs
              .slice()
              .reverse()
              .map((l) => (
                <div className="row" key={l.id}>
                  <div className="name">
                    <span>{l.date}</span>
                    <span className="rate">
                      {l.body_fat_pct != null ? `${l.body_fat_pct}% ${t('weight.bodyFatShort')}` : ''}
                      {l.body_fat_pct != null && l.waist_cm != null ? ' · ' : ''}
                      {l.waist_cm != null ? `${l.waist_cm} cm` : ''}
                    </span>
                  </div>
                  <div className="field">
                    <b>{l.weight_kg.toFixed(1)} kg</b>
                    <button className="btn-ghost" onClick={() => handleDeleteLog(l.id)}>
                      {t('weight.delete')}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {photos.length > 0 && (
        <>
          <h2>{t('weight.beforeAfter')}</h2>
          <div className="card">
            {ANGLES.map((a) => (
              <PhotoCompare key={a.key} photos={photos} angle={a.key} label={a.label} t={t} />
            ))}
          </div>

          <h2>{t('weight.allPhotos')}</h2>
          <div className="photo-grid">
            {photos.map((p) => (
              <div className="photo-tile" key={p.id}>
                <img src={p.url} alt={p.date} />
                <div className="photo-tile-footer">
                  <span>
                    {ANGLES.find((a) => a.key === p.angle)?.label} · {p.date}
                  </span>
                  <button className="btn-ghost" onClick={() => handleDeletePhoto(p.id)}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
