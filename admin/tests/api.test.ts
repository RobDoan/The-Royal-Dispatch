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

describe('listChildren', () => {
  it('fetches children for a user', async () => {
    const children = [
      { id: 'c1', parent_id: 'u1', name: 'Emma', timezone: 'America/Los_Angeles', preferences: {}, created_at: '2026-01-01T00:00:00Z' },
    ];
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => children } as Response);
    const { listChildren } = await import('@/lib/api');
    const result = await listChildren('u1');
    expect(result).toEqual(children);
    expect(fetch).toHaveBeenCalledWith(`${API_URL}/admin/users/u1/children`);
  });

  it('throws on error response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false } as Response);
    const { listChildren } = await import('@/lib/api');
    await expect(listChildren('u1')).rejects.toThrow('Failed to list children');
  });
});

describe('createChild', () => {
  it('POSTs name and returns created child', async () => {
    const child = { id: 'c1', parent_id: 'u1', name: 'Emma', timezone: 'America/Los_Angeles', preferences: {}, created_at: '2026-01-01T00:00:00Z' };
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => child } as Response);
    const { createChild } = await import('@/lib/api');
    const result = await createChild('u1', 'Emma');
    expect(result).toEqual(child);
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/admin/users/u1/children`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Emma' }),
      }),
    );
  });

  it('throws on error response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false } as Response);
    const { createChild } = await import('@/lib/api');
    await expect(createChild('u1', 'Emma')).rejects.toThrow('Failed to create child');
  });
});

describe('deleteChild', () => {
  it('sends DELETE to /admin/children/{childId}', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response);
    const { deleteChild } = await import('@/lib/api');
    await deleteChild('c1');
    expect(fetch).toHaveBeenCalledWith(`${API_URL}/admin/children/c1`, expect.objectContaining({ method: 'DELETE' }));
  });

  it('throws on error response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false } as Response);
    const { deleteChild } = await import('@/lib/api');
    await expect(deleteChild('c1')).rejects.toThrow('Failed to delete child');
  });
});
