'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

interface Props {
  locale: string;
}

export function BottomNav({ locale }: Props) {
  const pathname = usePathname();

  const handleInteraction = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const tabs = [
    { href: `/${locale}/inbox`, label: 'Inbox', iconSrc: '/inbox-3d.png', activeColor: '#4895EF' },
    { href: `/${locale}/story`, label: 'Story', iconSrc: '/story-3d.png', activeColor: '#7209B7' },
  ];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 drop-shadow-[0_15px_30px_rgba(0,0,0,0.15)] pb-[env(safe-area-inset-bottom)] w-11/12 max-w-sm">
      <nav className="bg-[#FFFFFF] w-full flex items-center justify-around rounded-[40px] p-2.5 h-[96px] shadow-[10px_10px_20px_rgba(0,0,0,0.05),inset_-8px_-8px_12px_rgba(0,0,0,0.05),inset_8px_8px_12px_rgba(255,255,255,1)] border border-white/60">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={handleInteraction}
              className={`relative flex flex-col items-center justify-center p-3 w-28 rounded-[28px] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                active 
                  ? 'scale-95 text-white' 
                  : 'bg-white/40 text-gray-400 scale-100 hover:scale-105 active:scale-95 shadow-[5px_5px_12px_rgba(0,0,0,0.06),inset_-4px_-4px_8px_rgba(0,0,0,0.04),inset_4px_4px_8px_rgba(255,255,255,0.9)]'
              }`}
              style={{
                backgroundColor: active ? tab.activeColor : undefined,
                boxShadow: active 
                  ? 'inset 5px 5px 10px rgba(0,0,0,0.25), inset -5px -5px 10px rgba(255,255,255,0.15)' 
                  : undefined
              }}
            >
              <div 
                className={`relative w-12 h-12 transition-all duration-300 ${
                  active ? 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)]' : 'drop-shadow-md grayscale-[20%]'
                }`}
              >
                <Image 
                  src={tab.iconSrc} 
                  alt={tab.label} 
                  fill
                  sizes="48px"
                  className="object-contain" 
                  priority
                />
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
