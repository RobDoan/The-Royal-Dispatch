import { render, screen, fireEvent } from '@testing-library/react';
import { PrincessCard } from '@/components/PrincessCard';
import { describe, it, expect, vi } from 'vitest';

const mockPrincess = {
  id: 'elsa' as const,
  name: 'Queen Elsa',
  origin: 'Kingdom of Arendelle',
  emoji: '❄️',
  bgColor: 'bg-blue-50',
  borderColor: 'border-blue-300',
  labelColor: 'text-blue-500',
  nameColor: 'text-blue-900',
  avatarGradient: 'from-blue-200 to-blue-400',
  badgeBg: 'bg-blue-100',
};

describe('PrincessCard', () => {
  it('renders princess name and origin', () => {
    render(<PrincessCard princess={mockPrincess} onClick={() => {}} />);
    expect(screen.getByText('Queen Elsa')).toBeInTheDocument();
    expect(screen.getByText('Kingdom of Arendelle')).toBeInTheDocument();
  });

  it('calls onClick when tapped', () => {
    const handleClick = vi.fn();
    render(<PrincessCard princess={mockPrincess} onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledWith('elsa');
  });
});
