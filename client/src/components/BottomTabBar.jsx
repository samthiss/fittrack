const TABS = [
  { key: 'journal', label: 'Journal', icon: '📖' },
  { key: 'recettes', label: 'Recettes', icon: '🍳' },
  { key: 'rapport', label: 'Rapport', icon: '📊' },
  { key: 'planning', label: 'Planning', icon: '🗓️' },
  { key: 'reglages', label: 'Réglages', icon: '⚙️' },
];

export default function BottomTabBar({ view, onChange }) {
  return (
    <nav className="bottom-tabs">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={view === t.key ? 'bottom-tab active' : 'bottom-tab'}
          onClick={() => onChange(t.key)}
        >
          <span className="bottom-tab-icon">{t.icon}</span>
          <span className="bottom-tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
