'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Language = 'en' | 'vi';

interface Props {
  value: Language;
  onChange: (lang: Language) => void;
}

export function LanguageSelector({ value, onChange }: Props) {
  return (
    <Select value={value} onValueChange={(val) => onChange(val as Language)}>
      <SelectTrigger className="w-[100px] h-8 bg-white/40 backdrop-blur-md border border-white/40 rounded-full font-bold text-gray-800 focus:ring-2 focus:ring-[#F47F60] data-[state=open]:ring-[#F47F60] shadow-sm">
        <SelectValue placeholder="Language" />
      </SelectTrigger>
      <SelectContent className="rounded-xl border border-gray-100 shadow-md z-[100]">
        <SelectItem value="en" className="font-medium cursor-pointer rounded-lg hover:bg-gray-50 focus:bg-gray-50">🇬🇧 EN</SelectItem>
        <SelectItem value="vi" className="font-medium cursor-pointer rounded-lg hover:bg-gray-50 focus:bg-gray-50">🇻🇳 VI</SelectItem>
      </SelectContent>
    </Select>
  );
}
