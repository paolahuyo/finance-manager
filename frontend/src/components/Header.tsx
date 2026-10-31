import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

export default function Header(): JSX.Element {
  const { t } = useTranslation();
  return (
    <header className="bg-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">💰 {t('app.title')}</h1>
          <p className="text-blue-100 mt-2">{t('app.tagline')}</p>
        </div>
        <LanguageSwitcher />
      </div>
    </header>
  );
}
