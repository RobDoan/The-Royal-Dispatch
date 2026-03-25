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
    renderWithIntl(
      <AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" storyText="Hello Emma" />
    );
    expect(screen.getAllByText(/Queen Elsa/i).length).toBeGreaterThan(0);
  });

  it('renders the ambient emoji', () => {
    renderWithIntl(
      <AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" storyText="Hello Emma" />
    );
    expect(screen.getAllByText('❄️').length).toBeGreaterThan(0);
  });

  it('renders the story text', () => {
    renderWithIntl(
      <AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" storyText="Dear Emma, you were so brave today." />
    );
    expect(screen.getByText(/Dear Emma, you were so brave today\./i)).toBeInTheDocument();
  });

  it('strips ElevenLabs audio tags from story text', () => {
    renderWithIntl(
      <AudioPlayer
        princess={mockPrincess}
        audioUrl="https://example.com/test.mp3"
        storyText="[PROUD] Dear Emma, [CALM] you were brave."
      />
    );
    expect(screen.getByText(/Dear Emma,\s+you were brave\./i)).toBeInTheDocument();
    expect(screen.queryByText(/\[PROUD\]/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\[CALM\]/)).not.toBeInTheDocument();
  });

  it('shows --:-- for duration before audio metadata loads', () => {
    renderWithIntl(
      <AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" storyText="Hello" />
    );
    // Runtime label and footer right timestamp both use formatTime(undefined) = '--:--'
    const dashes = screen.getAllByText('--:--');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Runtime:.*--:--/)).toBeInTheDocument();
  });

  it('renders Royal Challenge card when royalChallenge prop is provided', () => {
    renderWithIntl(
      <AudioPlayer
        princess={mockPrincess}
        audioUrl="https://example.com/test.mp3"
        storyText="Once in Arendelle..."
        royalChallenge="Try sharing one favourite thing today."
      />
    );
    expect(screen.getByText('Your Royal Challenge')).toBeInTheDocument();
    expect(screen.getByText('Try sharing one favourite thing today.')).toBeInTheDocument();
  });

  it('does not render Royal Challenge card when royalChallenge is not provided', () => {
    renderWithIntl(
      <AudioPlayer
        princess={mockPrincess}
        audioUrl="https://example.com/test.mp3"
        storyText="Dear Emma..."
      />
    );
    expect(screen.queryByText('Your Royal Challenge')).not.toBeInTheDocument();
  });
});
