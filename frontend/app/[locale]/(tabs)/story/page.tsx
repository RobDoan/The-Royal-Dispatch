'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { requestStory } from '@/lib/api';
import { PRINCESS_META, type PrincessId } from '@/lib/princesses';
import { PrincessCard } from '@/components/PrincessCard';
import { useUser } from '@/hooks/useUser';

export default function StoryPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('app');
  const tStory = useTranslations('story');
  const { activePrincessIds } = useUser();

  async function handleTap(princessId: PrincessId) {
    requestStory(princessId, locale as 'en' | 'vi', 'life_lesson');
    router.push(`/${locale}/story/${princessId}`);
  }

  return (
    <main className="font-sans py-10">
      <div className="pt-safe px-6">
        <div className="grid grid-cols-2 gap-4">
          {activePrincessIds.map((id) => {
            const meta = PRINCESS_META[id];
            return (
              <PrincessCard
                key={id}
                variant="poster"
                princess={{
                  id,
                  name: meta.name,
                  origin: meta.origin,
                  emoji: meta.emoji,
                  imageUrl: `/characters/${id}.png`,
                  avatarGradient: 'from-black/20 to-black/80',
                }}
                onClick={handleTap}
              />
            );
          })}
        </div>
      </div>
    </main>
  );
}
