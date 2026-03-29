'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { requestStory } from '@/lib/api';
import { PRINCESS_META, type PrincessId } from '@/lib/princesses';
import { ChevronRight } from 'lucide-react';
import { useUser } from '@/hooks/useUser';

export default function InboxPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('app');
  const { activePrincessIds } = useUser();

  async function handleTap(princessId: PrincessId) {
    requestStory(princessId, locale as 'en' | 'vi', 'daily');
    router.push(`/${locale}/play/${princessId}`);
  }

  return (
    <main className="font-sans py-10">
      <div className="px-6 pt-safe">
        <h1 className="text-3xl font-black tracking-tight text-gray-900 mb-1 pt-8">
          {t('title')}
        </h1>
        <p className="text-gray-500 text-sm font-medium mb-6">{t('subtitle')}</p>

        <div className="flex flex-col gap-3">
          {activePrincessIds.map((id) => {
            const meta = PRINCESS_META[id];
            return (
              <button
                key={id}
                onClick={() => handleTap(id)}
                className="flex items-center gap-4 bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform text-left w-full"
              >
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                  <img
                    src={`/characters/${id}.png`}
                    alt={meta.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-[15px] leading-tight">{meta.name}</p>
                  <p className="text-gray-400 text-xs font-medium mt-0.5 truncate">{t(`origins.${id}`)}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
