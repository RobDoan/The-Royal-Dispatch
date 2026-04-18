# Admin Child UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline child management (view / add / delete) to each user row in the admin `/users` page.

**Architecture:** Two files change — `admin/lib/api.ts` gets a `Child` type and three API functions; `admin/components/UsersTable.tsx` gets expand/collapse row state, a lazy-loaded children list, and an inline add/delete form. No new pages or components are created.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind, Vitest + @testing-library/react

---

### Task 1: Child API functions

**Files:**
- Modify: `admin/lib/api.ts`
- Modify: `admin/tests/api.test.ts`

- [ ] **Step 1: Write failing tests** — append to `admin/tests/api.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd admin && npx vitest run tests/api.test.ts
```

Expected: FAIL — `listChildren`, `createChild`, `deleteChild` not exported from `@/lib/api`.

- [ ] **Step 3: Add `Child` interface and three functions to `admin/lib/api.ts`**

After the existing `Persona` interface, add:

```ts
export interface Child {
  id: string;
  parent_id: string;
  name: string;
  timezone: string;
  preferences: Record<string, unknown>;
  created_at: string;
}
```

After `listPersonas`, add:

```ts
export async function listChildren(userId: string): Promise<Child[]> {
  const res = await fetch(`${API_URL}/admin/users/${userId}/children`);
  if (!res.ok) throw new Error('Failed to list children');
  return res.json();
}

export async function createChild(userId: string, name: string): Promise<Child> {
  const res = await fetch(`${API_URL}/admin/users/${userId}/children`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create child');
  return res.json();
}

export async function deleteChild(childId: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/children/${childId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete child');
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd admin && npx vitest run tests/api.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add admin/lib/api.ts admin/tests/api.test.ts
git commit -m "feat: add Child type and listChildren/createChild/deleteChild API functions"
```

---

### Task 2: Row expand/collapse and children display

**Files:**
- Create: `admin/tests/UsersTable.test.tsx`
- Modify: `admin/components/UsersTable.tsx`

- [ ] **Step 1: Write failing tests** — create `admin/tests/UsersTable.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UsersTable } from '@/components/UsersTable';
import * as api from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    listChildren: vi.fn(),
    createChild: vi.fn(),
    deleteChild: vi.fn(),
  };
});

const mockUsers: api.User[] = [
  { id: 'u1', name: 'Quy', telegram_chat_id: 12345, token: 'tk_abc', created_at: '2026-01-01T00:00:00Z' },
];

const mockChildren: api.Child[] = [
  { id: 'c1', parent_id: 'u1', name: 'Emma', timezone: 'America/Los_Angeles', preferences: {}, created_at: '2026-01-01T00:00:00Z' },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe('UsersTable — row expand/collapse', () => {
  it('clicking a user row fetches and displays children', async () => {
    vi.mocked(api.listChildren).mockResolvedValueOnce(mockChildren);
    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    expect(api.listChildren).toHaveBeenCalledWith('u1');
    await waitFor(() => expect(screen.getByText('Emma')).toBeInTheDocument());
  });

  it('shows loading state while fetching', async () => {
    vi.mocked(api.listChildren).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(mockChildren), 100)),
    );
    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Emma')).toBeInTheDocument());
  });

  it('shows empty state when user has no children', async () => {
    vi.mocked(api.listChildren).mockResolvedValueOnce([]);
    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    await waitFor(() => expect(screen.getByText('No children yet.')).toBeInTheDocument());
  });

  it('clicking an expanded row collapses it', async () => {
    vi.mocked(api.listChildren).mockResolvedValueOnce(mockChildren);
    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    await waitFor(() => expect(screen.getByText('Emma')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Quy'));
    expect(screen.queryByText('Emma')).not.toBeInTheDocument();
  });

  it('re-expanding does not re-fetch children', async () => {
    vi.mocked(api.listChildren).mockResolvedValueOnce(mockChildren);
    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    await waitFor(() => expect(screen.getByText('Emma')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Quy')); // collapse
    fireEvent.click(screen.getByText('Quy')); // re-expand
    expect(api.listChildren).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Emma')).toBeInTheDocument();
  });

  it('shows error when listChildren fails', async () => {
    vi.mocked(api.listChildren).mockRejectedValueOnce(new Error('network'));
    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    await waitFor(() => expect(screen.getByText('Failed to load children.')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd admin && npx vitest run tests/UsersTable.test.tsx
```

Expected: FAIL — no expand behavior exists yet.

- [ ] **Step 3: Implement expand/collapse and children display in `admin/components/UsersTable.tsx`**

