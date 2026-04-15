export const PRINCESS_META = {
  elsa:       { name: 'Queen Elsa',          emoji: '❄️',  origin: 'Kingdom of Arendelle' },
  belle:      { name: 'Belle',               emoji: '📚',  origin: 'The Enchanted Castle' },
  cinderella: { name: 'Cinderella',          emoji: '👠',  origin: 'The Royal Palace' },
  ariel:      { name: 'Ariel',               emoji: '🐠',  origin: 'Under the Sea' },
  rapunzel:   { name: 'Princess Rapunzel',   emoji: '🌻',  origin: 'Kingdom of Corona' },
  moana:      { name: 'Moana',               emoji: '🌊',  origin: 'Motunui Island' },
  raya:       { name: 'Raya',                emoji: '🐉',  origin: 'Kumandra' },
  mirabel:    { name: 'Mirabel',             emoji: '🦋',  origin: 'The Encanto' },
  chase:      { name: 'Chase',               emoji: '🐕‍🦺', origin: 'Adventure Bay (Police Pup)' },
  marshall:   { name: 'Marshall',            emoji: '🔥',  origin: 'Adventure Bay (Fire Pup)' },
  skye:       { name: 'Skye',                emoji: '✈️',  origin: 'Adventure Bay (Aviation Pup)' },
  rubble:     { name: 'Rubble',              emoji: '🏗️',  origin: 'Adventure Bay (Construction Pup)' },
} as const;

export const PRINCESS_OVERLAY: Record<string, string> = {
  elsa:       'rgba(147, 197, 253, 0.25)',
  belle:      'rgba(252, 211, 77, 0.25)',
  cinderella: 'rgba(249, 168, 212, 0.25)',
  ariel:      'rgba(110, 231, 183, 0.25)',
  rapunzel:   'rgba(253, 224, 71, 0.25)',
  moana:      'rgba(56, 189, 248, 0.25)',
  raya:       'rgba(167, 139, 250, 0.25)',
  mirabel:    'rgba(52, 211, 153, 0.25)',
  chase:      'rgba(59, 130, 246, 0.25)',
  marshall:   'rgba(239, 68, 68, 0.25)',
  skye:       'rgba(244, 114, 182, 0.25)',
  rubble:     'rgba(251, 191, 36, 0.25)',
};

export type PrincessId = keyof typeof PRINCESS_META;
