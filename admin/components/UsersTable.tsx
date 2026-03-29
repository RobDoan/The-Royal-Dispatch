'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { createUser, deleteUser, type User } from '@/lib/api';
import { cn } from '@/lib/utils';

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

  async function handleDelete(id: string) {
    if (!confirm('Remove this user? This cannot be undone.')) return;
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch {
      setError('Failed to remove user.');
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
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-sm">
                  No users yet. Add one above.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30">
                <td className="px-4 py-3 text-slate-200 font-medium">{user.name}</td>
                <td className="px-4 py-3 text-slate-400 font-mono">{user.telegram_chat_id}</td>
                <td className="px-4 py-3">
                  <code className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded font-mono">{user.token}</code>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(user.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
                    title="Remove user"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
