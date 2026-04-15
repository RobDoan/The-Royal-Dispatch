const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? NEXT_PUBLIC_API_URL;

const API_URL = typeof window === 'undefined' ? INTERNAL_API_URL : NEXT_PUBLIC_API_URL;

export interface User {
  id: string;
  name: string;
  telegram_chat_id: number;
  token: string;
  created_at: string;
}

export interface LinkedUserInfo {
  user_id: string;
  name: string;
  role: string | null;
}

export interface ChildWithUsers {
  id: string;
  name: string;
  timezone: string;
  preferences: Record<string, unknown>;
  created_at: string;
  users: LinkedUserInfo[];
}

export interface Child {
  id: string;
  name: string;
  timezone: string;
  preferences: Record<string, unknown>;
  created_at: string;
}

export interface ChildPreferences {
  child_id: string;
  preferences: {
    favorite_princesses?: string[];
    [key: string]: unknown;
  };
}

export interface Persona {
  id: string;
  name: string;
}

export interface UserChildLink {
  user_id: string;
  child_id: string;
  role: string | null;
  created_at: string;
}

// ── Users ──────────────────────────────────────────────────────────────────

export async function listUsers(): Promise<User[]> {
  const res = await fetch(`${API_URL}/admin/users`);
  if (!res.ok) throw new Error('Failed to list users');
  return res.json();
}

export async function createUser(name: string, telegram_chat_id: number): Promise<User> {
  const res = await fetch(`${API_URL}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, telegram_chat_id }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to create user');
  }
  return res.json();
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete user');
}

// ── Children ───────────────────────────────────────────────────────────────

export async function listChildrenAll(): Promise<ChildWithUsers[]> {
  const res = await fetch(`${API_URL}/admin/children`);
  if (!res.ok) throw new Error('Failed to list children');
  return res.json();
}

export async function createChild(name: string, timezone?: string): Promise<Child> {
  const res = await fetch(`${API_URL}/admin/children`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, timezone: timezone ?? 'America/Los_Angeles' }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to create child');
  }
  return res.json();
}

export async function deleteChild(childId: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/children/${childId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete child');
}

// ── User-Child Links ───────────────────────────────────────────────────────

export async function linkUserToChild(childId: string, userId: string, role: string | null): Promise<UserChildLink> {
  const res = await fetch(`${API_URL}/admin/children/${childId}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, role }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to link user to child');
  }
  return res.json();
}

export async function unlinkUserFromChild(childId: string, userId: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/children/${childId}/users/${userId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to unlink user from child');
}

// ── Preferences ────────────────────────────────────────────────────────────

export async function getPreferences(childId: string): Promise<ChildPreferences> {
  const res = await fetch(`${API_URL}/admin/children/${childId}/preferences`);
  if (!res.ok) throw new Error('Failed to get preferences');
  return res.json();
}

export async function updatePreferences(childId: string, preferences: Record<string, unknown>): Promise<ChildPreferences> {
  const res = await fetch(`${API_URL}/admin/children/${childId}/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferences }),
  });
  if (!res.ok) throw new Error('Failed to update preferences');
  return res.json();
}

// ── Personas ───────────────────────────────────────────────────────────────

export async function listPersonas(): Promise<Persona[]> {
  const res = await fetch(`${API_URL}/admin/personas`);
  if (!res.ok) throw new Error('Failed to list personas');
  return res.json();
}
