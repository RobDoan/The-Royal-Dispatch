import type { Princess } from './api';

const API_URL = typeof window === 'undefined' ? 'http://localhost:3000/api' : '/api';

export interface CallStartData {
  persona: {
    name: string;
    voice_id: string;
    tone_style: string;
    signature_phrase: string;
    origin: string;
  };
  memories: string;
  child_name: string;
  session_id: string;
  timer_seconds: number;
}

export interface TranscriptTurn {
  role: 'child' | 'princess';
  text: string;
}

export async function startCall(
  childId: string,
  princess: Princess,
): Promise<CallStartData> {
  const params = new URLSearchParams({ child_id: childId, princess });
  const res = await fetch(`${API_URL}/call/start?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`call/start failed: ${res.status}`);
  return res.json();
}

export async function streamTts(
  text: string,
  voiceId: string,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${API_URL}/call/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`call/tts failed: ${res.status}`);
  if (!res.body) throw new Error('No response body for TTS stream');
  return res.body;
}

export async function endCall(
  sessionId: string,
  childId: string,
  princess: Princess,
  durationSeconds: number,
  transcript: TranscriptTurn[],
): Promise<void> {
  await fetch(`${API_URL}/call/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      child_id: childId,
      princess,
      duration_seconds: durationSeconds,
      transcript,
    }),
    signal: AbortSignal.timeout(10_000),
  });
}
