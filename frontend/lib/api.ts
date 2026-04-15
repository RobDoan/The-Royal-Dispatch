const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? NEXT_PUBLIC_API_URL;

const API_URL = typeof window === 'undefined' ? INTERNAL_API_URL : NEXT_PUBLIC_API_URL;

export type Princess = 'elsa' | 'belle' | 'cinderella' | 'ariel';
export type Language = 'en' | 'vi';
export type StoryType = 'daily' | 'life_lesson';

export async function requestStory(
  princess: Princess,
  language: Language,
  storyType: StoryType = 'daily',
  childId?: string | null,
): Promise<void> {
  const body: Record<string, string> = { princess, language, story_type: storyType };
  if (childId) body.child_id = childId;
  await fetch(`${API_URL}/story`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
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
