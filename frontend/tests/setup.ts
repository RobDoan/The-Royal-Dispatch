import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock next/navigation (useRouter requires the App Router context which isn't available in jsdom)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock HTMLMediaElement methods not implemented in jsdom
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => {};
window.HTMLMediaElement.prototype.load = () => {};
