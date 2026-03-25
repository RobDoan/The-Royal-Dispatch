'use client';

export type Language = 'en' | 'vi';

interface Props {
  value: Language;
  onChange: (lang: Language) => void;
}

export function LanguageSelector({ value, onChange }: Props) {
  const toggleLanguage = () => {
    // Optional haptic feedback on switch
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }
    onChange(value === 'en' ? 'vi' : 'en');
  };

  return (
    <button
      onClick={toggleLanguage}
      type="button"
      className="relative w-[96px] h-12 rounded-full bg-[#E8E8E8] shadow-[inset_4px_4px_8px_rgba(0,0,0,0.1),inset_-4px_-4px_8px_rgba(255,255,255,1)] p-1.5 flex items-center focus:outline-none focus:ring-4 focus:ring-[#FF85A1]/30 transition-shadow"
      aria-label="Toggle Language"
    >
      {/* Sliding Clay Ball */}
      <div 
        className={`absolute top-1.5 bottom-1.5 w-[42px] rounded-full bg-[#FFFDF5] shadow-[0_4px_8px_rgba(0,0,0,0.15),inset_2px_2px_6px_rgba(255,255,255,1),inset_-2px_-2px_6px_rgba(0,0,0,0.06)] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          value === 'vi' ? 'translate-x-[42px]' : 'translate-x-0'
        }`}
      />
      
      {/* Flags on top of the ball */}
      <div className="relative z-10 w-full flex justify-between px-1 pointer-events-none">
        <div className={`w-[42px] flex justify-center items-center text-2xl transition-all duration-300 ${value === 'en' ? 'opacity-100 scale-110 drop-shadow-sm' : 'opacity-50 grayscale scale-95'}`}>
          🇬🇧
        </div>
        <div className={`w-[42px] flex justify-center items-center text-2xl transition-all duration-300 ${value === 'vi' ? 'opacity-100 scale-110 drop-shadow-sm' : 'opacity-50 grayscale scale-95'}`}>
          🇻🇳
        </div>
      </div>
    </button>
  );
}
