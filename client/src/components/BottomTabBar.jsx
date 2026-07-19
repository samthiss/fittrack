import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

export default function BottomTabBar({ view, onChange }) {
  const { t } = useLanguage();
  const TABS = [
    { key: 'journal', label: t('nav.journal'), icon: 'book-open' },
    { key: 'recettes', label: t('nav.recipes'), icon: 'utensils' },
    { key: 'rapport', label: t('nav.report'), icon: 'bar-chart-3' },
    { key: 'planning', label: t('nav.planning'), icon: 'calendar' },
    { key: 'reglages', label: t('nav.settings'), icon: 'settings' },
  ];

  return (
    <nav className="bottom-tabs">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          className={view === tab.key ? 'bottom-tab active' : 'bottom-tab'}
          onClick={() => onChange(tab.key)}
        >
          <span className="bottom-tab-icon">
            <Icon name={tab.icon} size={22} color={view === tab.key ? 'var(--accent)' : 'var(--text-muted)'} />
          </span>
          <span className="bottom-tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
