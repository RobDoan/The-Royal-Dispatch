'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { PrincessCard, PrincessConfig } from '@/components/PrincessCard';
import { requestStory, Princess, Language } from '@/lib/api';

const PRINCESSES: PrincessConfig[] = [
  {
    id: 'elsa',
    name: 'Queen Elsa',
    emoji: '❄️',
    // Using an Unsplash placeholder representing a snowy, icy landscape
    imageUrl: '/characters/elsa.png',
    bgColor: 'bg-blue-300', borderColor: 'border-blue-300',
    labelColor: 'text-blue-600', nameColor: 'text-blue-900',
    avatarGradient: 'from-blue-200 to-blue-400', badgeBg: 'bg-blue-100',
    origin: 'Arendelle', isNew: true,
  },
  {
    id: 'belle',
    name: 'Belle',
    emoji: '📚',
    // Using a beautiful Unsplash placeholder representing golden books/library
    imageUrl: '/characters/belle.png',
    bgColor: 'bg-yellow-300', borderColor: 'border-amber-300',
    labelColor: 'text-amber-700', nameColor: 'text-amber-900',
    avatarGradient: 'from-yellow-200 to-amber-300', badgeBg: 'bg-amber-100',
    origin: 'The Enchanted Castle', isNew: false,
  },
  {
    id: 'cinderella',
    name: 'Cinderella',
    emoji: '👠',
    // Using an Unsplash placeholder representing magic carriage/night palace
    imageUrl: '/characters/cinderella.png',
    bgColor: 'bg-pink-300', borderColor: 'border-fuchsia-300',
    labelColor: 'text-fuchsia-700', nameColor: 'text-fuchsia-900',
    avatarGradient: 'from-fuchsia-200 to-pink-300', badgeBg: 'bg-fuchsia-100',
    origin: 'The Royal Palace', isNew: true,
  },
  {
    id: 'ariel',
    name: 'Ariel',
    emoji: '🧜‍♀️',
    // Using an Unsplash placeholder representing magical ocean/underwater
    imageUrl: '/characters/ariel.png',
    bgColor: 'bg-emerald-300', borderColor: 'border-teal-300',
    labelColor: 'text-teal-700', nameColor: 'text-teal-900',
    avatarGradient: 'from-teal-200 to-cyan-300', badgeBg: 'bg-teal-100',
    origin: 'Atlantica', isNew: false,
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
  useEffect(() => {
    localStorage.setItem('rd-language', language);
  }, [language]);

  const princesses = PRINCESSES.map((p) => ({
    ...p,
    origin: t(`origins.${p.id}`),
  }));

  function handleSelectPrincess(id: Princess) {
    // Fire generation — no await. Errors are handled on the play page.
    void requestStory(id, language);
    router.push(`/${locale}/play/${id}`);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] pb-24 font-sans max-w-md mx-auto relative overflow-x-hidden pt-safe">

      {/* Header */}
      <header className="px-6 pt-12 pb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-sm border-2 border-white bg-gradient-to-tr from-yellow-300 to-yellow-100 relative">
            <div className="absolute -right-1 -bottom-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white" />
            👧
          </div>
          <div>
            <p className="text-gray-500 text-[11px] font-bold uppercase tracking-wider">{t('greeting', { defaultValue: 'Welcome back' })}</p>
            <h1 className="text-gray-900 text-xl font-extrabold tracking-tight">Emma!</h1>
          </div>
        </div>
        <button className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors relative">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-[#FF7A45] rounded-full border-2 border-[#FCF8F3]" />
        </button>
      </header>


      {/* Recommended Area */}
      <div className="mb-4">
        {/* Grid Layout */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-6 px-6 pb-12 pt-2">
          {princesses.map((p) => (
            <PrincessCard
              key={p.id}
              princess={p}
              onClick={handleSelectPrincess}
            />
          ))}
        </div>
      </div>

    </main>
  );
}
