'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Persona } from '@/lib/api';

const MAX_FAVORITES = 5;

const CHIP_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  elsa: { bg: 'var(--chip-elsa-bg)', border: 'var(--chip-elsa-border)', text: 'var(--chip-elsa-text)' },
  belle: { bg: 'var(--chip-belle-bg)', border: 'var(--chip-belle-border)', text: 'var(--chip-belle-text)' },
  cinderella: { bg: 'var(--chip-cinderella-bg)', border: 'var(--chip-cinderella-border)', text: 'var(--chip-cinderella-text)' },
  ariel: { bg: 'var(--chip-ariel-bg)', border: 'var(--chip-ariel-border)', text: 'var(--chip-ariel-text)' },
};

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
      <p className="text-xs text-[var(--admin-text-secondary)]">
        <span className="text-[var(--admin-text-primary)] font-medium">{selected.length} / {MAX_FAVORITES} selected</span>
        {selected.length === 0 && <span className="ml-2 text-[var(--admin-text-muted)]">(shows all)</span>}
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
                  ? ''
                  : 'bg-white border-[var(--admin-input-border)] text-[var(--admin-text-muted)] hover:border-[var(--admin-purple)]/30',
                isDisabled && 'opacity-40 cursor-not-allowed',
              )}
              style={isSelected ? {
                backgroundColor: CHIP_STYLES[persona.id]?.bg,
                borderColor: CHIP_STYLES[persona.id]?.border,
                color: CHIP_STYLES[persona.id]?.text,
              } : undefined}
            >
              {persona.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
