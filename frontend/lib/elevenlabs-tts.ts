import { streamTts } from './call-api';

/**
 * Streams TTS audio from the backend proxy and plays it via AudioContext.
 * Returns a promise that resolves when playback completes.
 */
export async function playTtsStream(
  text: string,
  voiceId: string,
  audioContext: AudioContext,
): Promise<void> {
  const stream = await streamTts(text, voiceId);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  // Collect all chunks (ElevenLabs streams are small for 2-4 sentences)
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine into a single buffer
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  // Decode and play
  const audioBuffer = await audioContext.decodeAudioData(combined.buffer);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);

  return new Promise<void>((resolve) => {
    source.onended = () => resolve();
    source.start(0);
  });
}
