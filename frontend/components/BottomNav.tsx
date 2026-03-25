'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  locale: string;
}

export function BottomNav({ locale }: Props) {
  const pathname = usePathname();

  const tabs = [
    { href: `/${locale}/inbox`, label: 'Inbox', icon: '✉️' },
    { href: `/${locale}/story`, label: 'Story', icon: '📖' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex pb-safe z-50">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 text-xs font-bold tracking-wide ${
              active ? 'text-[var(--color-primary-orange)]' : 'text-gray-400'
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
