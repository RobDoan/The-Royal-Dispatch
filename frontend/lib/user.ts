const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface ChildInfo {
  id: string;
  name: string;
  preferences: {
    favorite_princesses?: string[];
  };
}

export interface UserProfile {
  user_id: string;
  name: string;
  children: ChildInfo[];
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('royal_token');
}

export function storeToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('royal_token', token);
}

export function getTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

export function getStoredChildId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('selected_child_id');
}

export function storeSelectedChild(childId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('selected_child_id', childId);
}

export function clearSelectedChild(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('selected_child_id');
}

export async function fetchUserProfile(token: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${API_URL}/user/me?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
