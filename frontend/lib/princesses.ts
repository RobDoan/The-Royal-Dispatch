export const PRINCESS_META = {
  elsa:       { name: 'Queen Elsa',  emoji: '❄️',  origin: 'Kingdom of Arendelle' },
  belle:      { name: 'Belle',       emoji: '📚',  origin: 'The Enchanted Castle' },
  cinderella: { name: 'Cinderella',  emoji: '👠',  origin: 'The Royal Palace' },
  ariel:      { name: 'Ariel',       emoji: '🐠',  origin: 'Under the Sea' },
} as const;

export const PRINCESS_OVERLAY: Record<string, string> = {
  elsa:       'rgba(147, 197, 253, 0.25)',
  belle:      'rgba(252, 211, 77, 0.25)',
  cinderella: 'rgba(249, 168, 212, 0.25)',
  ariel:      'rgba(110, 231, 183, 0.25)',
};

export type PrincessId = keyof typeof PRINCESS_META;
