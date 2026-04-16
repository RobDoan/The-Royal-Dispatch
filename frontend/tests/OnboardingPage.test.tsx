import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OnboardingPage from '@/app/[locale]/onboarding/page';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      yourName: 'Your name',
      childName: 'Child name',
      addChild: 'Add Child',
      saveAndContinue: 'Save & Continue',
      remove: 'Remove',
    };
    const base = map[key] ?? key;
    if (!vars) return base;
    return `${base}:${JSON.stringify(vars)}`;
  },
}));

const mockFetchProfile = vi.fn();
const mockUpdate = vi.fn();
const mockFetchPersonas = vi.fn();

vi.mock('@/lib/user', async () => {
  const actual = await vi.importActual<typeof import('@/lib/user')>('@/lib/user');
  return {
    ...actual,
    fetchUserProfile: (...args: unknown[]) => mockFetchProfile(...args),
    updateUserProfile: (...args: unknown[]) => mockUpdate(...args),
    fetchPersonas: (...args: unknown[]) => mockFetchPersonas(...args),
    getStoredToken: () => 'stored-tok',
    getTokenFromUrl: () => null,
    storeToken: vi.fn(),
  };
});

beforeEach(() => {
  mockPush.mockReset();
  mockFetchProfile.mockReset();
  mockUpdate.mockReset();
  mockFetchPersonas.mockReset();
  mockFetchPersonas.mockResolvedValue([
    { id: 'elsa', name: 'Elsa' },
    { id: 'belle', name: 'Belle' },
  ]);
});

describe('OnboardingPage', () => {
  it('renders empty form when user_id is null', async () => {
    mockFetchProfile.mockResolvedValue({ user_id: null, name: null, children: [] });
    render(<OnboardingPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/child name/i)).not.toBeInTheDocument();
  });

  it('pre-fills form for existing user', async () => {
    mockFetchProfile.mockResolvedValue({
      user_id: 'u1',
      name: 'Parent',
      children: [
        { id: 'c1', name: 'Emma', preferences: { favorite_princesses: ['elsa'] } },
      ],
    });
    render(<OnboardingPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Parent')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Emma')).toBeInTheDocument();
    });
  });

  it('validates required fields on submit', async () => {
    mockFetchProfile.mockResolvedValue({ user_id: null, name: null, children: [] });
    render(<OnboardingPage />);
    await waitFor(() => screen.getByLabelText(/your name/i));
    fireEvent.click(screen.getByRole('button', { name: /save & continue/i }));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('submits valid data and redirects to pick-child', async () => {
    mockFetchProfile.mockResolvedValue({ user_id: null, name: null, children: [] });
    mockUpdate.mockResolvedValue({ profile: { user_id: 'u1', name: 'P', children: [] }, error: null });
    render(<OnboardingPage />);
    await waitFor(() => screen.getByLabelText(/your name/i));

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Parent' } });
    fireEvent.click(screen.getByRole('button', { name: /add child/i }));
    fireEvent.change(screen.getByLabelText(/child name/i), { target: { value: 'Emma' } });
    fireEvent.click(screen.getByRole('button', { name: /save & continue/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('stored-tok', {
        name: 'Parent',
        children: [
          { id: null, name: 'Emma', preferences: { favorite_princesses: [] } },
        ],
      });
      expect(mockPush).toHaveBeenCalledWith('/en/pick-child');
    });
  });

  it('shows confirm modal before removing existing child', async () => {
    mockFetchProfile.mockResolvedValue({
      user_id: 'u1',
      name: 'Parent',
      children: [{ id: 'c1', name: 'Emma', preferences: { favorite_princesses: [] } }],
    });
    render(<OnboardingPage />);
    await waitFor(() => screen.getByDisplayValue('Emma'));
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('removes new (unsaved) child without confirmation', async () => {
    mockFetchProfile.mockResolvedValue({ user_id: null, name: null, children: [] });
    render(<OnboardingPage />);
    await waitFor(() => screen.getByLabelText(/your name/i));
    fireEvent.click(screen.getByRole('button', { name: /add child/i }));
    expect(screen.getByLabelText(/child name/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(screen.queryByLabelText(/child name/i)).not.toBeInTheDocument();
  });
});
