'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { LanguageSelector, type Language } from './LanguageSelector';

export function Header() {
  const t = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const handleLanguageChange = (newLang: Language) => {
    router.replace(pathname, { locale: newLang });
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 pt-safe-top bg-white border-b-0">
      <div className="px-5 pb-3 flex items-center justify-between">
        <div className="flex flex-col mt-2">
          <h2 className="text-[#FF85A1] drop-shadow-sm text-2xl font-black tracking-tight" style={{ fontFamily: '"Quicksand", sans-serif' }}>
            {t('title')}
          </h2>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <LanguageSelector value={locale as Language} onChange={handleLanguageChange} />
          <button className="w-10 h-10 rounded-full border-2 border-white shadow-md overflow-hidden active:scale-95 transition-transform bg-[#F0E6FF]">
            <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Princess&backgroundColor=F0E6FF" alt="Child Profile" className="w-full h-full object-cover scale-110" />
          </button>
        </div>
      </div>
      
      {/* Scalloped Wavy Bottom edge */}
      <div className="absolute top-full left-0 right-0 w-full overflow-hidden leading-[0]">
        <svg data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none" className="block w-full h-[12px] fill-white drop-shadow-sm">
          <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z" />
        </svg>
      </div>
    </header>
  );
}
