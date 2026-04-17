'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { CallEngine } from '@/lib/call-engine';
import type { CallState, CallCallbacks } from '@/lib/call-engine';
import type { TranscriptTurn } from '@/lib/call-api';
import type { Princess } from '@/lib/api';
import { ModelLoader } from './ModelLoader';

interface Props {
  princess: Princess;
  childId: string;
  onCallEnd: () => void;
}

const STATE_LABELS: Record<CallState, string> = {
  LOADING: 'Connecting...',
  IDLE: 'Your turn to speak!',
  LISTENING: 'Listening...',
  THINKING: '\u2728',
  SPEAKING: 'Speaking...',
  ENDED: 'Call ended',
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CallScreen({ princess, childId, onCallEnd }: Props) {
  const [callState, setCallState] = useState<CallState>('LOADING');
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(420);
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const engineRef = useRef<CallEngine | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const callbacks: CallCallbacks = {
    onStateChange: setCallState,
    onTranscript: (turn) => setTranscript((prev) => [...prev, turn]),
    onTimerTick: setTimeRemaining,
    onError: setError,
  };

  const handleModelReady = useCallback(() => setModelReady(true), []);
  const handleModelError = useCallback((err: string) => setError(err), []);

  useEffect(() => {
    if (!modelReady) return;
    const engine = new CallEngine(princess, childId, callbacks);
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.endCall();
    };
  }, [modelReady, princess, childId]);

  const handleHoldStart = () => {
    setHoldProgress(0);
    let elapsed = 0;
    holdTimerRef.current = setInterval(() => {
      elapsed += 50;
      setHoldProgress(Math.min(100, (elapsed / 1000) * 100));
      if (elapsed >= 1000) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        engineRef.current?.endCall().then(onCallEnd);
      }
    }, 50);
  };

  const handleHoldEnd = () => {
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    setHoldProgress(0);
  };

  const animationClass =
    callState === 'LISTENING' ? 'animate-pulse ring-4 ring-white/30' :
    callState === 'THINKING' ? 'animate-bounce' :
    callState === 'SPEAKING' ? 'animate-pulse ring-4 ring-[var(--color-gold)]/40' :
    '';

  if (!modelReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-indigo-950 to-purple-950">
        <ModelLoader onReady={handleModelReady} onError={handleModelError} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-gradient-to-b from-indigo-950 to-purple-950 p-4 pt-8">
      {/* Timer */}
      <div className="absolute top-4 right-4 text-white/30 text-xs font-mono">
        {formatTime(timeRemaining)}
      </div>

      {/* Princess portrait */}
      <div className={`relative w-48 h-48 rounded-full overflow-hidden mt-12 transition-all duration-500 ${animationClass}`}>
        <Image
          src={`/characters/${princess}.png`}
          alt={princess}
          fill
          className="object-cover"
          priority
        />
      </div>

      {/* State indicator */}
      <p className="text-white/60 text-sm mt-6">{STATE_LABELS[callState]}</p>

      {/* Error */}
      {error && (
        <p className="text-red-300 text-xs mt-2 max-w-xs text-center">{error}</p>
      )}

      {/* Transcript */}
      <div className="flex-1 w-full max-w-sm mt-6 overflow-y-auto space-y-3 pb-24">
        {transcript.map((turn, i) => (
          <div
            key={i}
            className={`text-sm px-3 py-2 rounded-xl max-w-[80%] ${
              turn.role === 'princess'
                ? 'bg-purple-800/50 text-white/90 self-start'
                : 'bg-white/10 text-white/70 self-end ml-auto'
            }`}
          >
            {turn.text}
          </div>
        ))}
      </div>

      {/* End call button (toddler lock) */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2">
        <button
          onPointerDown={handleHoldStart}
          onPointerUp={handleHoldEnd}
          onPointerLeave={handleHoldEnd}
          className="relative w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center"
        >
          <div
            className="absolute inset-0 rounded-full bg-red-500/60 transition-all"
            style={{
              clipPath: `inset(${100 - holdProgress}% 0 0 0)`,
            }}
          />
          <span className="relative text-red-300 text-xl">&times;</span>
        </button>
      </div>
    </div>
  );
}
