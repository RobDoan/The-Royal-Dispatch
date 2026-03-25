'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { requestStory } from '@/lib/api';
import { PRINCESS_META, type PrincessId } from '@/lib/princesses';
import { PrincessCard } from '@/components/PrincessCard';

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
        {/* Title removed since we have a new Header component */}

        <div className="grid grid-cols-2 gap-4">
          {(Object.entries(PRINCESS_META) as [PrincessId, typeof PRINCESS_META[PrincessId]][]).map(([id, meta]) => (
            <PrincessCard
              key={id}
              variant="poster"
              princess={{
                id,
                name: meta.name,
                origin: meta.origin,
                emoji: meta.emoji,
                imageUrl: `/characters/${id}.png`,
                avatarGradient: 'from-black/20 to-black/80'
              }}
              onClick={handleTap}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
