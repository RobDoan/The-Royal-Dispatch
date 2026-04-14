'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getStoredToken,
  getTokenFromUrl,
  storeToken,
  fetchUserProfile,
  getStoredChildId,
  storeSelectedChild,
  clearSelectedChild,
  type UserProfile,
  type ChildInfo,
} from '@/lib/user';
import { PRINCESS_META, type PrincessId } from '@/lib/princesses';

const ALL_PRINCESS_IDS = Object.keys(PRINCESS_META) as PrincessId[];

interface UseUserResult {
  profile: UserProfile | null;
  selectedChild: ChildInfo | null;
  selectChild: (childId: string) => void;
  activePrincessIds: PrincessId[];
  loading: boolean;
}

export function useUser(): UseUserResult {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
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

        if (p && p.children.length > 0) {
          const storedId = getStoredChildId();
          const match = storedId ? p.children.find((c) => c.id === storedId) : null;
          if (match) {
            setSelectedChild(match);
          } else if (storedId) {
            // Stale child_id in localStorage
            clearSelectedChild();
          }
        }
      }
      setLoading(false);
    }
    resolve();
  }, []);

  const selectChild = useCallback(
    (childId: string) => {
      const child = profile?.children.find((c) => c.id === childId) ?? null;
      setSelectedChild(child);
      if (child) {
        storeSelectedChild(child.id);
      } else {
        clearSelectedChild();
      }
    },
    [profile],
  );

  const favorites = selectedChild?.preferences?.favorite_princesses;
  const activePrincessIds: PrincessId[] =
    favorites && favorites.length > 0
      ? (favorites.filter((id) => id in PRINCESS_META) as PrincessId[])
      : ALL_PRINCESS_IDS;

  return { profile, selectedChild, selectChild, activePrincessIds, loading };
}
