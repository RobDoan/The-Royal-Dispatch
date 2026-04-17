'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { isWebGPUSupported } from '@/lib/gemma';
import { getStoredToken, getStoredChildId, fetchUserProfile } from '@/lib/user';

export default function ContactsPage() {
  const { locale } = useParams<{ locale: string }>();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const childId = getStoredChildId();

  useEffect(() => {
    async function load() {
      const token = getStoredToken();
      if (!token || !childId) {
        setLoading(false);
        return;
      }
      const profile = await fetchUserProfile(token);
      if (profile) {
        const child = profile.children.find((c) => c.id === childId);
        if (child?.preferences?.favorite_princesses) {
          setFavorites(child.preferences.favorite_princesses);
        }
      }
      setLoading(false);
    }
    load();
  }, [childId]);

  if (!isWebGPUSupported()) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <p className="text-white/60 text-center">
          Live calls require a newer device. Please try on iPad Pro, iPhone 17, or Chrome desktop.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" />
      </div>
    );
  }

  const princesses = favorites.length > 0 ? favorites : [
    'elsa', 'belle', 'cinderella', 'ariel', 'rapunzel', 'moana',
  ];

  return (
    <div className="flex flex-col items-center min-h-screen p-4 pt-8 pb-32">
      <h1 className="text-2xl font-bold text-white mb-8">Call a Princess</h1>

      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        {princesses.map((p) => (
          <Link
            key={p}
            href={`/${locale}/call/${p}${childId ? `?child_id=${childId}` : ''}`}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="relative w-20 h-20 rounded-full overflow-hidden">
              <Image
                src={`/princesses/${p}.png`}
                alt={p}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
            <span className="text-white text-sm capitalize">{p}</span>
            <span className="text-[var(--color-gold)] text-xs">Call</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
