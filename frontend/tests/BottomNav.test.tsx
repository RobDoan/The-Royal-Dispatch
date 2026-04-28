import { render, screen } from '@testing-library/react';
import { BottomNav } from '@/components/BottomNav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/inbox',
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

it('renders Inbox and Story tabs with emoji', () => {
  render(<BottomNav locale="en" />);
  expect(screen.getByText('Inbox')).toBeInTheDocument();
  expect(screen.getByText('Story')).toBeInTheDocument();
  expect(screen.getByText('💌')).toBeInTheDocument();
  expect(screen.getByText('📖')).toBeInTheDocument();
});

it('marks Inbox as active (translated up) and Story as inactive', () => {
  render(<BottomNav locale="en" />);
  const inboxLink = screen.getByText('Inbox').closest('a');
  const storyLink = screen.getByText('Story').closest('a');
  expect(inboxLink?.style.transform).toBe('translateY(-14px)');
  expect(inboxLink?.style.opacity).toBe('1');
  expect(storyLink?.style.transform).toBe('translateY(0)');
  expect(storyLink?.style.opacity).toBe('0.55');
});

it('has accessible aria-labels on nav links', () => {
  render(<BottomNav locale="en" />);
  expect(screen.getByLabelText('Inbox')).toBeInTheDocument();
  expect(screen.getByLabelText('Story')).toBeInTheDocument();
});

it('renders the rainbow gradient nav container', () => {
  render(<BottomNav locale="en" />);
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  expect(nav).toBeInTheDocument();
  expect(nav.style.background).toContain('linear-gradient');
  expect(nav.style.height).toBe('88px');
});
