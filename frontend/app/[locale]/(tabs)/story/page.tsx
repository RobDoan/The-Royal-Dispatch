'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { requestStory } from '@/lib/api';

const PRINCESS_META = {
  elsa:       { name: 'Queen Elsa',  emoji: '❄️', origin: 'Kingdom of Arendelle' },
  belle:      { name: 'Belle',       emoji: '📚', origin: 'The Enchanted Castle' },
  cinderella: { name: 'Cinderella',  emoji: '👠', origin: 'The Royal Palace' },
  ariel:      { name: 'Ariel',       emoji: '🐠', origin: 'Under the Sea' },
} as const;

type PrincessId = keyof typeof PRINCESS_META;

export default function StoryPage() {
  const router = useRouter();
  const locale = useLocale();

  async function handleTap(princessId: PrincessId) {
    await requestStory(princessId, locale as 'en' | 'vi', 'life_lesson');
    router.push(`/${locale}/story/${princessId}`);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] font-sans">
      <div className="px-6 pt-safe pb-6">
        <h1 className="text-3xl font-black tracking-tight text-gray-900 mb-1 pt-8">
          Story
        </h1>
        <p className="text-gray-500 text-sm font-medium mb-6">Choose a princess for your life lesson</p>

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
                <p className="text-white/70 text-[10px] font-medium mt-0.5">{meta.origin}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
