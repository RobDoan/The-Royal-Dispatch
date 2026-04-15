import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUser } from '@/hooks/useUser';

// Mock the user module
vi.mock('@/lib/user', () => ({
  getStoredToken: vi.fn(() => 'test-token'),
  getTokenFromUrl: vi.fn(() => null),
  storeToken: vi.fn(),
  fetchUserProfile: vi.fn(),
  getStoredChildId: vi.fn(() => null),
  storeSelectedChild: vi.fn(),
  clearSelectedChild: vi.fn(),
}));

import {
  fetchUserProfile,
  getStoredChildId,
  storeSelectedChild,
  clearSelectedChild,
} from '@/lib/user';

const mockFetchUserProfile = vi.mocked(fetchUserProfile);
const mockGetStoredChildId = vi.mocked(getStoredChildId);
const mockStoreSelectedChild = vi.mocked(storeSelectedChild);
const mockClearSelectedChild = vi.mocked(clearSelectedChild);

describe('useUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects child from localStorage when it matches a fetched child', async () => {
    mockGetStoredChildId.mockReturnValue('child-1');
    mockFetchUserProfile.mockResolvedValue({
      user_id: 'u1',
      name: 'Parent',
      children: [
        { id: 'child-1', name: 'Emma', preferences: { favorite_princesses: ['elsa', 'belle'] } },
        { id: 'child-2', name: 'Lily', preferences: { favorite_princesses: ['ariel'] } },
      ],
    });

    const { result } = renderHook(() => useUser());
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedChild?.id).toBe('child-1');
    expect(result.current.activePrincessIds).toEqual(['elsa', 'belle']);
  });

  it('clears stale child_id that does not match any child', async () => {
    mockGetStoredChildId.mockReturnValue('deleted-child');
    mockFetchUserProfile.mockResolvedValue({
      user_id: 'u1',
      name: 'Parent',
      children: [
        { id: 'child-1', name: 'Emma', preferences: { favorite_princesses: ['elsa'] } },
      ],
    });

    const { result } = renderHook(() => useUser());
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedChild).toBeNull();
    expect(mockClearSelectedChild).toHaveBeenCalled();
  });

  it('returns all princesses when no children exist', async () => {
    mockGetStoredChildId.mockReturnValue(null);
    mockFetchUserProfile.mockResolvedValue({
      user_id: 'u1',
      name: 'Parent',
      children: [],
    });

    const { result } = renderHook(() => useUser());
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedChild).toBeNull();
    expect(result.current.activePrincessIds).toEqual(['elsa', 'belle', 'cinderella', 'ariel']);
  });

  it('selectChild updates state and localStorage', async () => {
    mockGetStoredChildId.mockReturnValue(null);
    mockFetchUserProfile.mockResolvedValue({
      user_id: 'u1',
      name: 'Parent',
      children: [
        { id: 'child-1', name: 'Emma', preferences: { favorite_princesses: ['elsa'] } },
        { id: 'child-2', name: 'Lily', preferences: { favorite_princesses: ['ariel', 'belle'] } },
      ],
    });

    const { result } = renderHook(() => useUser());
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectChild('child-2');
    });

    expect(result.current.selectedChild?.id).toBe('child-2');
    expect(result.current.selectedChild?.name).toBe('Lily');
    expect(result.current.activePrincessIds).toEqual(['ariel', 'belle']);
    expect(mockStoreSelectedChild).toHaveBeenCalledWith('child-2');
  });
});
