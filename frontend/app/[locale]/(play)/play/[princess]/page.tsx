'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { AudioPlayer } from '@/components/AudioPlayer';
import { requestStory, fetchStory, type Princess, type Language } from '@/lib/api';
import { PRINCESS_META, PRINCESS_OVERLAY, type PrincessId } from '@/lib/princesses';
import { useUser } from '@/hooks/useUser';
type PageState = 'polling' | 'ready' | 'timeout' | 'error';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 75000;

export default function PlayPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('app');
  const { selectedChild } = useUser();

  const princessId = (params.princess as PrincessId) ?? 'elsa';
  const meta = PRINCESS_META[princessId] ?? PRINCESS_META.elsa;
  const overlay = PRINCESS_OVERLAY[princessId] ?? 'rgba(200,200,200,0.2)';

  const [pageState, setPageState] = useState<PageState>('polling');
  const [audioUrl, setAudioUrl] = useState('');
  const [storyText, setStoryText] = useState('');

  useEffect(() => {
    let stopped = false;
    const startTime = Date.now();

    async function start() {
      // Step 1: POST /story → get audio URL (streaming or cached S3)
      let url: string;
      try {
        url = await requestStory(
          princessId as Princess,
          locale as Language,
          'daily',
          selectedChild?.id,
        );
        if (stopped) return;
      } catch {
        if (!stopped) setPageState('error');
        return;
      }

      // Step 2: Set audio URL immediately — the <audio> element will
      // fetch the streaming endpoint, triggering the LLM + ElevenLabs
      // pipeline. Audio plays as chunks arrive.
      setAudioUrl(url);
      setPageState('ready');

      // Step 3: Poll for story text (saved to DB by _finalize after stream)
      while (!stopped && Date.now() - startTime < POLL_TIMEOUT_MS) {
        try {
          const result = await fetchStory(
            princessId as Princess,
            'daily',
            selectedChild?.id,
          );
          if (stopped) return;
          setStoryText(result.storyText);
          return;
        } catch {
          // Not in DB yet — keep polling
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    }

    start();
    return () => { stopped = true; };
  }, [princessId, selectedChild, locale]);

  if (pageState === 'ready') {
    return (
      <AudioPlayer
        princess={{ id: princessId, ...meta }}
        audioUrl={audioUrl}
        storyText={storyText}
      />
    );
  }

  if (pageState === 'timeout' || pageState === 'error') {
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
      <span className="sr-only">{t('writing', { princess: meta.name })}</span>
    </div>
  );
}
