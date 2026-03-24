import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageSelector } from '@/components/LanguageSelector';
import { describe, it, expect, vi } from 'vitest';

describe('LanguageSelector', () => {
  it('renders EN and VI options', () => {
    render(<LanguageSelector value="en" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText(/english/i)).toBeInTheDocument();
  });

  it('calls onChange when selection changes', () => {
    const handleChange = vi.fn();
    render(<LanguageSelector value="en" onChange={handleChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'vi' } });
    expect(handleChange).toHaveBeenCalledWith('vi');
  });
});
