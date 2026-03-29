const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface User {
  id: string;
  name: string;
  telegram_chat_id: number;
  token: string;
  created_at: string;
}

export interface UserPreferences {
  user_id: string;
  config: {
    favorite_princesses?: string[];
    [key: string]: unknown;
  };
}

export interface Persona {
  id: string;
  name: string;
}

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
  if (!res.ok) throw new Error('Failed to create user');
  return res.json();
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete user');
}

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const res = await fetch(`${API_URL}/admin/users/${userId}/preferences`);
  if (!res.ok) throw new Error('Failed to get preferences');
  return res.json();
}

export async function updatePreferences(userId: string, config: Record<string, unknown>): Promise<UserPreferences> {
  const res = await fetch(`${API_URL}/admin/users/${userId}/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) throw new Error('Failed to update preferences');
  return res.json();
}

export async function listPersonas(): Promise<Persona[]> {
  const res = await fetch(`${API_URL}/admin/personas`);
  if (!res.ok) throw new Error('Failed to list personas');
  return res.json();
}
