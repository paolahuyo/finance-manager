import { useTranslation } from 'react-i18next';
import { LANGUAGES, saveLanguage, type Language } from '../i18n';

export default function LanguageSwitcher(): JSX.Element {
  const { i18n, t } = useTranslation();

  const choose = (language: Language): void => {
    void i18n.changeLanguage(language);
    saveLanguage(language);
  };

  return (
    <div role="group" aria-label={t('app.language')} className="flex rounded-md overflow-hidden border border-blue-300 text-sm">
      {LANGUAGES.map(language => (
        <button
          key={language}
          onClick={() => choose(language)}
          aria-pressed={i18n.language === language}
          className={`px-3 py-1 font-medium ${
            i18n.language === language ? 'bg-white text-blue-700' : 'bg-blue-600 text-blue-100 hover:bg-blue-500'
          }`}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
