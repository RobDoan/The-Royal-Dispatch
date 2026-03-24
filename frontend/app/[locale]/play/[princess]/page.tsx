'use client';

import { Suspense } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { AudioPlayer } from '@/components/AudioPlayer';

const PRINCESS_META = {
  elsa:       { name: 'Queen Elsa',  emoji: '❄️' },
  belle:      { name: 'Belle',       emoji: '📚' },
  cinderella: { name: 'Cinderella',  emoji: '👠' },
  ariel:      { name: 'Ariel',       emoji: '🐠' },
} as const;

type PrincessId = keyof typeof PRINCESS_META;

function PlayPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const princessId = params.princess as PrincessId;
  const audioUrl = searchParams.get('audio') ?? '';
  const meta = PRINCESS_META[princessId] ?? PRINCESS_META.elsa;

  return (
    <AudioPlayer
      princess={{ id: princessId, ...meta }}
      audioUrl={audioUrl}
    />
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayPageContent />
    </Suspense>
  );
}
