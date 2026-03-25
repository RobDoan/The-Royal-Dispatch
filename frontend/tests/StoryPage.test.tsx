import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import StoryPage from '@/app/[locale]/(tabs)/story/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useLocale: () => 'en',
  };
});

vi.mock('@/lib/api', () => ({
  requestStory: vi.fn().mockResolvedValue(undefined),
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

it('renders princess cards for the story tab', () => {
  renderWithIntl(<StoryPage />);
  expect(screen.getByText('Queen Elsa')).toBeInTheDocument();
  expect(screen.getByText('Belle')).toBeInTheDocument();
});
