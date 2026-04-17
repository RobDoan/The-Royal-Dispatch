'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

interface Props {
  locale: string;
}

export function BottomNav({ locale }: Props) {
  const pathname = usePathname();
  const [supportsWebGPU, setSupportsWebGPU] = useState(false);

  useEffect(() => {
    setSupportsWebGPU('gpu' in navigator);
  }, []);

  const handleInteraction = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const tabs = [
    { href: `/${locale}/inbox`, label: 'Inbox', iconSrc: '/inbox-3d.png' },
    { href: `/${locale}/story`, label: 'Story', iconSrc: '/story-3d.png' },
    ...(supportsWebGPU
      ? [{ href: `/${locale}/call`, label: 'Call', iconSrc: '/call-3d.png' }]
      : []),
  ];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pb-[env(safe-area-inset-bottom)] w-11/12 max-w-sm">
      <nav className="glass-nav w-full flex items-center justify-around rounded-[28px] p-2.5 h-[96px]">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={handleInteraction}
              className={`relative flex flex-col items-center justify-center p-3 w-28 rounded-[28px] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                active
                  ? 'scale-95'
                  : 'scale-100 hover:scale-105 active:scale-95'
              }`}
              style={{
                backgroundColor: active ? 'rgba(255, 255, 255, 0.12)' : undefined,
                boxShadow: active
                  ? 'inset 4px 4px 8px rgba(0,0,0,0.2), inset -4px -4px 8px rgba(255,255,255,0.1)'
                  : undefined
              }}
            >
              <div
                className={`relative w-12 h-12 transition-all duration-300 ${
                  active ? 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)]' : 'drop-shadow-md opacity-50'
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
              <span className={`text-[10px] mt-1 font-semibold ${active ? 'text-[var(--color-gold)]' : 'text-white/40'}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
