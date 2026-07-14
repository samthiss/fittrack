import { useState } from 'react';
import TodayReport from './TodayReport';
import WeekReport from './WeekReport';

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

const VIEWS = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'yesterday', label: 'Hier' },
  { key: 'week-current', label: 'Semaine en cours' },
  { key: 'week-past', label: 'Semaine passée' },
  { key: 'month', label: 'Mois passé' },
  { key: 'quarter', label: 'Dernier trimestre' },
];

export default function Report() {
  const [activeView, setActiveView] = useState('today');
  const [menuOpen, setMenuOpen] = useState(false);

  const current = VIEWS.find((v) => v.key === activeView);

  function selectView(key) {
    setActiveView(key);
    setMenuOpen(false);
  }

  return (
    <div>
      <h2>Rapport</h2>
      <div className="view-picker">
        <button type="button" className="view-picker-btn" onClick={() => setMenuOpen((o) => !o)}>
          <span>{current.label}</span>
          <span className="view-picker-chevron">{menuOpen ? '▴' : '▾'}</span>
        </button>
        {menuOpen && (
          <div className="view-picker-list">
            {VIEWS.filter((v) => v.key !== activeView).map((v) => (
              <button key={v.key} type="button" className="view-picker-item" onClick={() => selectView(v.key)}>
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeView === 'today' && <TodayReport />}
      {activeView === 'yesterday' && <TodayReport date={yesterdayStr()} />}
      {activeView === 'week-current' && <WeekReport period="current" />}
      {activeView === 'week-past' && <WeekReport period="past" />}
      {activeView === 'month' && <WeekReport period="month" />}
      {activeView === 'quarter' && <WeekReport period="quarter" />}
    </div>
  );
}
