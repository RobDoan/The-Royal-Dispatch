import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AudioPlayer } from '@/components/AudioPlayer';
import { describe, it, expect } from 'vitest';
import messages from '../messages/en.json';

const mockPrincess = { id: 'elsa' as const, name: 'Queen Elsa', emoji: '❄️' };

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe('AudioPlayer', () => {
  it('renders the princess name', () => {
    renderWithIntl(<AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" />);
    expect(screen.getAllByText(/Queen Elsa/i).length).toBeGreaterThan(0);
  });

  it('renders the ambient emoji', () => {
    renderWithIntl(<AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" />);
    expect(screen.getAllByText('❄️').length).toBeGreaterThan(0);
  });
});
