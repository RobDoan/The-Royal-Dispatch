'use client';

import { useEffect, useState } from 'react';
import { listUsers, listPersonas, getPreferences, updatePreferences, type User, type Persona } from '@/lib/api';
import { CharactersPicker } from '@/components/CharactersPicker';

export default function CharactersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [prefs, setPrefs] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [u, p] = await Promise.all([listUsers(), listPersonas()]);
        setUsers(u);
        setPersonas(p);
        const prefsMap: Record<string, string[]> = {};
        await Promise.all(
          u.map(async (user) => {
            try {
              const pref = await getPreferences(user.id);
              prefsMap[user.id] = pref.config.favorite_princesses ?? [];
            } catch {
              prefsMap[user.id] = [];
            }
          }),
        );
        setPrefs(prefsMap);
      } catch {
        setError('Failed to load users or personas. Please refresh and try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave(userId: string, selected: string[]) {
    const previous = prefs[userId] ?? [];
    setPrefs((prev) => ({ ...prev, [userId]: selected }));
    setSaveError(null);
    try {
      await updatePreferences(userId, { favorite_princesses: selected });
    } catch {
      setPrefs((prev) => ({ ...prev, [userId]: previous }));
      setSaveError('Failed to save preferences. Please try again.');
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar */}
      <div className="h-13 flex-shrink-0 flex items-center px-6 border-b gap-2"
        style={{ borderColor: 'var(--sidebar-border)', background: 'var(--topbar-bg)' }}>
        <h1 className="text-sm font-semibold text-slate-100">Favorite Characters</h1>
        <span className="text-xs text-slate-500">per user · max 5</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="p-6 text-sm text-slate-500">Loading...</p>
        )}
        {!loading && error && (
          <p className="p-6 text-sm text-red-400">{error}</p>
        )}
        {!loading && !error && users.length === 0 && (
          <p className="p-6 text-sm text-slate-500">No users yet. Add users first.</p>
        )}
        {saveError && (
          <p className="px-6 py-2 text-sm text-red-400">{saveError}</p>
        )}
        {!loading && !error && users.map((user) => (
          <div key={user.id} className="flex items-start gap-6 px-6 py-4 border-b last:border-0"
            style={{ borderColor: 'var(--sidebar-border)' }}>
            <div className="min-w-36">
              <p className="text-sm font-semibold text-slate-100">{user.name}</p>
            </div>
            <CharactersPicker
              key={`${user.id}-${(prefs[user.id] ?? []).join(',')}`}
              userId={user.id}
              personas={personas}
              initialSelected={prefs[user.id] ?? []}
              onSave={handleSave}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
