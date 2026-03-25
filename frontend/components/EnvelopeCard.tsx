'use client';

import { useState } from 'react';
import type { PrincessConfig } from './PrincessCard';

interface Props {
  princess: PrincessConfig;
  onClick: (id: PrincessConfig['id']) => void;
  isLoading?: boolean;
}

export function EnvelopeCard({ princess, onClick, isLoading }: Props) {
  const [isOpening, setIsOpening] = useState(false);

  const handleClick = () => {
    if (isLoading || isOpening) return;
    setIsOpening(true);
    // Wait for the animation to complete before routing
    setTimeout(() => {
      onClick(princess.id);
      // Reset the state shortly after in case the user navigates back
      setTimeout(() => setIsOpening(false), 500);
    }, 1200);
  };

  return (
    <div className="relative group w-full mb-4 [perspective:1000px]">
      <button
        onClick={handleClick}
        disabled={isLoading || isOpening}
        className={`block w-full aspect-[21/9] rounded-2xl relative shadow-sm transition-all duration-500 ease-out disabled:opacity-90 
          bg-white border border-gray-100 overflow-visible
          ${isOpening ? 'scale-105 shadow-md z-50' : 'active:scale-95 hover:shadow-md'}
        `}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* The Envelope Flap (Top) */}
        <div 
          className={`absolute top-0 left-0 right-0 h-1/2 bg-white origin-top shadow-sm border-b border-gray-50 z-30 transition-transform duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]
            ${isOpening ? '[transform:rotateX(-180deg)] opacity-0' : '[transform:rotateX(0deg)]'}
          `}
          style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}
        />

        {/* The Wax Seal */}
        <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full shadow-[0_4px_10px_rgba(0,0,0,0.5)] flex items-center justify-center z-40 transition-all duration-500
            ${isOpening ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}
          `}
          style={{ background: 'linear-gradient(135deg, #FF9B73 0%, #FF7A45 100%)' }}
        >
          <span className="text-2xl drop-shadow-md">{princess.emoji}</span>
        </div>

        {/* The Letter Inside (slides up when opening) */}
        <div className={`absolute bottom-2 left-4 right-4 bg-[#F9F6F0] rounded-xl p-4 border border-gray-100 shadow-inner z-20 transition-all duration-700 delay-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]
            ${isOpening ? '-translate-y-12 scale-105 opacity-100' : 'translate-y-8 opacity-0'}
          `}
        >
          <div className="h-2 w-1/3 bg-[#F47F60]/30 rounded-full mb-3" />
          <div className="h-2 w-full bg-gray-200/80 rounded-full mb-3" />
          <div className="h-2 w-5/6 bg-gray-200/80 rounded-full mb-3" />
          <div className="h-2 w-2/3 bg-gray-200/80 rounded-full" />
          
          <div className="absolute right-3 bottom-3 w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm">
             <img src={princess.imageUrl} alt={princess.name} className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Envelope Body (Bottom overlap overlay) */}
        <div 
          className="absolute inset-0 bg-white pointer-events-none z-30 opacity-90 rounded-2xl"
          style={{ clipPath: 'polygon(0 100%, 50% 50%, 100% 100%, 100% 100%, 0 100%)' }}
        />

        {/* Front Content (Sender info) - fade out on open */}
        <div className={`absolute bottom-5 left-5 right-5 flex items-end justify-between z-40 transition-opacity duration-300 ${isOpening ? 'opacity-0' : 'opacity-100'}`}>
          <div className="flex flex-col items-start gap-0.5">
            <h3 className="text-gray-800 font-black tracking-wide drop-shadow-sm text-left text-lg" style={{ fontFamily: '"Quicksand", sans-serif' }}>
              From: {princess.name}
            </h3>
            <p className="text-gray-600 font-medium text-[10px] tracking-wide uppercase">
              {princess.origin}
            </p>
          </div>
          <div className="flex-shrink-0 animate-pulse-glow">
            <span className="text-xl">✨</span>
          </div>
        </div>
      </button>
    </div>
  );
}
