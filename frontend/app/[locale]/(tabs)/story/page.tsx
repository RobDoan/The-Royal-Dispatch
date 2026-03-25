'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { requestStory } from '@/lib/api';
import { PRINCESS_META, type PrincessId } from '@/lib/princesses';

export default function StoryPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('app');
  const tStory = useTranslations('story');

  async function handleTap(princessId: PrincessId) {
    requestStory(princessId, locale as 'en' | 'vi', 'life_lesson');
    router.push(`/${locale}/story/${princessId}`);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] font-sans">
      <div className="px-6 pt-safe pb-6">
        <h1 className="text-3xl font-black tracking-tight text-gray-900 mb-1 pt-8">
          {tStory('title')}
        </h1>
        <p className="text-gray-500 text-sm font-medium mb-6">{t('subtitle')}</p>

        <div className="grid grid-cols-2 gap-4">
          {(Object.entries(PRINCESS_META) as [PrincessId, typeof PRINCESS_META[PrincessId]][]).map(([id, meta]) => (
            <button
              key={id}
              onClick={() => handleTap(id)}
              className="relative flex flex-col items-center bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 active:scale-[0.97] transition-transform aspect-[3/4]"
            >
              <img
                src={`/characters/${id}.png`}
                alt={meta.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-left">
                <p className="text-white font-bold text-sm leading-tight">{meta.name}</p>
                <p className="text-white/70 text-[10px] font-medium mt-0.5">{t(`origins.${id}`)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
