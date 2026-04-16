import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharactersPicker } from '@/components/CharactersPicker';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === 'favoritesCount') return `${values?.selected} / ${values?.max} selected`;
    if (key === 'favoritesEmptyHint') return 'shows all';
    return key;
  },
}));

const personas = [
  { id: 'elsa', name: 'Elsa' },
  { id: 'belle', name: 'Belle' },
  { id: 'ariel', name: 'Ariel' },
  { id: 'moana', name: 'Moana' },
  { id: 'raya', name: 'Raya' },
  { id: 'mirabel', name: 'Mirabel' },
];

describe('CharactersPicker', () => {
  it('renders all personas as chips', () => {
    render(<CharactersPicker personas={personas} value={[]} onChange={() => {}} />);
    personas.forEach((p) => {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    });
  });

  it('toggles selection on click', () => {
    const onChange = vi.fn();
    render(<CharactersPicker personas={personas} value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Elsa'));
    expect(onChange).toHaveBeenCalledWith(['elsa']);
  });

  it('removes a chip when clicked again', () => {
    const onChange = vi.fn();
    render(<CharactersPicker personas={personas} value={['elsa']} onChange={onChange} />);
    fireEvent.click(screen.getByText('Elsa'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('disables unselected chips when 5 already selected', () => {
    const onChange = vi.fn();
    render(
      <CharactersPicker
        personas={personas}
        value={['elsa', 'belle', 'ariel', 'moana', 'raya']}
        onChange={onChange}
      />,
    );
    // The 6th (mirabel) chip should be disabled
    const mirabel = screen.getByText('Mirabel').closest('button')!;
    expect(mirabel).toBeDisabled();
    // Clicking a selected chip still works (to unselect)
    fireEvent.click(screen.getByText('Elsa'));
    expect(onChange).toHaveBeenCalled();
  });

  it('shows selected count hint', () => {
    render(<CharactersPicker personas={personas} value={['elsa', 'belle']} onChange={() => {}} />);
    expect(screen.getByText(/2 \/ 5/)).toBeInTheDocument();
  });
});
