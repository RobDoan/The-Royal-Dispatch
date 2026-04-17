'use client';

import { useState, useEffect } from 'react';
import { loadModel, isModelCached } from '@/lib/gemma';
import type { ProgressCallback } from '@/lib/gemma';

interface Props {
  onReady: () => void;
  onError: (error: string) => void;
}

export function ModelLoader({ onReady, onError }: Props) {
  const [status, setStatus] = useState<'checking' | 'downloading' | 'ready' | 'error'>('checking');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const cached = await isModelCached();
      if (cancelled) return;

      setStatus('downloading');

      const handleProgress: ProgressCallback = (p) => {
        if (cancelled) return;
        if (p.progress !== undefined) {
          setProgress(Math.round(p.progress));
        }
      };

      try {
        await loadModel(handleProgress);
        if (cancelled) return;
        setStatus('ready');
        onReady();
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        onError(err instanceof Error ? err.message : 'Failed to load model');
      }
    }

    load();
    return () => { cancelled = true; };
  }, [onReady, onError]);

  if (status === 'checking') {
    return (
      <div className="flex flex-col items-center gap-3 p-6">
        <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" />
        <p className="text-white/60 text-sm">Preparing magic...</p>
      </div>
    );
  }

  if (status === 'downloading') {
    return (
      <div className="flex flex-col items-center gap-3 p-6 w-full max-w-xs">
        <p className="text-white text-sm">Downloading princess&apos;s magic...</p>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-gold)] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-white/40 text-xs">{progress}%</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 p-6">
        <p className="text-red-300 text-sm">Something went wrong. Please try again.</p>
      </div>
    );
  }

  return null;
}
