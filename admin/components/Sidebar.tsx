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
    <aside className="w-14 flex-shrink-0 flex flex-col items-center py-4 gap-2"
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}>
      {/* Logo */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base mb-4"
        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
        👑
      </div>

      {/* Nav items */}
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center transition-colors group relative',
              active
                ? 'text-indigo-400'
                : 'text-slate-500 hover:text-slate-300',
            )}
            style={{ background: active ? 'hsl(var(--accent))' : undefined }}
          >
            <Icon size={18} />
            {/* Tooltip */}
            <span className="absolute left-12 bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
              {label}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}
