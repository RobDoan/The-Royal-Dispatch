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
          <label className="text-xs font-medium text-[var(--admin-text-secondary)]">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quy (Dad)"
            className="px-3 py-2 rounded-[10px] text-sm border bg-[var(--admin-input-bg)] border-[var(--admin-input-border)] text-[var(--admin-text-primary)] placeholder-[var(--admin-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--admin-focus-ring)] w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--admin-text-secondary)]">Telegram Chat ID</label>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="e.g. 5863873556"
            type="number"
            className="px-3 py-2 rounded-[10px] text-sm border bg-[var(--admin-input-bg)] border-[var(--admin-input-border)] text-[var(--admin-text-primary)] placeholder-[var(--admin-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--admin-focus-ring)] w-44"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !name.trim() || !chatId.trim()}
          className="px-4 py-2 rounded-[10px] text-sm font-bold bg-gradient-to-br from-[#FFD700] to-[#FFA500] text-[#1a0533] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {submitting ? 'Adding...' : '+ Add User'}
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {newToken && (
        <div className="p-3 rounded-md bg-white border border-[var(--admin-purple)]/30 text-sm">
          <span className="text-[var(--admin-text-secondary)]">User created. Share this link: </span>
          <code className="text-[var(--admin-purple)] font-mono ml-1 break-all">{FRONTEND_URL}?token={newToken}</code>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl overflow-hidden bg-white border border-[var(--admin-card-border)] shadow-[var(--admin-card-shadow)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--admin-card-border)]" style={{ background: 'linear-gradient(135deg, #2d1b69, #1a0533)' }}>
              <th className="px-4 py-3 text-left text-xs font-semibold text-white/60 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-white/60 uppercase tracking-wider">Telegram Chat ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-white/60 uppercase tracking-wider">Token</th>
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--admin-text-muted)] text-sm">
                  No users yet. Add one above.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <React.Fragment key={user.id}>
                <tr
                  onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}
                  className="border-b border-[var(--admin-card-border)] last:border-0 hover:bg-[var(--admin-purple)]/[0.04] cursor-pointer"
                >
                  <td className="px-4 py-3 text-[var(--admin-text-primary)] font-semibold">{user.name}</td>
                  <td className="px-4 py-3 text-[var(--admin-text-secondary)] font-mono">{user.telegram_chat_id}</td>
                  <td className="px-4 py-3">
                    <code className="bg-[var(--admin-bg)] text-[var(--admin-text-secondary)] text-xs px-2 py-1 rounded font-mono">{user.token}</code>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => handleCopyLink(e, user.token, user.id)}
                        className="text-[var(--admin-text-muted)] hover:text-[var(--admin-purple)] transition-colors p-1 rounded"
                        title="Copy shareable link"
                      >
                        {copiedUserId === user.id ? <Check size={15} className="text-green-400" /> : <Link size={15} />}
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, user.id)}
                        className="text-[var(--admin-text-muted)] hover:text-red-500 transition-colors p-1 rounded"
                        title="Remove user"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {expandedUserId === user.id
                      ? <ChevronDown size={15} className="text-[var(--admin-text-muted)]" />
                      : <ChevronRight size={15} className="text-[var(--admin-text-muted)]" />}
                  </td>
                </tr>
                {expandedUserId === user.id && (
                  <tr key={`${user.id}-children`} className="border-b border-[var(--admin-card-border)] bg-[var(--admin-purple)]/[0.03]">
                    <td colSpan={5} className="px-8 py-3">
                      <h4 className="text-xs font-semibold text-[var(--admin-text-secondary)] uppercase tracking-wider mb-2">Linked Children</h4>
                      {user.children.length === 0 ? (
                        <p className="text-sm text-[var(--admin-text-muted)]">No children linked. Link children from the Children page.</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {user.children.map((child) => (
                            <div key={child.child_id} className="flex items-center gap-2">
                              <span className="text-sm text-[var(--admin-text-primary)]">{child.child_name}</span>
                              {child.role && (
                                <span className="text-xs text-[var(--admin-text-muted)]">({child.role})</span>
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
