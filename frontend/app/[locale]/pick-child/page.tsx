'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useUser } from '@/hooks/useUser';

export default function PickChildPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('pickChild');
  const { profile, selectChild, loading } = useUser();

  function handlePick(childId: string) {
    selectChild(childId);
    router.push(`/${locale}/inbox`);
  }

  if (loading) {
    return (
    <div className="fixed inset-0 flex items-center justify-center px-8">
      <div className="w-8 h-8 border-4 border-[var(--color-gold)] border-t-transparent rounded-full animate-spin" />
    </div>
    );
  }

  const children = profile?.children ?? [];

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center px-8">
      <h1
        className="text-3xl font-black tracking-tight text-white mb-2 text-center"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        {t('heading')}
      </h1>
      <p className="text-white/50 text-sm font-medium mb-10">{t('subheading')}</p>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        {children.map((child) => (
          <button
            key={child.id}
            onClick={() => handlePick(child.id)}
            className="flex items-center gap-4 glass-card px-6 py-5 active:scale-[0.97] transition-all text-left w-full hover:glass-card-hover"
          >
            <div className="w-12 h-12 rounded-full gold-gradient-bg flex items-center justify-center text-xl font-black text-[#1a0533] shadow-sm">
              {child.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-lg font-bold text-white">{child.name}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
