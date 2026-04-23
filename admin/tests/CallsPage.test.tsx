import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CallsPage from "@/app/users/[id]/children/[childId]/calls/page";

const mockFetch = vi.fn();
beforeEach(() => {
  global.fetch = mockFetch as any;
  mockFetch.mockReset();
});

describe("CallsPage", () => {
  it("renders a list of calls with expandable transcripts", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "call-1",
            princess: "belle",
            locale: "en",
            state: "completed",
            ended_reason: "user_ended",
            started_at: "2026-04-22T18:00:00Z",
            ended_at: "2026-04-22T18:04:12Z",
            duration_seconds: 252,
            transcript: [
              { role: "user", text: "hi Belle" },
              { role: "agent", text: "hi Emma!" },
            ],
          },
        ],
        total: 1,
      }),
    });

    render(await CallsPage({ params: Promise.resolve({ id: "u1", childId: "c1" }) }));

    expect(await screen.findByText(/belle/i)).toBeInTheDocument();
    expect(screen.getByText(/4:12/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/view transcript/i));
    expect(screen.getByText(/hi Belle/)).toBeInTheDocument();
  });

  it("shows empty state when child has no calls", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], total: 0 }),
    });

    render(await CallsPage({ params: Promise.resolve({ id: "u1", childId: "c1" }) }));
    expect(await screen.findByText(/no calls yet/i)).toBeInTheDocument();
  });
});
