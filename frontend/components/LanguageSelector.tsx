'use client';

export type Language = 'en' | 'vi';

interface Props {
  value: Language;
  onChange: (lang: Language) => void;
}

export function LanguageSelector({ value, onChange }: Props) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Language)}
        className="appearance-none bg-purple-100 border-2 border-purple-300 rounded-xl px-3 py-1.5 pr-7 text-sm font-bold text-purple-800 cursor-pointer outline-none focus:ring-2 focus:ring-purple-400"
      >
        <option value="en">🇬🇧 English</option>
        <option value="vi">🇻🇳 Tiếng Việt</option>
      </select>
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-purple-600 text-xs">▼</div>
    </div>
  );
}
