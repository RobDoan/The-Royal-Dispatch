'use client';

import React, { useState } from 'react';
import { Trash2, ChevronDown, ChevronRight, Link, Check } from 'lucide-react';
import { createUser, deleteUser, type User } from '@/lib/api';

interface LinkedChildInfo {
  child_id: string;
  child_name: string;
  role: string | null;
}

interface UserWithChildren extends User {
  children: LinkedChildInfo[];
}

interface Props {
  initialUsers: UserWithChildren[];
}

export function UsersTable({ initialUsers }: Props) {
  const [users, setUsers] = useState<UserWithChildren[]>(initialUsers);
  const [name, setName] = useState('');
  const [chatId, setChatId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'http://localhost:3000';

  function handleCopyLink(e: React.MouseEvent, token: string, userId: string) {
    e.stopPropagation();
    const link = `${FRONTEND_URL}?token=${encodeURIComponent(token)}`;
    navigator.clipboard.writeText(link);
    setCopiedUserId(userId);
    setTimeout(() => setCopiedUserId(null), 2000);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !chatId.trim()) return;
    setSubmitting(true);
    setError(null);
    setNewToken(null);
    try {
      const user = await createUser(name.trim(), parseInt(chatId.trim(), 10));
      setUsers((prev) => [...prev, { ...user, children: [] }]);
      setNewToken(user.token);
      setName('');
      setChatId('');
    } catch (err: any) {
      setError(err.message || 'Failed to create user.');
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
          <span className="text-slate-400">User created. Share this link: </span>
          <code className="text-indigo-300 font-mono ml-1 break-all">{FRONTEND_URL}?token={newToken}</code>
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
              <React.Fragment key={user.id}>
                <tr
                  onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}
                  className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30 cursor-pointer"
                >
                  <td className="px-4 py-3 text-slate-200 font-medium">{user.name}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono">{user.telegram_chat_id}</td>
                  <td className="px-4 py-3">
                    <code className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded font-mono">{user.token}</code>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => handleCopyLink(e, user.token, user.id)}
                        className="text-slate-500 hover:text-indigo-400 transition-colors p-1 rounded"
                        title="Copy shareable link"
                      >
                        {copiedUserId === user.id ? <Check size={15} className="text-green-400" /> : <Link size={15} />}
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, user.id)}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
                        title="Remove user"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
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
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Linked Children</h4>
                      {user.children.length === 0 ? (
                        <p className="text-sm text-slate-500">No children linked. Link children from the Children page.</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {user.children.map((child) => (
                            <div key={child.child_id} className="flex items-center gap-2">
                              <span className="text-sm text-slate-300">{child.child_name}</span>
                              {child.role && (
                                <span className="text-xs text-slate-500">({child.role})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
