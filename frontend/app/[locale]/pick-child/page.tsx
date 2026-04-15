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
      <div className="fixed inset-0 flex items-center justify-center bg-[#FFF0F5]">
        <div className="w-8 h-8 border-4 border-pink-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const children = profile?.children ?? [];

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center bg-[#FFF0F5] px-8">
      <h1
        className="text-3xl font-black tracking-tight text-gray-900 mb-2 text-center"
        style={{ fontFamily: '"Quicksand", sans-serif' }}
      >
        {t('heading')}
      </h1>
      <p className="text-gray-400 text-sm font-medium mb-10">{t('subheading')}</p>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        {children.map((child) => (
          <button
            key={child.id}
            onClick={() => handlePick(child.id)}
            className="flex items-center gap-4 bg-white rounded-2xl px-6 py-5 shadow-md border border-gray-100 active:scale-[0.97] transition-transform text-left w-full"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center text-xl font-black text-white shadow-sm">
              {child.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-lg font-bold text-gray-900">{child.name}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
