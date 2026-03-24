'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { PrincessCard, PrincessConfig } from '@/components/PrincessCard';
import { LanguageSelector, Language } from '@/components/LanguageSelector';
import { requestStory, Princess } from '@/lib/api';

const PRINCESSES: PrincessConfig[] = [
  {
    id: 'elsa', name: 'Queen Elsa', emoji: '❄️',
    bgColor: 'bg-blue-50', borderColor: 'border-blue-300',
    labelColor: 'text-blue-500', nameColor: 'text-blue-900',
    avatarGradient: 'from-blue-200 to-blue-400', badgeBg: 'bg-blue-100',
    origin: '',
  },
  {
    id: 'belle', name: 'Belle', emoji: '📚',
    bgColor: 'bg-amber-50', borderColor: 'border-amber-300',
    labelColor: 'text-amber-600', nameColor: 'text-amber-900',
    avatarGradient: 'from-yellow-200 to-amber-300', badgeBg: 'bg-amber-100',
    origin: '',
  },
  {
    id: 'cinderella', name: 'Cinderella', emoji: '👠',
    bgColor: 'bg-fuchsia-50', borderColor: 'border-fuchsia-300',
    labelColor: 'text-fuchsia-600', nameColor: 'text-fuchsia-900',
    avatarGradient: 'from-fuchsia-200 to-pink-300', badgeBg: 'bg-fuchsia-100',
    origin: '',
  },
  {
    id: 'ariel', name: 'Ariel', emoji: '🐠',
    bgColor: 'bg-teal-50', borderColor: 'border-teal-300',
    labelColor: 'text-teal-600', nameColor: 'text-teal-900',
    avatarGradient: 'from-teal-200 to-cyan-300', badgeBg: 'bg-teal-100',
    origin: '',
  },
];

export default function InboxPage() {
  const t = useTranslations('app');
  const locale = useLocale() as Language;
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('rd-language') as Language) ?? locale;
    }
    return locale;
  });
  const [loadingPrincess, setLoadingPrincess] = useState<Princess | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('rd-language', language);
  }, [language]);

  const princesses = PRINCESSES.map((p) => ({
    ...p,
    origin: t(`origins.${p.id}`),
  }));

  async function handleSelectPrincess(id: Princess) {
    setLoadingPrincess(id);
    setError(null);
    try {
      const audioUrl = await requestStory(id, language);
      router.push(`/${locale}/play/${id}?audio=${encodeURIComponent(audioUrl)}`);
    } catch {
      setError(t('error', { princess: id }));
      setLoadingPrincess(null);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-50 via-pink-50 to-blue-50 p-6 flex flex-col items-center gap-4">
      <div className="w-full max-w-md flex items-center justify-between">
        <span className="text-purple-400 text-xs font-extrabold tracking-widest uppercase">✨ {t('title')}</span>
        <LanguageSelector value={language} onChange={setLanguage} />
      </div>

      <div className="text-center mb-2">
        <h1 className="text-purple-900 text-xl font-extrabold">{t('greeting')}</h1>
        <p className="text-purple-400 text-sm font-semibold mt-1">{t('subtitle')} 💌</p>
      </div>

      <div className="w-full max-w-md flex flex-col gap-3">
        {princesses.map((p) => (
          <PrincessCard
            key={p.id}
            princess={p}
            onClick={handleSelectPrincess}
            isLoading={loadingPrincess === p.id}
          />
        ))}
      </div>

      {error && (
        <div className="w-full max-w-md bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 text-center">
          <p className="text-amber-800 text-sm font-semibold">{error}</p>
        </div>
      )}
    </main>
  );
}
