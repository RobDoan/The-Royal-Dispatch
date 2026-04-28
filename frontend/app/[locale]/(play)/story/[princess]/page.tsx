'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { AudioPlayer } from '@/components/AudioPlayer';
import { StoryWaiting } from '@/components/StoryWaiting';
import { fetchStory, Princess } from '@/lib/api';
import { PRINCESS_META, type PrincessId } from '@/lib/princesses';
import { useUser } from '@/hooks/useUser';
type PageState = 'polling' | 'ready' | 'timeout' | 'error';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 75000;

export default function StoryPlayPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('app');
  const tStory = useTranslations('story');
  const { selectedChild } = useUser();

  const princessId = (params.princess as PrincessId) ?? 'elsa';
  const meta = PRINCESS_META[princessId] ?? PRINCESS_META.elsa;

  const [pageState, setPageState] = useState<PageState>('polling');
  const [audioUrl, setAudioUrl] = useState('');
  const [storyText, setStoryText] = useState('');
  const [royalChallenge, setRoyalChallenge] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let stopped = false;
    const startTime = Date.now();

    function stopPolling() {
      stopped = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    async function poll() {
      if (stopped) return;

      if (Date.now() - startTime >= POLL_TIMEOUT_MS) {
        stopPolling();
        setPageState('timeout');
        return;
      }

      try {
        const result = await fetchStory(princessId as Princess, 'life_lesson', selectedChild?.id);
        if (stopped) return;
        stopPolling();
        setAudioUrl(result.audioUrl);
        setStoryText(result.storyText);
        setRoyalChallenge(result.royalChallenge);
        setPageState('ready');
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'STORY_ERROR') {
          stopPolling();
          setPageState('error');
        }
        // STORY_NOT_FOUND → keep polling
      }
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return stopPolling;
  }, [princessId, selectedChild]);

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

  if (pageState === 'timeout' || pageState === 'error') {
    const sorryMessage = tStory(`sorryMessages.${princessId}`);
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
          onClick={() => router.push(`/${locale}/story`)}
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
      message={tStory('writing', { princess: meta.name })}
    />
  );
}
