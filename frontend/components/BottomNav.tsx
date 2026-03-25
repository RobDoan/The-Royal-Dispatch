'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  locale: string;
}

export function BottomNav({ locale }: Props) {
  const pathname = usePathname();

  const tabs = [
    { href: `/${locale}/inbox`, label: 'Inbox', icon: '📬' },
    { href: `/${locale}/story`, label: 'Story', icon: '📖' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 drop-shadow-[0_-5px_35px_rgba(255,133,161,0.15)]">
      <nav className="bg-white/95 backdrop-blur-xl w-full flex items-center justify-around shadow-xl border-t border-gray-100 p-2 pb-[max(8px,env(safe-area-inset-bottom))] h-[76px]">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex items-center justify-center h-14 rounded-full transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                active ? 'bg-gradient-to-tr from-[#FF85A1] to-[#FFB3C6] w-32 shadow-[0_5px_20px_rgba(255,133,161,0.4)]' : 'bg-transparent w-20 hover:bg-gray-50'
              }`}
            >
              <span 
                className={`text-[32px] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                  active ? 'scale-110 drop-shadow-sm' : 'grayscale-[40%] opacity-60 hover:scale-110 hover:grayscale-0 hover:opacity-100'
                }`}
              >
                {tab.icon}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
