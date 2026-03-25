import { ReactNode } from 'react';

export interface PrincessConfig {
  id: 'elsa' | 'belle' | 'cinderella' | 'ariel';
  name: string;
  origin: string;
  emoji: string;
  imageUrl?: string;
  avatarGradient: string;
}

interface Props {
  princess: PrincessConfig;
  onClick: (id: PrincessConfig['id']) => void;
  isLoading?: boolean;
  variant?: 'poster' | 'cinematic';
}

export function PrincessCard({ princess, onClick, variant = 'poster', isLoading }: Props) {
  const isPoster = variant === 'poster';

  return (
    <div className="relative group w-full mb-4">
      <button
        onClick={() => onClick(princess.id)}
        disabled={isLoading}
        className="block w-full bg-white rounded-2xl shadow-sm border border-[#F3F4F6] overflow-hidden text-left transition-transform duration-300 active:scale-95 disabled:opacity-70"
      >
        {/* Image Area */}
        <div className={`relative w-full ${isPoster ? 'aspect-square' : 'aspect-video'} bg-gray-50`}>
          <img
            src={princess.imageUrl}
            alt={princess.name}
            className="w-full h-full object-cover"
          />
          {/* Top-right badge placeholder if needed */}
          <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm">
            <span className="text-sm">{princess.emoji}</span>
          </div>
        </div>

        {/* Text Content Below */}
        <div className="p-3.5 flex items-center justify-between">
          <div>
            <h3 className="text-gray-800 font-bold tracking-tight leading-tight text-sm mb-1" style={{ fontFamily: '"Quicksand", sans-serif' }}>
              {princess.name}
            </h3>
            <p className="text-gray-500 font-medium text-[11px] leading-snug line-clamp-2">
              {princess.origin}
            </p>
          </div>
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#F47F60] flex items-center justify-center text-white shadow-sm">
            {isLoading ? (
              <span className="animate-spin text-xs">✨</span>
            ) : (
              <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}
