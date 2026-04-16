'use client';

import { useTranslations } from 'next-intl';
import type { Persona } from '@/lib/user';
import { cn } from '@/lib/utils';

const MAX_FAVORITES = 5;

interface Props {
  personas: Persona[];
  value: string[];
  onChange: (next: string[]) => void;
}

export function CharactersPicker({ personas, value, onChange }: Props) {
  const t = useTranslations('onboarding');

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      if (value.length >= MAX_FAVORITES) return;
      onChange([...value, id]);
    }
  }

  const atMax = value.length >= MAX_FAVORITES;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-white/60">
        <span className="text-white font-medium">
          {t('favoritesCount', { selected: value.length, max: MAX_FAVORITES })}
        </span>
        {value.length === 0 && <span className="ml-2 text-white/40">{t('favoritesEmptyHint')}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {personas.map((p) => {
          const selected = value.includes(p.id);
          const disabled = !selected && atMax;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              disabled={disabled}
              aria-pressed={selected}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                selected
                  ? 'bg-[var(--color-gold)]/20 border-[var(--color-gold)] text-white'
                  : 'bg-white/5 border-white/20 text-white/70 hover:border-white/40',
                disabled && 'opacity-40 cursor-not-allowed',
              )}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
