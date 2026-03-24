'use client';

import { useEffect, useRef, useState } from 'react';

const AMBIENT: Record<string, { emoji: string; bg: string; glowColor: string }> = {
  elsa:       { emoji: '❄️', bg: 'from-blue-50 via-purple-50 to-blue-50',     glowColor: 'rgba(147,197,253,0.5)' },
  belle:      { emoji: '📚', bg: 'from-amber-50 via-yellow-50 to-amber-50',   glowColor: 'rgba(252,211,77,0.5)' },
  cinderella: { emoji: '✨', bg: 'from-fuchsia-50 via-pink-50 to-fuchsia-50', glowColor: 'rgba(233,184,247,0.5)' },
  ariel:      { emoji: '🐠', bg: 'from-teal-50 via-cyan-50 to-teal-50',       glowColor: 'rgba(110,231,231,0.5)' },
};

const AVATAR_GRADIENT: Record<string, string> = {
  elsa:       'from-blue-200 to-blue-400',
  belle:      'from-yellow-200 to-amber-300',
  cinderella: 'from-fuchsia-200 to-pink-300',
  ariel:      'from-teal-200 to-cyan-300',
};

interface Props {
  princess: { id: string; name: string; emoji: string };
  audioUrl: string;
}

export function AudioPlayer({ princess, audioUrl }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const ambient = AMBIENT[princess.id] ?? AMBIENT['elsa'];
  const gradient = AVATAR_GRADIENT[princess.id] ?? AVATAR_GRADIENT['elsa'];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    audio.onended = () => setPlaying(false);
    return () => { audio.onended = null; };
  }, [audioUrl]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play(); setPlaying(true); }
  }

  const bars = [8, 16, 28, 20, 36, 24, 14, 28, 10];

  return (
    <div className={`min-h-screen bg-gradient-to-b ${ambient.bg} flex flex-col items-center justify-between p-6`}>
      <audio ref={audioRef} src={audioUrl} preload="auto" />

      <div className="text-center">
        <p className="text-purple-400 text-xs font-extrabold tracking-widest uppercase">✨ The Royal Dispatch</p>
        <p className="text-blue-600 text-sm font-bold tracking-wide uppercase mt-2">
          A letter from {princess.name}
        </p>
      </div>

      <div className="flex flex-col items-center gap-6">
        <div
          className={`w-32 h-32 rounded-full bg-gradient-to-br ${gradient} border-4 border-white flex items-center justify-center text-5xl shadow-2xl`}
          style={{ boxShadow: `0 0 40px ${ambient.glowColor}` }}
        >
          {princess.emoji}
        </div>

        <div className="flex items-end justify-center gap-1.5 h-10">
          {bars.map((h, i) => (
            <div
              key={i}
              style={{ height: playing ? `${h}px` : '6px' }}
              className="w-1.5 bg-blue-400 rounded-full transition-all duration-300"
            />
          ))}
        </div>
      </div>

      <div className="text-3xl tracking-[20px] opacity-40">
        {ambient.emoji} {ambient.emoji} {ambient.emoji}
      </div>

      <div className="flex flex-col items-center gap-4 w-full">
        <p className="text-gray-500 text-sm font-semibold">
          Playing her royal letter to Emma...
        </p>
        <button
          onClick={toggle}
          className="w-16 h-16 rounded-full bg-blue-500 border-4 border-blue-200 flex items-center justify-center text-white text-2xl shadow-xl active:scale-95 transition-transform"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
        </button>
      </div>
    </div>
  );
}
