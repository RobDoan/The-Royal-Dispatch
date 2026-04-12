'use client';

import { useEffect, useState } from 'react';
import { listUsers, listPersonas, listChildren, updatePreferences, type User, type Persona, type Child } from '@/lib/api';
import { CharactersPicker } from '@/components/CharactersPicker';

interface ChildWithParent extends Child {
  parentName: string;
}

export default function CharactersPage() {
  const [children, setChildren] = useState<ChildWithParent[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [prefs, setPrefs] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [users, p] = await Promise.all([listUsers(), listPersonas()]);
        setPersonas(p);
        const allChildren: ChildWithParent[] = [];
        const prefsMap: Record<string, string[]> = {};
        await Promise.all(
          users.map(async (user) => {
            try {
              const kids = await listChildren(user.id);
              for (const kid of kids) {
                allChildren.push({ ...kid, parentName: user.name });
                const fp = kid.preferences?.favorite_princesses;
                prefsMap[kid.id] = Array.isArray(fp) ? fp : [];
              }
            } catch {
              // skip user if children fail to load
            }
          }),
        );
        setChildren(allChildren);
        setPrefs(prefsMap);
      } catch {
        setError('Failed to load data. Please refresh and try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave(childId: string, selected: string[]) {
    const previous = prefs[childId] ?? [];
    setPrefs((prev) => ({ ...prev, [childId]: selected }));
    setSaveError(null);
    try {
      await updatePreferences(childId, { favorite_princesses: selected });
    } catch {
      setPrefs((prev) => ({ ...prev, [childId]: previous }));
      setSaveError('Failed to save preferences. Please try again.');
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar */}
      <div className="h-13 flex-shrink-0 flex items-center px-6 border-b gap-2"
        style={{ borderColor: 'var(--sidebar-border)', background: 'var(--topbar-bg)' }}>
        <h1 className="text-sm font-semibold text-slate-100">Favorite Characters</h1>
        <span className="text-xs text-slate-500">per child · max 5</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="p-6 text-sm text-slate-500">Loading...</p>
        )}
        {!loading && error && (
          <p className="p-6 text-sm text-red-400">{error}</p>
        )}
        {!loading && !error && children.length === 0 && (
          <p className="p-6 text-sm text-slate-500">No children yet. Add children to users first.</p>
        )}
        {saveError && (
          <p className="px-6 py-2 text-sm text-red-400">{saveError}</p>
        )}
        {!loading && !error && children.map((child) => (
          <div key={child.id} className="flex items-start gap-6 px-6 py-4 border-b last:border-0"
            style={{ borderColor: 'var(--sidebar-border)' }}>
            <div className="min-w-36">
              <p className="text-sm font-semibold text-slate-100">{child.name}</p>
              <p className="text-xs text-slate-500">{child.parentName}</p>
            </div>
            <CharactersPicker
              key={`${child.id}-${(prefs[child.id] ?? []).join(',')}`}
              childId={child.id}
              personas={personas}
              initialSelected={prefs[child.id] ?? []}
              onSave={handleSave}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
