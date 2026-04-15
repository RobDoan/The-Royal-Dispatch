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
      className="relative w-[96px] h-12 rounded-full glass-toggle p-1.5 flex items-center focus:outline-none focus:ring-4 focus:ring-[var(--color-gold)]/30 transition-shadow"
      aria-label="Toggle Language"
    >
      {/* Sliding Gold Ball */}
      <div
        className={`absolute top-1.5 bottom-1.5 w-[42px] rounded-full gold-gradient-bg shadow-[0_4px_12px_rgba(255,215,0,0.3)] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          value === 'vi' ? 'translate-x-[42px]' : 'translate-x-0'
        }`}
      />

      {/* Flags */}
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