Replace the full file with:

```tsx
'use client';

import { useState } from 'react';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { createUser, deleteUser, listChildren, createChild, deleteChild, type User, type Child } from '@/lib/api';

interface Props {
  initialUsers: User[];
}

export function UsersTable({ initialUsers }: Props) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [name, setName] = useState('');
  const [chatId, setChatId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);

  // Children state
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [childrenByUser, setChildrenByUser] = useState<Record<string, Child[]>>({});
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set());
  const [childError, setChildError] = useState<Record<string, string>>({});
  const [newChildName, setNewChildName] = useState<Record<string, string>>({});
  const [addingChild, setAddingChild] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !chatId.trim()) return;
    setSubmitting(true);
    setError(null);
    setNewToken(null);
    try {
      const user = await createUser(name.trim(), parseInt(chatId.trim(), 10));
      setUsers((prev) => [...prev, user]);
      setNewToken(user.token);
      setName('');
      setChatId('');
    } catch {
      setError('Failed to create user. Check the Telegram chat ID is unique.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('Remove this user? This cannot be undone.')) return;
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      if (expandedUserId === id) setExpandedUserId(null);
    } catch {
      setError('Failed to remove user.');
    }
  }

  async function handleRowClick(userId: string) {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(userId);
    if (childrenByUser[userId] !== undefined) return; // already cached
    setLoadingChildren((prev) => new Set(prev).add(userId));
    try {
      const kids = await listChildren(userId);
      setChildrenByUser((prev) => ({ ...prev, [userId]: kids }));
    } catch {
      setChildError((prev) => ({ ...prev, [userId]: 'Failed to load children.' }));
    } finally {
      setLoadingChildren((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  async function handleAddChild(userId: string) {
    const childName = (newChildName[userId] ?? '').trim();
    if (!childName) return;
    setAddingChild(userId);
    setChildError((prev) => ({ ...prev, [userId]: '' }));
    try {
      const child = await createChild(userId, childName);
      setChildrenByUser((prev) => ({ ...prev, [userId]: [...(prev[userId] ?? []), child] }));
      setNewChildName((prev) => ({ ...prev, [userId]: '' }));
    } catch {
      setChildError((prev) => ({ ...prev, [userId]: 'Failed to add child.' }));
    } finally {
      setAddingChild(null);
    }
  }

  async function handleDeleteChild(e: React.MouseEvent, userId: string, childId: string) {
    e.stopPropagation();
    if (!confirm('Remove this child? This cannot be undone.')) return;
    try {
      await deleteChild(childId);
      setChildrenByUser((prev) => ({ ...prev, [userId]: prev[userId].filter((c) => c.id !== childId) }));
    } catch {
      setChildError((prev) => ({ ...prev, [userId]: 'Failed to remove child.' }));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Add user form */}
      <form onSubmit={handleCreate} className="flex gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quy (Dad)"
            className="px-3 py-2 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Telegram Chat ID</label>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="e.g. 5863873556"
            type="number"
            className="px-3 py-2 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !name.trim() || !chatId.trim()}
          className="px-4 py-2 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Adding...' : '+ Add User'}
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {newToken && (
        <div className="p-3 rounded-md bg-slate-800 border border-indigo-600 text-sm">
          <span className="text-slate-400">User created. Share this token for the frontend URL: </span>
          <code className="text-indigo-300 font-mono ml-1">{newToken}</code>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Telegram Chat ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Token</th>
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                  No users yet. Add one above.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <>
                <tr
                  key={user.id}
                  onClick={() => handleRowClick(user.id)}
                  className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30 cursor-pointer"
                >
                  <td className="px-4 py-3 text-slate-200 font-medium">{user.name}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono">{user.telegram_chat_id}</td>
                  <td className="px-4 py-3">
                    <code className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded font-mono">{user.token}</code>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => handleDelete(e, user.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
                      title="Remove user"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {expandedUserId === user.id
                      ? <ChevronDown size={15} className="text-slate-400" />
                      : <ChevronRight size={15} className="text-slate-600" />}
                  </td>
                </tr>
                {expandedUserId === user.id && (
                  <tr key={`${user.id}-children`} className="border-b border-slate-800 bg-slate-800/20">
                    <td colSpan={5} className="px-8 py-3">
                      {loadingChildren.has(user.id) && (
                        <p className="text-sm text-slate-500">Loading…</p>
                      )}
                      {!loadingChildren.has(user.id) && childError[user.id] && (
                        <p className="text-sm text-red-400">{childError[user.id]}</p>
                      )}
                      {!loadingChildren.has(user.id) && !childError[user.id] && (
                        <div className="flex flex-col gap-2">
                          {(childrenByUser[user.id] ?? []).length === 0 ? (
                            <p className="text-sm text-slate-500">No children yet.</p>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {childrenByUser[user.id].map((child) => (
                                <div key={child.id} className="flex items-center gap-2">
                                  <span className="text-sm text-slate-300">{child.name}</span>
                                  <button
                                    onClick={(e) => handleDeleteChild(e, user.id, child.id)}
                                    className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
                                    title="Remove child"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <form
                            onSubmit={(e) => { e.preventDefault(); handleAddChild(user.id); }}
                            className="flex gap-2 items-center mt-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              value={newChildName[user.id] ?? ''}
                              onChange={(e) => setNewChildName((prev) => ({ ...prev, [user.id]: e.target.value }))}
                              placeholder="Child name"
                              className="px-3 py-1.5 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-40"
                            />
                            <button
                              type="submit"
                              disabled={addingChild === user.id || !(newChildName[user.id] ?? '').trim()}
                              className="px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {addingChild === user.id ? 'Adding…' : '+ Add'}
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd admin && npx vitest run tests/UsersTable.test.tsx
```

