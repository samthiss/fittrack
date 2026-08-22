import { useState } from 'react';
import TodayReport from './TodayReport';
import WeekReport from './WeekReport';
import MuscleVolumeReport from './MuscleVolumeReport';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';
import { todayStr, shiftDateStr } from '../data/dates';

function yesterdayStr() {
  return shiftDateStr(todayStr(), -1);
}

export default function Report({ onOpenRichFoods }) {
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
    { key: 'strength', label: t('report.viewStrength') },
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

      {activeView === 'today' && <TodayReport onOpenRichFoods={onOpenRichFoods} />}
      {activeView === 'yesterday' && <TodayReport date={yesterdayStr()} onOpenRichFoods={onOpenRichFoods} />}
      {activeView === 'week-current' && <WeekReport period="current" onOpenRichFoods={onOpenRichFoods} />}
      {activeView === 'week-past' && <WeekReport period="past" onOpenRichFoods={onOpenRichFoods} />}
      {activeView === 'month' && <WeekReport period="month" onOpenRichFoods={onOpenRichFoods} />}
      {activeView === 'quarter' && <WeekReport period="quarter" onOpenRichFoods={onOpenRichFoods} />}
      {activeView === 'strength' && <MuscleVolumeReport />}
    </div>
  );
}
