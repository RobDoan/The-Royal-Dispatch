import { render, screen } from '@testing-library/react';
import { AudioPlayer } from '@/components/AudioPlayer';
import { describe, it, expect } from 'vitest';

const mockPrincess = { id: 'elsa' as const, name: 'Queen Elsa', emoji: '❄️' };

describe('AudioPlayer', () => {
  it('renders the princess name', () => {
    render(<AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" />);
    expect(screen.getByText(/Queen Elsa/i)).toBeInTheDocument();
  });

  it('renders the ambient emoji', () => {
    render(<AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" />);
    expect(screen.getAllByText('❄️').length).toBeGreaterThan(0);
  });
});
