'use client';

interface Props {
  princess: { id: string; name: string; emoji: string };
  message: string;
}

const SPARKLE_COLORS = ['#FFD700', '#FFE066', '#FFA500', '#FFFACD', '#FFD700'];

// Deterministic pseudo-random sparkle positions (no Math.random, SSR-safe)
function seededValue(i: number, offset: number): number {
  return ((i * 2654435761 + offset) >>> 0) / 4294967296;
}

const SPARKLES = Array.from({ length: 28 }, (_, i) => ({
  left: `${seededValue(i, 1) * 100}%`,
  top: `${seededValue(i, 2) * 100}%`,
  delay: `${seededValue(i, 3) * 6}s`,
  duration: `${3 + seededValue(i, 4) * 4}s`,
  size: 2 + seededValue(i, 5) * 5,
  color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
}));

export function StoryWaiting({ princess, message }: Props) {

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0a0118]">
      {/* Princess image with slow Ken Burns */}
      <div className="absolute inset-0">
        <img
          src={`/characters/${princess.id}.png`}
          alt={princess.name}
          className="w-full h-full object-cover object-top opacity-35 scale-110"
          style={{ animation: 'ken-burns 25s ease-in-out infinite alternate' }}
        />
        {/* Gradient overlays for depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0118]/50 via-transparent to-[#0a0118]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1a0533] via-[#1a0533]/40 to-transparent" />
      </div>

      {/* Floating sparkles */}
      {SPARKLES.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            background: s.color,
            boxShadow: `0 0 ${s.size * 3}px ${s.color}`,
            animation: `sparkle-drift ${s.duration} ${s.delay} ease-in-out infinite`,
            opacity: 0,
          }}
        />
      ))}

      {/* Content — centered lower third */}
      <div className="relative z-10 flex flex-col items-center justify-end h-full pb-[18vh] px-8">
        {/* Glowing orb behind emoji */}
        <div className="relative mb-6">
          <div
            className="absolute inset-0 -m-10 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(255,215,0,0.18) 0%, transparent 65%)',
              animation: 'glow-breathe 3s ease-in-out infinite',
            }}
          />
          <div
            className="text-6xl relative"
            style={{ animation: 'float 4s ease-in-out infinite' }}
          >
            {princess.emoji}
          </div>
        </div>

        {/* Quill writing indicator */}
        <div className="mb-5 flex items-center gap-1.5 opacity-70">
          <span
            className="text-2xl inline-block"
            style={{ animation: 'quill-write 1.8s ease-in-out infinite' }}
          >
            ✍️
          </span>
        </div>

        {/* Message */}
        <p
          className="text-[22px] font-bold text-white/90 text-center max-w-[280px] leading-snug mb-7"
          style={{ fontFamily: '"Nunito", sans-serif' }}
        >
          {message}
        </p>

        {/* Pulsing dots progress */}
        <div className="flex gap-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full"
              style={{
                background: 'var(--color-gold)',
                boxShadow: '0 0 8px rgba(255,215,0,0.5)',
                animation: `dot-pulse 1.4s ${i * 0.2}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
