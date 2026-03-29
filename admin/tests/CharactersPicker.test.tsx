import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharactersPicker } from '@/components/CharactersPicker';

const personas = [
  { id: 'elsa', name: 'Queen Elsa' },
  { id: 'belle', name: 'Belle' },
  { id: 'cinderella', name: 'Cinderella' },
  { id: 'ariel', name: 'Ariel' },
];

describe('CharactersPicker', () => {
  it('renders all persona chips', () => {
    render(
      <CharactersPicker
        userId="u1"
        personas={personas}
        initialSelected={[]}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText('Queen Elsa')).toBeInTheDocument();
    expect(screen.getByText('Belle')).toBeInTheDocument();
    expect(screen.getByText('Cinderella')).toBeInTheDocument();
    expect(screen.getByText('Ariel')).toBeInTheDocument();
  });

  it('shows initially selected chips as active', () => {
    render(
      <CharactersPicker
        userId="u1"
        personas={personas}
        initialSelected={['elsa', 'belle']}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText('2 / 5 selected')).toBeInTheDocument();
  });

  it('toggles a chip on click and calls onSave', () => {
    const onSave = vi.fn();
    render(
      <CharactersPicker
        userId="u1"
        personas={personas}
        initialSelected={[]}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByTestId('chip-elsa'));
    expect(onSave).toHaveBeenCalledWith('u1', ['elsa']);
    expect(screen.getByText('1 / 5 selected')).toBeInTheDocument();
  });

  it('does not allow selecting more than 5', () => {
    const onSave = vi.fn();
    const fivePersonas = [
      ...personas,
      { id: 'rapunzel', name: 'Rapunzel' },
      { id: 'moana', name: 'Moana' },
    ];
    render(
      <CharactersPicker
        userId="u1"
        personas={fivePersonas}
        initialSelected={['elsa', 'belle', 'cinderella', 'ariel', 'rapunzel']}
        onSave={onSave}
      />
    );
    expect(screen.getByText('5 / 5 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chip-moana'));
    // onSave should NOT be called when at max
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('5 / 5 selected')).toBeInTheDocument();
  });

  it('deselects a chip when already selected', () => {
    const onSave = vi.fn();
    render(
      <CharactersPicker
        userId="u1"
        personas={personas}
        initialSelected={['elsa']}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByTestId('chip-elsa'));
    expect(onSave).toHaveBeenCalledWith('u1', []);
    expect(screen.getByText('0 / 5 selected')).toBeInTheDocument();
  });
});
