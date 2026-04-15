'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { LanguageSelector, type Language } from './LanguageSelector';
import { useUser } from '@/hooks/useUser';

export function Header() {
  const t = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { selectedChild } = useUser();

  const handleLanguageChange = (newLang: Language) => {
    router.replace(pathname, { locale: newLang });
  };

  const initial = selectedChild?.name?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 pt-safe-top glass-header">
      <div className="px-5 pb-3 flex items-center justify-between">
        <div className="flex flex-col mt-2">
          <h2
            className="text-transparent bg-clip-text gold-gradient-text drop-shadow-[0_2px_4px_rgba(255,215,0,0.3)] text-2xl font-black tracking-tight transition-transform hover:scale-105"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {t('title')}
          </h2>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <LanguageSelector value={locale as Language} onChange={handleLanguageChange} />
          <button
            onClick={() => router.push('/pick-child')}
            className="w-10 h-10 rounded-full border-2 border-white/20 shadow-md overflow-hidden active:scale-95 transition-transform gold-gradient-bg flex items-center justify-center"
          >
            <span className="text-sm font-black text-[#1a0533]">{initial}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
