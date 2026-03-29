import { describe, it, expect, vi, beforeEach } from 'vitest';

const API_URL = 'http://localhost:8000';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('listUsers', () => {
  it('returns array of users', async () => {
    const mockUsers = [{ id: 'u1', name: 'Quy', telegram_chat_id: 12345, token: 'tk_abc', created_at: '2026-01-01T00:00:00Z' }];
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    } as Response);

    const { listUsers } = await import('@/lib/api');
    const result = await listUsers();
    expect(result).toEqual(mockUsers);
    expect(fetch).toHaveBeenCalledWith(`${API_URL}/admin/users`);
  });
});

describe('createUser', () => {
  it('posts name and telegram_chat_id, returns created user', async () => {
    const created = { id: 'u1', name: 'Quy', telegram_chat_id: 12345, token: 'tk_newtoken', created_at: '2026-01-01T00:00:00Z' };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => created,
    } as Response);

    const { createUser } = await import('@/lib/api');
    const result = await createUser('Quy', 12345);
    expect(result).toEqual(created);
    expect(fetch).toHaveBeenCalledWith(`${API_URL}/admin/users`, expect.objectContaining({ method: 'POST' }));
  });
});

describe('deleteUser', () => {
  it('sends DELETE request', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response);
    const { deleteUser } = await import('@/lib/api');
    await deleteUser('u1');
    expect(fetch).toHaveBeenCalledWith(`${API_URL}/admin/users/u1`, expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('updatePreferences', () => {
  it('PUTs config and returns updated prefs', async () => {
    const prefs = { user_id: 'u1', config: { favorite_princesses: ['elsa'] } };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => prefs,
    } as Response);

    const { updatePreferences } = await import('@/lib/api');
    const result = await updatePreferences('u1', { favorite_princesses: ['elsa'] });
    expect(result).toEqual(prefs);
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/admin/users/u1/preferences`,
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});

describe('listPersonas', () => {
  it('returns persona list', async () => {
    const personas = [{ id: 'elsa', name: 'Queen Elsa' }, { id: 'belle', name: 'Belle' }];
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => personas,
    } as Response);

    const { listPersonas } = await import('@/lib/api');
    const result = await listPersonas();
    expect(result).toEqual(personas);
  });
});
