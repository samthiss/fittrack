import { useLanguage } from '../i18n/LanguageContext';

export default function BottomTabBar({ view, onChange }) {
  const { t } = useLanguage();
  const TABS = [
    { key: 'journal', label: t('nav.journal'), icon: '📖' },
    { key: 'recettes', label: t('nav.recipes'), icon: '🍳' },
    { key: 'rapport', label: t('nav.report'), icon: '📊' },
    { key: 'planning', label: t('nav.planning'), icon: '🗓️' },
    { key: 'reglages', label: t('nav.settings'), icon: '⚙️' },
  ];

  return (
    <nav className="bottom-tabs">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          className={view === tab.key ? 'bottom-tab active' : 'bottom-tab'}
          onClick={() => onChange(tab.key)}
        >
          <span className="bottom-tab-icon">{tab.icon}</span>
          <span className="bottom-tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
