const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export type Princess = 'elsa' | 'belle' | 'cinderella' | 'ariel';
export type Language = 'en' | 'vi';

export async function requestStory(princess: Princess, language: Language): Promise<string> {
  const res = await fetch(`${API_URL}/story`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ princess, language }),
    signal: AbortSignal.timeout(90_000), // 90s — pipeline can take 20–40s
  });
  if (!res.ok) throw new Error('Story generation failed');
  const data = await res.json();
  return data.audio_url as string;
}
