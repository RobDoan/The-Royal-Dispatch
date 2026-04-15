'use client';

import { useEffect } from 'react';
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
  const { profile, selectedChild, activePrincessIds, loading } = useUser();

  const needsChildPick = !loading && profile && profile.children.length > 0 && !selectedChild;

  useEffect(() => {
    if (needsChildPick) {
      router.replace(`/${locale}/pick-child`);
    }
  }, [needsChildPick, router, locale]);

  if (loading || needsChildPick) return null;

  async function handleTap(princessId: PrincessId) {
    requestStory(princessId, locale as 'en' | 'vi', 'daily', selectedChild?.id);
    router.push(`/${locale}/play/${princessId}`);
  }

  return (
    <main className="font-sans py-10">
      <div className="px-6 pt-safe">
        <h1 className="text-transparent bg-clip-text gold-gradient-text text-3xl font-black tracking-tight mb-1 pt-8" style={{ fontFamily: 'var(--font-heading)' }}>
          {t('title')}
        </h1>
        <p className="text-white/50 text-sm font-medium mb-6">{t('subtitle')}</p>

        <div className="flex flex-col gap-3">
          {activePrincessIds.map((id) => {
            const meta = PRINCESS_META[id];
            return (
              <button
                key={id}
                onClick={() => handleTap(id)}
                className="flex items-center gap-4 glass-card px-5 py-4 active:scale-[0.96] transition-all text-left w-full hover:glass-card-hover"
              >
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                  <img
                    src={`/characters/${id}.png`}
                    alt={meta.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-[15px] leading-tight">{meta.name}</p>
                  <p className="text-white/40 text-xs font-medium mt-0.5 truncate">{t(`origins.${id}`)}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/30 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
