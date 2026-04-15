import { render, screen } from '@testing-library/react';
import { BottomNav } from '@/components/BottomNav';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/inbox',
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

it('renders Inbox and Story tabs', () => {
  render(<BottomNav locale="en" />);
  expect(screen.getByText('Inbox')).toBeInTheDocument();
  expect(screen.getByText('Story')).toBeInTheDocument();
});

it('marks Inbox as active and Story as inactive when on /en/inbox', () => {
  render(<BottomNav locale="en" />);
  const inboxLink = screen.getByText('Inbox').closest('a');
  const storyLink = screen.getByText('Story').closest('a');
  expect(inboxLink?.className).toContain('scale-95');
  expect(storyLink?.className).toContain('scale-100');
});
