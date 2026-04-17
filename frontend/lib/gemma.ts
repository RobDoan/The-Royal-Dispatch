const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';

export interface GemmaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

let pipeline: any = null;
let loadingPromise: Promise<void> | null = null;

export type ProgressCallback = (progress: {
  status: string;
  loaded?: number;
  total?: number;
  progress?: number;
}) => void;

export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export async function isModelCached(): Promise<boolean> {
  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    return keys.some((req) => req.url.includes('gemma'));
  } catch {
    return false;
  }
}

export async function loadModel(onProgress?: ProgressCallback): Promise<void> {
  if (pipeline) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const { pipeline: createPipeline } = await import('@huggingface/transformers');
    pipeline = await createPipeline('text-generation', MODEL_ID, {
      device: 'webgpu',
      progress_callback: onProgress,
    });
  })();

  await loadingPromise;
}

export async function generate(messages: GemmaMessage[]): Promise<string> {
  if (!pipeline) throw new Error('Model not loaded. Call loadModel() first.');

  const prompt = messages
    .map((m) => {
      if (m.role === 'system') return `<start_of_turn>user\n${m.content}<end_of_turn>`;
      if (m.role === 'user') return `<start_of_turn>user\n${m.content}<end_of_turn>`;
      return `<start_of_turn>model\n${m.content}<end_of_turn>`;
    })
    .join('\n') + '\n<start_of_turn>model\n';

  const output = await pipeline(prompt, {
    max_new_tokens: 200,
    temperature: 0.7,
    do_sample: true,
  });

  const fullText = output[0].generated_text;
  const response = fullText.slice(prompt.length).replace(/<end_of_turn>/g, '').trim();
  return response;
}

export async function processAudio(
  audioData: Float32Array,
  context: GemmaMessage[],
): Promise<string> {
  if (!pipeline) throw new Error('Model not loaded. Call loadModel() first.');

  // TODO: Replace with actual Transformers.js audio input API once confirmed.
  // The Gemma 4 E2B ONNX model supports audio input natively.
  // Interim approach: use Web Speech API for STT, then pass text to generate().
  // This will be replaced when Transformers.js audio pipeline is confirmed working.
  throw new Error(
    'Audio input via Transformers.js not yet wired. ' +
    'Use transcribeAndGenerate() from call-engine.ts as interim.'
  );
}

export async function unloadModel(): Promise<void> {
  if (pipeline) {
    await pipeline.dispose?.();
    pipeline = null;
    loadingPromise = null;
  }
}
