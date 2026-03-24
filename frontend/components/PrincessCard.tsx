'use client';

export interface PrincessConfig {
  id: 'elsa' | 'belle' | 'cinderella' | 'ariel';
  name: string;
  origin: string;
  emoji: string;
  bgColor: string;
  borderColor: string;
  labelColor: string;
  nameColor: string;
  avatarGradient: string;
  badgeBg: string;
}

interface Props {
  princess: PrincessConfig;
  onClick: (id: PrincessConfig['id']) => void;
  isLoading?: boolean;
}

export function PrincessCard({ princess, onClick, isLoading }: Props) {
  return (
    <button
      onClick={() => onClick(princess.id)}
      disabled={isLoading}
      className={`w-full ${princess.bgColor} border-2 ${princess.borderColor} rounded-2xl p-4 flex items-center gap-4 transition-transform active:scale-95 disabled:opacity-60`}
    >
      <div
        className={`w-12 h-12 rounded-full bg-gradient-to-br ${princess.avatarGradient} flex items-center justify-center text-2xl flex-shrink-0 shadow-md`}
      >
        {isLoading ? '✨' : princess.emoji}
      </div>
      <div className="flex-1 text-left">
        <div className={`${princess.labelColor} text-xs font-extrabold tracking-wider uppercase`}>
          {princess.origin}
        </div>
        <div className={`${princess.nameColor} text-base font-extrabold mt-0.5`}>
          {princess.name}
        </div>
      </div>
      <div className={`w-8 h-8 rounded-full ${princess.badgeBg} flex items-center justify-center text-base`}>
        {isLoading ? '⏳' : '💌'}
      </div>
    </button>
  );
}
