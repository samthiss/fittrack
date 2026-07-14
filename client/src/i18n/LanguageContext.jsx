import { createContext, useContext, useState, useCallback } from 'react';
import { translations } from './translations';

const STORAGE_KEY = 'fittrack-lang';
const LanguageContext = createContext(null);

function getInitialLang() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return stored === 'en' ? 'en' : 'fr';
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(getInitialLang);

  const setLang = useCallback((next) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  // Falls back to the French string (and finally the key itself) so a key missing from the
  // English dictionary never renders blank — a partial translation degrades gracefully instead
  // of silently hiding UI.
  const t = useCallback(
    (key) => translations[lang]?.[key] ?? translations.fr[key] ?? key,
    [lang]
  );

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
