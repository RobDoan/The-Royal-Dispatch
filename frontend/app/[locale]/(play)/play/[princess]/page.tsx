'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { AudioPlayer } from '@/components/AudioPlayer';
import { StoryWaiting } from '@/components/StoryWaiting';
import { generateStorySSE, type Princess, type Language } from '@/lib/api';
import { PRINCESS_META, type PrincessId } from '@/lib/princesses';
import { useUser } from '@/hooks/useUser';

type PageState = 'waiting' | 'ready' | 'error';

export default function PlayPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('app');
  const { selectedChild } = useUser();

  const princessId = (params.princess as PrincessId) ?? 'elsa';
  const meta = PRINCESS_META[princessId] ?? PRINCESS_META.elsa;

  const [pageState, setPageState] = useState<PageState>('waiting');
  const [audioUrl, setAudioUrl] = useState('');
  const [storyText, setStoryText] = useState('');
  const [royalChallenge, setRoyalChallenge] = useState<string | null>(null);

  useEffect(() => {
    const cleanup = generateStorySSE(
      princessId as Princess,
      locale as Language,
      'daily',
      selectedChild?.id,
      (event) => {
        if (event.type === 'ready' || event.type === 'cached') {
          setStoryText(event.storyText || '');
          setRoyalChallenge(event.royalChallenge ?? null);
          setAudioUrl(event.audioUrl || '');
          setPageState('ready');
        } else if (event.type === 'error') {
          setPageState('error');
        }
      },
    );
    return cleanup;
  }, [princessId, selectedChild?.id, locale]);

  if (pageState === 'ready') {
    return (
      <AudioPlayer
        princess={{ id: princessId, ...meta }}
        audioUrl={audioUrl}
        storyText={storyText}
        royalChallenge={royalChallenge ?? undefined}
      />
    );
  }

  if (pageState === 'error') {
    const sorryMessage = t(`sorryMessages.${princessId}`);
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-8 text-center gap-6">
        <img
          src={`/characters/${princessId}.png`}
          alt={meta.name}
          className="w-48 h-48 object-cover rounded-full shadow-lg opacity-80"
        />
        <p className="text-xl font-bold text-white/80 max-w-xs leading-snug">
          {sorryMessage}
        </p>
        <button
          onClick={() => router.push(`/${locale}/inbox`)}
          className="mt-2 px-8 py-3 gold-gradient-bg text-[#1a0533] font-bold rounded-full text-sm tracking-widest uppercase"
        >
          {t('goBack')}
        </button>
      </div>
    );
  }

  return (
    <StoryWaiting
      princess={{ id: princessId, ...meta }}
      message={t('writing', { princess: meta.name })}
    />
  );
}
