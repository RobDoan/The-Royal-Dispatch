'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Persona } from '@/lib/api';

const MAX_FAVORITES = 5;

interface Props {
  childId: string;
  personas: Persona[];
  initialSelected: string[];
  onSave: (childId: string, selected: string[]) => void;
}

export function CharactersPicker({ childId, personas, initialSelected, onSave }: Props) {
  const [selected, setSelected] = useState<string[]>(initialSelected);

  function toggle(id: string) {
    if (selected.includes(id)) {
      const next = selected.filter((s) => s !== id);
      setSelected(next);
      onSave(childId, next);
    } else {
      if (selected.length >= MAX_FAVORITES) return; // max reached
      const next = [...selected, id];
      setSelected(next);
      onSave(childId, next);
    }
  }

  const atMax = selected.length >= MAX_FAVORITES;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">
        <span className="text-slate-300 font-medium">{selected.length} / {MAX_FAVORITES} selected</span>
        {selected.length === 0 && <span className="ml-2 text-slate-600">(shows all)</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {personas.map((persona) => {
          const isSelected = selected.includes(persona.id);
          const isDisabled = !isSelected && atMax;
          return (
            <button
              key={persona.id}
              data-testid={`chip-${persona.id}`}
              onClick={() => toggle(persona.id)}
              disabled={isDisabled}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                isSelected
                  ? 'bg-indigo-900/60 border-indigo-500 text-indigo-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500',
                isDisabled && 'opacity-40 cursor-not-allowed',
              )}
            >
              {persona.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
