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
          <label className="text-xs font-medium text-slate-400">Child Name</label>
          <input
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="e.g. Emma"
            className="px-3 py-2 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Timezone</label>
          <input
            value={childTimezone}
            onChange={(e) => setChildTimezone(e.target.value)}
            placeholder="America/Los_Angeles"
            className="px-3 py-2 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !childName.trim()}
          className="px-4 py-2 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Adding...' : '+ Add Child'}
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {saveError && <p className="text-sm text-red-400">{saveError}</p>}

      {/* Table */}
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Timezone</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Linked Users</th>
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {children.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                  No children yet. Add one above.
                </td>
              </tr>
            )}
            {children.map((child) => (
              <React.Fragment key={child.id}>
                <tr
                  onClick={() => setExpandedChildId(expandedChildId === child.id ? null : child.id)}
                  className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30 cursor-pointer"
                >
                  <td className="px-4 py-3 text-slate-200 font-medium">{child.name}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono">{child.timezone}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {child.users.length === 0 && (
                        <span className="text-slate-600 text-xs">No users linked</span>
                      )}
                      {child.users.map((u) => (
                        <span key={u.user_id} className="bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded">
                          {u.name}{u.role ? ` (${u.role})` : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => handleDeleteChild(e, child.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
                      title="Remove child"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {expandedChildId === child.id
                      ? <ChevronDown size={15} className="text-slate-400" />
                      : <ChevronRight size={15} className="text-slate-600" />}
                  </td>
                </tr>
                {expandedChildId === child.id && (
                  <tr key={`${child.id}-details`} className="border-b border-slate-800 bg-slate-800/20">
                    <td colSpan={5} className="px-8 py-4">
                      <div className="flex flex-col gap-4">
                        {/* Linked Users Section */}
                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Linked Users</h4>
                          {linkError[child.id] && (
                            <p className="text-sm text-red-400 mb-2">{linkError[child.id]}</p>
                          )}
                          {child.users.length > 0 && (
                            <div className="flex flex-col gap-1 mb-2">
                              {child.users.map((u) => (
                                <div key={u.user_id} className="flex items-center gap-2">
                                  <span className="text-sm text-slate-300">{u.name}</span>
                                  {u.role && (
                                    <span className="text-xs text-slate-500">({u.role})</span>
                                  )}
                                  <button
                                    onClick={() => handleUnlinkUser(child.id, u.user_id)}
                                    className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
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
                              className="px-3 py-1.5 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
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
                              className="px-3 py-1.5 rounded-md text-sm border bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36"
                            />
                            <button
                              type="submit"
                              disabled={linking === child.id || !(linkUserId[child.id])}
                              className="px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {linking === child.id ? 'Linking...' : '+ Link'}
                            </button>
                          </form>
                        </div>

                        {/* Preferences Section */}
                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Favorite Characters</h4>
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
