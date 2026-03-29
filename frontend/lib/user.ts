const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface UserProfile {
  user_id: string;
  name: string;
  config: {
    favorite_princesses?: string[];
  };
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
