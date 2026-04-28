'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  locale: string;
}

const TABS = [
  {
    href: '/inbox',
    label: 'Inbox',
    emoji: '💌',
    bg: 'linear-gradient(135deg, #fff0f5, #ffe0eb)',
    glow: '0 6px 20px rgba(255,131,161,0.45), 0 2px 8px rgba(255,131,161,0.3), inset 0 2px 4px rgba(255,255,255,0.7)',
    labelColor: '#ff6b8a',
  },
  {
    href: '/story',
    label: 'Story',
    emoji: '📖',
    bg: 'linear-gradient(135deg, #f0e6ff, #e6d6ff)',
    glow: '0 6px 20px rgba(147,112,219,0.35), 0 2px 8px rgba(147,112,219,0.25), inset 0 2px 4px rgba(255,255,255,0.7)',
    labelColor: '#8b6bb5',
  },
] as const;

const RAINBOW_GRADIENT =
  'linear-gradient(90deg, #ffd6e0 0%, #f0d6ff 25%, #d6e8ff 50%, #d6fff0 75%, #fff5d6 100%)';

export function BottomNav({ locale }: Props) {
  const pathname = usePathname();
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const handleInteraction = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pb-[env(safe-area-inset-bottom)] w-11/12 max-w-sm">
      <nav
        aria-label="Main navigation"
        className="w-full flex items-end justify-around rounded-[32px_32px_36px_36px] px-6 pb-3 pt-2"
        style={{
          height: '88px',
          background: RAINBOW_GRADIENT,
          boxShadow:
            '0 -4px 24px rgba(255,182,193,0.2), 0 -2px 12px rgba(147,112,219,0.15), inset 0 2px 4px rgba(255,255,255,0.5)',
        }}
      >
        {TABS.map((tab) => {
          const fullHref = `/${locale}${tab.href}`;
          const active = pathname.startsWith(fullHref);
          return (
            <Link
              key={tab.href}
              href={fullHref}
              onClick={handleInteraction}
              aria-label={tab.label}
              className={`flex flex-col items-center transition-all duration-[350ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                !active ? 'hover:scale-105 hover:!opacity-75' : ''
              }`}
              style={{
                transform: active && !prefersReducedMotion ? 'translateY(-14px)' : 'translateY(0)',
                opacity: active ? 1 : 0.55,
                transitionDuration: prefersReducedMotion ? '0ms' : undefined,
              }}
            >
              <span
                className="flex items-center justify-center rounded-full active:scale-90"
                style={{
                  width: active ? '60px' : '48px',
                  height: active ? '60px' : '48px',
                  fontSize: active ? '28px' : '22px',
                  background: tab.bg,
                  boxShadow: active ? tab.glow : '0 2px 8px rgba(0,0,0,0.08)',
                  transition: 'all 350ms cubic-bezier(0.34,1.56,0.64,1)',
                }}
                role="img"
                aria-hidden="true"
              >
                {tab.emoji}
              </span>
              <span
                className="font-semibold mt-1"
                style={{
                  fontSize: active ? '11px' : '10px',
                  fontWeight: active ? 800 : 600,
                  color: tab.labelColor,
                  textShadow: active ? '0 1px 3px rgba(255,255,255,0.8)' : 'none',
                  opacity: active ? 1 : 0.7,
                }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
