import { TranscriptToggle } from "./TranscriptToggle";

type Transcript = { role: "user" | "agent"; text: string; time?: number };

type CallItem = {
  id: string;
  princess: string;
  locale: string;
  state: string;
  ended_reason: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  transcript: Transcript[] | null;
};

type CallListResponse = { items: CallItem[]; total: number };

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

async function fetchCalls(childId: string): Promise<CallListResponse> {
  const base = process.env.INTERNAL_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}/admin/children/${childId}/calls`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load calls: ${res.status}`);
  return res.json();
}

export default async function CallsPage({
  params,
}: {
  params: Promise<{ id: string; childId: string }>;
}) {
  const { childId } = await params;
  const data = await fetchCalls(childId);

  if (data.total === 0) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold mb-4">Call history</h1>
        <p className="text-gray-500">No calls yet.</p>
      </main>
    );
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold mb-4">Call history ({data.total})</h1>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b">
            <th className="py-2">Date</th>
            <th>Character</th>
            <th>Duration</th>
            <th>Reason</th>
            <th>Transcript</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((call) => (
            <CallRow key={call.id} call={call} />
          ))}
        </tbody>
      </table>
    </main>
  );
}

function CallRow({ call }: { call: CallItem }) {
  return (
    <tr className="border-b">
      <td className="py-2">{new Date(call.started_at).toLocaleString()}</td>
      <td className="capitalize">{call.princess}</td>
      <td>{formatDuration(call.duration_seconds)}</td>
      <td>{call.ended_reason ?? "—"}</td>
      <td>
        <TranscriptToggle transcript={call.transcript ?? []} />
      </td>
    </tr>
  );
}
