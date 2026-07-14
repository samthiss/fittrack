import { useState, useEffect } from 'react';

const OPTIONS = [
  { value: 500, label: '−500 · ~0,45 kg/sem' },
  { value: 750, label: '−750 · ~0,65 kg/sem' },
  { value: 1000, label: '−1000 · ~0,85 kg/sem' },
];

export default function DeficitSelect({ profile, onSave }) {
  const [value, setValue] = useState(750);

  useEffect(() => {
    if (profile?.goal_kcal) setValue(profile.goal_kcal);
  }, [profile]);

  function handleChange(e) {
    const next = Number(e.target.value);
    setValue(next);
    onSave({ goal: 'lose', goal_kcal: next });
  }

  return (
    <div>
      <h2>Déficit visé</h2>
      <div className="card">
        <div className="row">
          <label htmlFor="deficit">Déficit visé</label>
          <div className="field">
            <select id="deficit" value={value} onChange={handleChange}>
              {OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
