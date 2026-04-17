const API_URL = typeof window === 'undefined' ? 'http://localhost:3000/api' : '/api';

export type Princess = 'elsa' | 'belle' | 'cinderella' | 'ariel' | 'rapunzel' | 'moana' | 'raya' | 'mirabel' | 'chase' | 'marshall' | 'skye' | 'rubble';
export type Language = 'en' | 'vi';
export type StoryType = 'daily' | 'life_lesson';

export async function requestStory(
  princess: Princess,
  language: Language,
  storyType: StoryType = 'daily',
  childId?: string | null,
): Promise<string> {
  const body: Record<string, string> = { princess, language, story_type: storyType };
  if (childId) body.child_id = childId;
  const res = await fetch(`${API_URL}/story`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const data = await res.json();
  const url: string = data.audio_url;
  // Backend returns full URL for streaming (http://backend/story/stream?...)
  // Convert to frontend proxy path (/api/story/stream?...)
  const streamIdx = url.indexOf('/story/stream');
  if (streamIdx !== -1) {
    return `/api${url.substring(streamIdx)}`;
  }
  // Cached S3 URL — use as-is
  return url;
}

// ── SSE-based story generation ────────────────────────────────────
// Connects to the backend SSE endpoint which streams events as the
// pipeline progresses: status → ready (with text + audio URL).
// This replaces the old POST + poll approach so the frontend can
// render story text immediately when the LLM finishes.

export interface GenerationEvent {
  type: 'status' | 'ready' | 'cached' | 'error';
  storyText?: string;
  royalChallenge?: string | null;
  audioUrl?: string;
}

export function generateStorySSE(
  princess: Princess,
  language: Language,
  storyType: StoryType = 'daily',
  childId?: string | null,
  onEvent?: (event: GenerationEvent) => void,
): () => void {
  const params = new URLSearchParams({ princess, language, story_type: storyType });
  if (childId) params.set('child_id', childId);

  const eventSource = new EventSource(`/api/story/generate?${params}`);

  function handleData(type: 'ready' | 'cached', e: MessageEvent) {
    const data = JSON.parse(e.data);
    const url: string = data.audio_url || '';
    const streamIdx = url.indexOf('/story/stream');
    onEvent?.({
      type,
      storyText: data.story_text || '',
      royalChallenge: data.royal_challenge ?? null,
      audioUrl: streamIdx !== -1 ? `/api${url.substring(streamIdx)}` : url,
    });
    eventSource.close();
  }

  eventSource.addEventListener('status', () => {
    onEvent?.({ type: 'status' });
  });

  eventSource.addEventListener('ready', (e) => handleData('ready', e as MessageEvent));
  eventSource.addEventListener('cached', (e) => handleData('cached', e as MessageEvent));

  eventSource.addEventListener('error', () => {
    onEvent?.({ type: 'error' });
    eventSource.close();
  });

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) return;
    onEvent?.({ type: 'error' });
    eventSource.close();
  };

  return () => eventSource.close();
}

export async function fetchStory(
  princess: Princess,
  storyType: StoryType = 'daily',
  childId?: string | null,
): Promise<{ audioUrl: string; storyText: string; royalChallenge: string | null }> {
  const params = new URLSearchParams({ type: storyType });
  if (childId) params.set('child_id', childId);
  const url = `${API_URL}/story/today/${princess}?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) throw new Error('STORY_NOT_FOUND');
  if (!res.ok) throw new Error('STORY_ERROR');
  const data = await res.json();
  return {
    audioUrl: data.audio_url,
    storyText: data.story_text,
    royalChallenge: data.royal_challenge ?? null,
  };
}