Expected: all 6 tests in `UsersTable — row expand/collapse` PASS.

- [ ] **Step 5: Commit**

```bash
git add admin/components/UsersTable.tsx admin/tests/UsersTable.test.tsx
git commit -m "feat: expand user rows to show children with lazy fetch and caching"
```

---

### Task 3: Add and delete child forms

**Files:**
- Modify: `admin/tests/UsersTable.test.tsx` (append new describe block)
- No component changes needed — forms are already in Task 2's implementation

- [ ] **Step 1: Append tests to `admin/tests/UsersTable.test.tsx`** — these will pass immediately since the implementation is already in place from Task 2:

```tsx
describe('UsersTable — add child', () => {
  it('submitting the add form calls createChild and appends to list', async () => {
    vi.mocked(api.listChildren).mockResolvedValueOnce([]);
    const newChild: api.Child = { id: 'c2', parent_id: 'u1', name: 'Max', timezone: 'America/Los_Angeles', preferences: {}, created_at: '2026-01-02T00:00:00Z' };
    vi.mocked(api.createChild).mockResolvedValueOnce(newChild);

    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    await waitFor(() => expect(screen.getByPlaceholderText('Child name')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Child name'), { target: { value: 'Max' } });
    fireEvent.click(screen.getByText('+ Add'));

    expect(api.createChild).toHaveBeenCalledWith('u1', 'Max');
    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    expect((screen.getByPlaceholderText('Child name') as HTMLInputElement).value).toBe('');
  });

  it('shows error when createChild fails', async () => {
    vi.mocked(api.listChildren).mockResolvedValueOnce([]);
    vi.mocked(api.createChild).mockRejectedValueOnce(new Error('network'));

    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    await waitFor(() => expect(screen.getByPlaceholderText('Child name')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Child name'), { target: { value: 'Max' } });
    fireEvent.click(screen.getByText('+ Add'));

    await waitFor(() => expect(screen.getByText('Failed to add child.')).toBeInTheDocument());
  });
});

describe('UsersTable — delete child', () => {
  it('clicking delete removes the child from the list', async () => {
    vi.mocked(api.listChildren).mockResolvedValueOnce(mockChildren);
    vi.mocked(api.deleteChild).mockResolvedValueOnce(undefined);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);

    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    await waitFor(() => expect(screen.getByText('Emma')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Remove child'));
    expect(api.deleteChild).toHaveBeenCalledWith('c1');
    await waitFor(() => expect(screen.queryByText('Emma')).not.toBeInTheDocument());
  });

  it('shows error when deleteChild fails', async () => {
    vi.mocked(api.listChildren).mockResolvedValueOnce(mockChildren);
    vi.mocked(api.deleteChild).mockRejectedValueOnce(new Error('network'));
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);

    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    await waitFor(() => expect(screen.getByText('Emma')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Remove child'));
    await waitFor(() => expect(screen.getByText('Failed to remove child.')).toBeInTheDocument());
    expect(screen.getByText('Emma')).toBeInTheDocument(); // not removed
  });
});
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
cd admin && npx vitest run tests/UsersTable.test.tsx
```

Expected: all 10 tests PASS.

- [ ] **Step 3: Run all admin tests to confirm nothing is broken**

```bash
cd admin && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add admin/tests/UsersTable.test.tsx
git commit -m "test: add/delete child form tests for UsersTable"
```
