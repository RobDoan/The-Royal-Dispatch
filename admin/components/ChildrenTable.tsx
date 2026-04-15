'use client';

import React, { useState } from 'react';
import { Trash2, ChevronDown, ChevronRight, X } from 'lucide-react';
import {
  createChild, deleteChild, linkUserToChild, unlinkUserFromChild,
  updatePreferences,
  type ChildWithUsers, type User, type Persona, type LinkedUserInfo,
} from '@/lib/api';
import { CharactersPicker } from '@/components/CharactersPicker';

interface Props {
  initialChildren: ChildWithUsers[];
  allUsers: User[];
  personas: Persona[];
}

export function ChildrenTable({ initialChildren, allUsers, personas }: Props) {
  const [children, setChildren] = useState<ChildWithUsers[]>(initialChildren);
  const [childName, setChildName] = useState('');
  const [childTimezone, setChildTimezone] = useState('America/Los_Angeles');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);

  const [linkUserId, setLinkUserId] = useState<Record<string, string>>({});
  const [linkRole, setLinkRole] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<Record<string, string>>({});

  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleCreateChild(e: React.FormEvent) {
    e.preventDefault();
    if (!childName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const child = await createChild(childName.trim(), childTimezone);
      setChildren((prev) => [...prev, { ...child, users: [] }]);
      setChildName('');
      setChildTimezone('America/Los_Angeles');
    } catch (err: any) {
      setError(err.message || 'Failed to create child.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteChild(e: React.MouseEvent, childId: string) {
    e.stopPropagation();
    if (!confirm('Remove this child? This cannot be undone.')) return;
    try {
      await deleteChild(childId);
      setChildren((prev) => prev.filter((c) => c.id !== childId));
      if (expandedChildId === childId) setExpandedChildId(null);
    } catch {
      setError('Failed to remove child.');
    }
  }

  async function handleLinkUser(childId: string) {
    const userId = linkUserId[childId];
    const role = (linkRole[childId] ?? '').trim() || null;
    if (!userId) return;
    setLinking(childId);
    setLinkError((prev) => ({ ...prev, [childId]: '' }));
    try {
      await linkUserToChild(childId, userId, role);
      const user = allUsers.find((u) => u.id === userId);
      const newLink: LinkedUserInfo = { user_id: userId, name: user?.name ?? '', role };
      setChildren((prev) =>
        prev.map((c) => c.id === childId ? { ...c, users: [...c.users, newLink] } : c)
      );
      setLinkUserId((prev) => ({ ...prev, [childId]: '' }));
      setLinkRole((prev) => ({ ...prev, [childId]: '' }));
    } catch (err: any) {
      setLinkError((prev) => ({ ...prev, [childId]: err.message || 'Failed to link user.' }));
    } finally {
      setLinking(null);
    }
  }

  async function handleUnlinkUser(childId: string, userId: string) {
    if (!confirm('Unlink this user from the child?')) return;
    try {
      await unlinkUserFromChild(childId, userId);
      setChildren((prev) =>
        prev.map((c) => c.id === childId
          ? { ...c, users: c.users.filter((u) => u.user_id !== userId) }
          : c)
      );
    } catch {
      setLinkError((prev) => ({ ...prev, [childId]: 'Failed to unlink user.' }));
    }
  }

  async function handleSavePreferences(childId: string, selected: string[]) {
    setSaveError(null);
    try {
      await updatePreferences(childId, { favorite_princesses: selected });
      setChildren((prev) =>
        prev.map((c) => c.id === childId
          ? { ...c, preferences: { ...c.preferences, favorite_princesses: selected } }
          : c)
      );
    } catch {
      setSaveError('Failed to save preferences.');
    }
  }

  function availableUsers(childId: string): User[] {
    const child = children.find((c) => c.id === childId);
    const linkedIds = new Set(child?.users.map((u) => u.user_id) ?? []);
    return allUsers.filter((u) => !linkedIds.has(u.id));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Add child form */}
      <form onSubmit={handleCreateChild} className="flex gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--admin-text-secondary)]">Child Name</label>
          <input
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="e.g. Emma"
            className="px-3 py-2 rounded-[10px] text-sm border bg-[var(--admin-input-bg)] border-[var(--admin-input-border)] text-[var(--admin-text-primary)] placeholder-[var(--admin-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--admin-focus-ring)] w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--admin-text-secondary)]">Timezone</label>
          <input
            value={childTimezone}
            onChange={(e) => setChildTimezone(e.target.value)}
            placeholder="America/Los_Angeles"
            className="px-3 py-2 rounded-[10px] text-sm border bg-[var(--admin-input-bg)] border-[var(--admin-input-border)] text-[var(--admin-text-primary)] placeholder-[var(--admin-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--admin-focus-ring)] w-44"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !childName.trim()}
          className="px-4 py-2 rounded-[10px] text-sm font-bold bg-gradient-to-br from-[#FFD700] to-[#FFA500] text-[#1a0533] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {submitting ? 'Adding...' : '+ Add Child'}
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {saveError && <p className="text-sm text-red-500">{saveError}</p>}

      {/* Table */}
      <div className="rounded-2xl overflow-hidden bg-white border border-[var(--admin-card-border)] shadow-[var(--admin-card-shadow)]">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="border-b border-[var(--admin-card-border)]"
              style={{ background: 'linear-gradient(135deg, #2d1b69, #1a0533)' }}
            >
              <th className="px-4 py-3 text-left text-xs font-semibold text-white/60 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-white/60 uppercase tracking-wider">Timezone</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-white/60 uppercase tracking-wider">Linked Users</th>
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {children.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--admin-text-muted)] text-sm">
                  No children yet. Add one above.
                </td>
              </tr>
            )}
            {children.map((child) => (
              <React.Fragment key={child.id}>
                <tr
                  onClick={() => setExpandedChildId(expandedChildId === child.id ? null : child.id)}
                  className="border-b border-[var(--admin-card-border)] last:border-0 hover:bg-[var(--admin-purple)]/[0.04] cursor-pointer"
                >
                  <td className="px-4 py-3 text-[var(--admin-text-primary)] font-semibold">{child.name}</td>
                  <td className="px-4 py-3 text-[var(--admin-text-secondary)] text-xs font-mono">{child.timezone}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {child.users.length === 0 && (
                        <span className="text-[var(--admin-text-muted)] text-xs">No users linked</span>
                      )}
                      {child.users.map((u) => (
                        <span key={u.user_id} className="bg-[var(--admin-bg)] text-[var(--admin-text-secondary)] text-xs px-2 py-0.5 rounded">
                          {u.name}{u.role ? ` (${u.role})` : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => handleDeleteChild(e, child.id)}
                      className="text-[var(--admin-text-muted)] hover:text-red-500 transition-colors p-1 rounded"
                      title="Remove child"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {expandedChildId === child.id
                      ? <ChevronDown size={15} className="text-[var(--admin-text-muted)]" />
                      : <ChevronRight size={15} className="text-[var(--admin-text-muted)]" />}
                  </td>
                </tr>
                {expandedChildId === child.id && (
                  <tr key={`${child.id}-details`} className="border-b border-[var(--admin-card-border)] bg-[var(--admin-purple)]/[0.03]">
                    <td colSpan={5} className="px-8 py-4">
                      <div className="flex flex-col gap-4">
                        {/* Linked Users Section */}
                        <div>
                          <h4 className="text-xs font-semibold text-[var(--admin-text-secondary)] uppercase tracking-wider mb-2">Linked Users</h4>
                          {linkError[child.id] && (
                            <p className="text-sm text-red-500 mb-2">{linkError[child.id]}</p>
                          )}
                          {child.users.length > 0 && (
                            <div className="flex flex-col gap-1 mb-2">
                              {child.users.map((u) => (
                                <div key={u.user_id} className="flex items-center gap-2">
                                  <span className="text-sm text-[var(--admin-text-primary)]">{u.name}</span>
                                  {u.role && (
                                    <span className="text-xs text-[var(--admin-text-muted)]">({u.role})</span>
                                  )}
                                  <button
                                    onClick={() => handleUnlinkUser(child.id, u.user_id)}
                                    className="text-[var(--admin-text-muted)] hover:text-red-500 transition-colors p-1 rounded"
                                    title="Unlink user"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <form
                            onSubmit={(e) => { e.preventDefault(); handleLinkUser(child.id); }}
                            className="flex gap-2 items-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={linkUserId[child.id] ?? ''}
                              onChange={(e) => setLinkUserId((prev) => ({ ...prev, [child.id]: e.target.value }))}
                              className="px-3 py-1.5 rounded-[10px] text-sm border bg-[var(--admin-input-bg)] border-[var(--admin-input-border)] text-[var(--admin-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--admin-focus-ring)] w-44"
                            >
                              <option value="">Select user...</option>
                              {availableUsers(child.id).map((u) => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                            <input
                              value={linkRole[child.id] ?? ''}
                              onChange={(e) => setLinkRole((prev) => ({ ...prev, [child.id]: e.target.value }))}
                              placeholder="Role (e.g. mom)"
                              className="px-3 py-1.5 rounded-[10px] text-sm border bg-[var(--admin-input-bg)] border-[var(--admin-input-border)] text-[var(--admin-text-primary)] placeholder-[var(--admin-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--admin-focus-ring)] w-36"
                            />
                            <button
                              type="submit"
                              disabled={linking === child.id || !(linkUserId[child.id])}
                              className="px-3 py-1.5 rounded-[10px] text-sm font-bold bg-gradient-to-br from-[#FFD700] to-[#FFA500] text-[#1a0533] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                              {linking === child.id ? 'Linking...' : '+ Link'}
                            </button>
                          </form>
                        </div>

                        {/* Preferences Section */}
                        <div>
                          <h4 className="text-xs font-semibold text-[var(--admin-text-secondary)] uppercase tracking-wider mb-2">Favorite Characters</h4>
                          <CharactersPicker
                            key={`${child.id}-${(((child.preferences?.favorite_princesses ?? []) as string[]).join(','))}`}
                            childId={child.id}
                            personas={personas}
                            initialSelected={
                              Array.isArray(child.preferences?.favorite_princesses)
                                ? child.preferences.favorite_princesses as string[]
                                : []
                            }
                            onSave={handleSavePreferences}
                          />
                        </div>
                      </div>
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
