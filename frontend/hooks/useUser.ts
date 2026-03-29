'use client';

import { useEffect, useState } from 'react';
import { getStoredToken, getTokenFromUrl, storeToken, fetchUserProfile, type UserProfile } from '@/lib/user';
import { PRINCESS_META, type PrincessId } from '@/lib/princesses';

const ALL_PRINCESS_IDS = Object.keys(PRINCESS_META) as PrincessId[];

interface UseUserResult {
  profile: UserProfile | null;
  activePrincessIds: PrincessId[];
  loading: boolean;
}

export function useUser(): UseUserResult {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function resolve() {
      let token = getStoredToken();
      if (!token) {
        const urlToken = getTokenFromUrl();
        if (urlToken) {
          storeToken(urlToken);
          token = urlToken;
        }
      }
      if (token) {
        const p = await fetchUserProfile(token);
        setProfile(p);
      }
      setLoading(false);
    }
    resolve();
  }, []);

  const favorites = profile?.config?.favorite_princesses;
  const activePrincessIds: PrincessId[] =
    favorites && favorites.length > 0
      ? (favorites.filter((id) => id in PRINCESS_META) as PrincessId[])
      : ALL_PRINCESS_IDS;

  return { profile, activePrincessIds, loading };
}
