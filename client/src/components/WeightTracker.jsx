import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';

const RANGES = [
  { key: '7', label: '7 jours' },
  { key: '14', label: '14 jours' },
  { key: '30', label: '30 jours' },
  { key: '60', label: '60 jours' },
  { key: '90', label: '90 jours' },
  { key: 'week', label: 'Cette semaine' },
];

const ANGLES = [
  { key: 'front', label: 'Face' },
  { key: 'back', label: 'Dos' },
  { key: 'side', label: 'Profil' },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function MetricChart({ series }) {
  if (!series || series.length < 2) return null;
  const width = 320;
  const height = 90;
  const values = series.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = span * 0.15;
  const toY = (v) => height - ((v - min + pad) / (span + pad * 2)) * height;
  const stepX = series.length > 1 ? width / (series.length - 1) : 0;
  const points = series.map((d, i) => `${i * stepX},${toY(d.value)}`).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="mini-chart">
      <polyline points={points} fill="none" stroke="var(--acc)" strokeWidth="2" />
    </svg>
  );
}

function MetricBlock({ title, unit, stats, decimals = 1 }) {
  if (!stats) return null;
  return (
    <div className="result">
      <h2>{title}</h2>
      <div className="res-line">
        <span>Dernière valeur</span>
        <b>
          {stats.last.toFixed(decimals)} {unit}
        </b>
      </div>
      <div className="res-line">
        <span>Évolution sur la période</span>
        <b>
          {stats.delta >= 0 ? '+' : ''}
          {stats.delta.toFixed(decimals)} {unit}
        </b>
      </div>
      <div className="res-line">
        <span>Min / Max</span>
        <b>
          {stats.min.toFixed(decimals)} / {stats.max.toFixed(decimals)} {unit}
        </b>
      </div>
      <div className="res-line total">
        <span>Rythme moyen</span>
        <b>
          {stats.weeklyRate >= 0 ? '+' : ''}
          {stats.weeklyRate.toFixed(2)} {unit}/semaine
        </b>
      </div>
      <MetricChart series={stats.series} />
    </div>
  );
}

function PhotoCompare({ photos, angle, label }) {
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
              <span>Avant · {oldest.date}</span>
            </div>
          </div>
          <div className="photo-tile">
            <img src={newest.url} alt={newest.date} />
            <div className="photo-tile-footer">
              <span>Après · {newest.date}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WeightTracker() {
  const [range, setRange] = useState('30');
  const [logs, setLogs] = useState([]);
  const [report, setReport] = useState(null);
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
    const [logsData, reportData, photosData] = await Promise.all([
      api.getWeightLogs(range),
      api.getWeightReport(range),
      api.getWeightPhotos(range),
    ]);
    setLogs(logsData);
    setReport(reportData);
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
      setError('Poids invalide — utilise un point pour les décimales (ex: 81.2)');
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
      setError(err.message || "Échec de l'enregistrement");
      return;
    }
    setWeight('');
    setBodyFat('');
    setWaist('');
    // Reset to today so forgetting to re-pick the date before the next save can only
    // ever re-save today's entry, instead of silently overwriting the previous date's row.
    setDate(todayStr());
    setSavedMessage(`Enregistré pour le ${savedDate}`);
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
      <h2>Poids</h2>
      <div className="card">
        <form className="stack-form" onSubmit={handleSubmit}>
          <div className="inline-row">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <input
              type="text"
              inputMode="decimal"
              placeholder="Poids (kg)"
              value={weight}
              onChange={decimalInput(setWeight)}
              required
            />
          </div>
          <div className="inline-row">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Masse grasse % (optionnel)"
              value={bodyFat}
              onChange={decimalInput(setBodyFat)}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="Tour de taille cm (optionnel)"
              value={waist}
              onChange={decimalInput(setWaist)}
            />
          </div>
          <button type="submit" className="btn btn-small">
            Enregistrer
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
            + Importer des photos
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

      {loading && <p className="hint">Chargement…</p>}

      {!loading && report?.insufficientData && (
        <div className="card">
          <p className="hint">
            Ajoute au moins 2 pesées dans cette période pour voir l'évolution
            {report.daysLogged > 0 ? ` (${report.daysLogged} pour l'instant)` : ''}.
          </p>
        </div>
      )}

      {!loading && report && !report.insufficientData && (
        <>
          <MetricBlock title="Poids" unit="kg" stats={report.weight} />
          <MetricBlock title="Masse grasse" unit="%" stats={report.bodyFat} />
          <MetricBlock title="Tour de taille" unit="cm" stats={report.waist} />
        </>
      )}

      {logs.length > 0 && (
        <>
          <h2>Historique</h2>
          <div className="card">
            {logs
              .slice()
              .reverse()
              .map((l) => (
                <div className="row" key={l.id}>
                  <div className="name">
                    <span>{l.date}</span>
                    <span className="rate">
                      {l.body_fat_pct != null ? `${l.body_fat_pct}% MG` : ''}
                      {l.body_fat_pct != null && l.waist_cm != null ? ' · ' : ''}
                      {l.waist_cm != null ? `${l.waist_cm} cm` : ''}
                    </span>
                  </div>
                  <div className="field">
                    <b>{l.weight_kg.toFixed(1)} kg</b>
                    <button className="btn-ghost" onClick={() => handleDeleteLog(l.id)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {photos.length > 0 && (
        <>
          <h2>Avant / Après</h2>
          <div className="card">
            {ANGLES.map((a) => (
              <PhotoCompare key={a.key} photos={photos} angle={a.key} label={a.label} />
            ))}
          </div>

          <h2>Toutes les photos</h2>
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
