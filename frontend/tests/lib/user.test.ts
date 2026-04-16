import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateUserProfile, fetchPersonas } from '@/lib/user';

describe('updateUserProfile', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('PUTs to /user/me with token and JSON body', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user_id: 'u1',
        name: 'Parent',
        children: [{ id: 'c1', name: 'Emma', preferences: { favorite_princesses: ['elsa'] } }],
      }),
    });
    const result = await updateUserProfile('tok', {
      name: 'Parent',
      children: [{ id: null, name: 'Emma', preferences: { favorite_princesses: ['elsa'] } }],
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/user\/me\?token=tok$/),
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Parent',
          children: [{ id: null, name: 'Emma', preferences: { favorite_princesses: ['elsa'] } }],
        }),
      }),
    );
    expect(result).toEqual({
      profile: {
        user_id: 'u1',
        name: 'Parent',
        children: [{ id: 'c1', name: 'Emma', preferences: { favorite_princesses: ['elsa'] } }],
      },
      error: null,
    });
  });

  it('returns error with status and message on 4xx', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ detail: "You already have a child named 'Emma'" }),
    });
    const result = await updateUserProfile('tok', {
      name: 'Parent',
      children: [{ id: null, name: 'Emma', preferences: { favorite_princesses: [] } }],
    });
    expect(result.profile).toBeNull();
    expect(result.error).toEqual({ status: 409, detail: "You already have a child named 'Emma'" });
  });
});

describe('fetchPersonas', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('GETs /admin/personas and returns the list', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'elsa', name: 'Elsa' }, { id: 'belle', name: 'Belle' }],
    });
    const personas = await fetchPersonas();
    expect(personas).toHaveLength(2);
    expect(personas[0].id).toBe('elsa');
  });

  it('returns empty array on failure', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false });
    const personas = await fetchPersonas();
    expect(personas).toEqual([]);
  });
});
