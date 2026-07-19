import { useState } from 'react';
import TodayReport from './TodayReport';
import WeekReport from './WeekReport';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function Report() {
  const { t } = useLanguage();
  const [activeView, setActiveView] = useState('today');
  const [menuOpen, setMenuOpen] = useState(false);

  const VIEWS = [
    { key: 'today', label: t('report.viewToday') },
    { key: 'yesterday', label: t('report.viewYesterday') },
    { key: 'week-current', label: t('report.viewWeekCurrent') },
    { key: 'week-past', label: t('report.viewWeekPast') },
    { key: 'month', label: t('report.viewMonth') },
    { key: 'quarter', label: t('report.viewQuarter') },
  ];

  const current = VIEWS.find((v) => v.key === activeView);

  function selectView(key) {
    setActiveView(key);
    setMenuOpen(false);
  }

  return (
    <div>
      <h2>{t('report.title')}</h2>
      <div className="view-picker">
        <button type="button" className="view-picker-btn" onClick={() => setMenuOpen((o) => !o)}>
          <Icon name="calendar-days" size={19} color="var(--acc)" />
          <span className="view-picker-label">{current.label}</span>
          <span className="view-picker-chevron">
            <Icon name={menuOpen ? 'chevron-up' : 'chevron-down'} size={18} color="var(--text-muted)" />
          </span>
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
