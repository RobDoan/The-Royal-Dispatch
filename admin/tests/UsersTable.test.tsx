import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UsersTable } from '@/components/UsersTable';
import * as api from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    listChildren: vi.fn(),
    createChild: vi.fn(),
    deleteChild: vi.fn(),
  };
});

const mockUsers: api.User[] = [
  { id: 'u1', name: 'Quy', telegram_chat_id: 12345, token: 'tk_abc', created_at: '2026-01-01T00:00:00Z' },
];

const mockChildren: api.Child[] = [
  { id: 'c1', parent_id: 'u1', name: 'Emma', timezone: 'America/Los_Angeles', preferences: {}, created_at: '2026-01-01T00:00:00Z' },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe('UsersTable — row expand/collapse', () => {
  it('clicking a user row fetches and displays children', async () => {
    vi.mocked(api.listChildren).mockResolvedValueOnce(mockChildren);
    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    expect(api.listChildren).toHaveBeenCalledWith('u1');
    await waitFor(() => expect(screen.getByText('Emma')).toBeInTheDocument());
  });

  it('shows loading state while fetching', async () => {
    vi.mocked(api.listChildren).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(mockChildren), 100)),
    );
    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Emma')).toBeInTheDocument());
  });

  it('shows empty state when user has no children', async () => {
    vi.mocked(api.listChildren).mockResolvedValueOnce([]);
    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    await waitFor(() => expect(screen.getByText('No children yet.')).toBeInTheDocument());
  });

  it('clicking an expanded row collapses it', async () => {
    vi.mocked(api.listChildren).mockResolvedValueOnce(mockChildren);
    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    await waitFor(() => expect(screen.getByText('Emma')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Quy'));
    expect(screen.queryByText('Emma')).not.toBeInTheDocument();
  });

  it('re-expanding does not re-fetch children', async () => {
    vi.mocked(api.listChildren).mockResolvedValueOnce(mockChildren);
    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    await waitFor(() => expect(screen.getByText('Emma')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Quy')); // collapse
    fireEvent.click(screen.getByText('Quy')); // re-expand
    expect(api.listChildren).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Emma')).toBeInTheDocument();
  });

  it('shows error when listChildren fails', async () => {
    vi.mocked(api.listChildren).mockRejectedValueOnce(new Error('network'));
    render(<UsersTable initialUsers={mockUsers} />);
    fireEvent.click(screen.getByText('Quy'));
    await waitFor(() => expect(screen.getByText('Failed to load children.')).toBeInTheDocument());
  });
});
