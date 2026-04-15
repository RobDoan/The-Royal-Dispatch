import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageSelector } from '@/components/LanguageSelector';
import { describe, it, expect, vi } from 'vitest';

describe('LanguageSelector', () => {
  it('renders EN and VI flags', () => {
    render(<LanguageSelector value="en" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /toggle language/i })).toBeInTheDocument();
    expect(screen.getByText('🇬🇧')).toBeInTheDocument();
    expect(screen.getByText('🇻🇳')).toBeInTheDocument();
  });

  it('calls onChange when clicked', () => {
    const handleChange = vi.fn();
    render(<LanguageSelector value="en" onChange={handleChange} />);
    fireEvent.click(screen.getByRole('button', { name: /toggle language/i }));
    expect(handleChange).toHaveBeenCalledWith('vi');
  });
});
