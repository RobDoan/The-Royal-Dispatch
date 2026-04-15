'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Baby } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/children', icon: Baby, label: 'Children' },
  { href: '/users', icon: Users, label: 'Users' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-14 flex-shrink-0 flex flex-col items-center py-4 gap-2"
      style={{
        background: 'linear-gradient(180deg, #2d1b69, #1a0533)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-base mb-4"
        style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)' }}
      >
        👑
      </div>

      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 group relative',
              active
                ? 'text-[#FFD700]'
                : 'text-white/40 hover:text-white/70',
            )}
            style={{
              background: active
                ? 'rgba(255, 215, 0, 0.12)'
                : undefined,
            }}
          >
            <Icon size={18} />
            <span className="absolute left-12 bg-[#2d1b69] text-white/80 text-xs px-2 py-1 rounded border border-white/10 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
              {label}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}
