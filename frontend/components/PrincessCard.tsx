'use client';

export interface PrincessConfig {
  id: 'elsa' | 'belle' | 'cinderella' | 'ariel';
  name: string;
  origin: string;
  emoji: string;
  imageUrl?: string;
  bgColor: string;
  borderColor: string;
  labelColor: string;
  nameColor: string;
  avatarGradient: string;
  badgeBg: string;
  isNew?: boolean;
}

interface Props {
  princess: PrincessConfig;
  onClick: (id: PrincessConfig['id']) => void;
  isLoading?: boolean;
}

export function PrincessCard({ princess, onClick, isLoading }: Props) {
  return (
    <div className="relative group pt-2 pb-6 w-full h-full">
      <button
        onClick={() => onClick(princess.id)}
        disabled={isLoading}
        className="block w-full aspect-[4/3] rounded-3xl relative overflow-hidden shadow-sm transition-transform duration-300 active:scale-95 disabled:opacity-70 group-hover:shadow-md"
      >
        {/* Main Image Background */}
        <div className={`absolute inset-0 bg-gradient-to-br ${princess.avatarGradient}`}>
          {princess.imageUrl ? (
             <img 
               src={princess.imageUrl} 
               alt={princess.name} 
               className="w-full h-full object-cover object-center" 
               crossOrigin="anonymous"
             />
          ) : (
             <div className="w-full h-full flex items-center justify-center text-7xl opacity-80">{princess.emoji}</div>
          )}
        </div>

        {/* Top Gradient Overlay for Text Readability */}
        <div className="absolute top-0 left-0 right-0 h-2/3 bg-gradient-to-b from-black/60 via-black/30 to-transparent pointer-events-none" />

        {/* Content Top */}
        <div className="absolute top-4 left-5 right-4 flex items-start justify-between z-10">
            <div className="flex flex-col items-start gap-1">
               <h3 className="text-white font-extrabold text-lg tracking-wide drop-shadow-md text-left leading-none" style={{ fontFamily: '"Quicksand", sans-serif' }}>
                  {princess.name}
               </h3>
            </div>
        </div>
      </button>

      {/* Floating Orange Play Button positioned to slightly overlap the bottom center of the card */}
      <button 
        onClick={() => onClick(princess.id)}
        disabled={isLoading}
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[52px] h-[52px] bg-[var(--color-primary-orange)] hover:bg-[var(--color-primary-orange-light)] rounded-full shadow-[0_8px_16px_rgba(255,122,69,0.4)] flex items-center justify-center text-white transition-transform active:scale-90 z-20 border-[3px] border-[#FDF8F5]"
      >
        {isLoading ? (
          <span className="animate-spin text-xl">⏳</span>
        ) : (
          <svg className="w-6 h-6 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        )}
      </button>
    </div>
  );
}
