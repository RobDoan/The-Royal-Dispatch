'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { AudioPlayer } from '@/components/AudioPlayer';
import { fetchStory, Princess } from '@/lib/api';
import { PRINCESS_META, PRINCESS_OVERLAY, type PrincessId } from '@/lib/princesses';
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
  const overlay = PRINCESS_OVERLAY[princessId] ?? 'rgba(200,200,200,0.2)';

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
    const sorryMessage = {
      elsa: t('sorryMessages.elsa'),
      belle: t('sorryMessages.belle'),
      cinderella: t('sorryMessages.cinderella'),
      ariel: t('sorryMessages.ariel'),
    }[princessId] ?? t('sorryMessages.elsa');
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[var(--background)] px-8 text-center gap-6">
        <img
          src={`/characters/${princessId}.png`}
          alt={meta.name}
          className="w-48 h-48 object-cover rounded-full shadow-lg opacity-80"
        />
        <p className="text-xl font-bold text-gray-700 max-w-xs leading-snug">
          {sorryMessage}
        </p>
        <button
          onClick={() => router.push(`/${locale}/story`)}
          className="mt-2 px-8 py-3 bg-black text-white font-bold rounded-full text-sm tracking-widest uppercase"
        >
          {t('goBack')}
        </button>
      </div>
    );
  }

  // polling state — looping video
  return (
    <div className="fixed inset-0 overflow-hidden">
      <video
        src="/videos/Princess_Writes_Letter_For_Emma.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-cover"
      />
      <div
        className="absolute inset-0"
        style={{ backgroundColor: overlay }}
      />
      <span className="sr-only">{tStory('writing', { princess: meta.name })}</span>
    </div>
  );
}
