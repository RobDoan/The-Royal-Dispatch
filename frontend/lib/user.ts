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

export interface Persona {
  id: string;
  name: string;
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

export interface UpdateUserPayload {
  name: string;
  children: Array<{
    id: string | null;
    name: string;
    preferences: { favorite_princesses: string[] };
  }>;
}

export interface UpdateUserError {
  status: number;
  detail: string;
}

export interface UpdateUserResult {
  profile: UserProfile | null;
  error: UpdateUserError | null;
}

export async function updateUserProfile(
  token: string,
  payload: UpdateUserPayload,
): Promise<UpdateUserResult> {
  try {
    const res = await fetch(`${API_URL}/user/me?token=${encodeURIComponent(token)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      let detail = 'Request failed';
      try {
        const body = await res.json();
        if (typeof body?.detail === 'string') detail = body.detail;
      } catch {
        // ignore
      }
      return { profile: null, error: { status: res.status, detail } };
    }
    const profile = (await res.json()) as UserProfile;
    return { profile, error: null };
  } catch {
    return { profile: null, error: { status: 0, detail: 'Network error' } };
  }
}

export async function fetchPersonas(): Promise<Persona[]> {
  try {
    const res = await fetch(`${API_URL}/admin/personas`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return [];
    return (await res.json()) as Persona[];
  } catch {
    return [];
  }
}
