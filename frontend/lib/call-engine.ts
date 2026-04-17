import { generate, loadModel, unloadModel } from './gemma';
import type { GemmaMessage } from './gemma';
import { playTtsStream } from './elevenlabs-tts';
import { startCall, endCall } from './call-api';
import type { CallStartData, TranscriptTurn } from './call-api';
import type { Princess } from './api';

export type CallState = 'LOADING' | 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ENDED';

export interface CallCallbacks {
  onStateChange: (state: CallState) => void;
  onTranscript: (turn: TranscriptTurn) => void;
  onTimerTick: (secondsRemaining: number) => void;
  onError: (error: string) => void;
}

const SILENCE_TIMEOUT_MS = 1500;
const IDLE_PROMPT_TIMEOUT_MS = 10000;

function buildSystemPrompt(data: CallStartData): string {
  return `You are ${data.persona.name}, from ${data.persona.origin}. ${data.persona.tone_style}

You are on a magical phone call with ${data.child_name}.

## Your personality
- Signature phrase: "${data.persona.signature_phrase}"
- You speak with warmth, wonder, and encouragement
- You weave in light educational moments naturally (counting, colors, simple questions)
- You NEVER break character
- You keep responses short (2-4 sentences) — this is a conversation, not a monologue

## What you know about ${data.child_name}
${data.memories || 'This is your first time talking!'}

## Rules
- English only
- Age-appropriate content only — nothing scary, violent, or sad
- If the child says something you don't understand, gently ask them to repeat
- Never mention being an AI, a model, or a computer
- If asked about other princesses, stay positive but redirect to your own world`;
}

export class CallEngine {
  private state: CallState = 'LOADING';
  private callbacks: CallCallbacks;
  private princess: Princess;
  private childId: string;
  private sessionData: CallStartData | null = null;
  private messages: GemmaMessage[] = [];
  private transcript: TranscriptTurn[] = [];
  private audioContext: AudioContext | null = null;
  private recognition: SpeechRecognition | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private secondsRemaining = 0;
  private silenceTimeout: ReturnType<typeof setTimeout> | null = null;
  private idleTimeout: ReturnType<typeof setTimeout> | null = null;
  private startTime = 0;
  private wrapUpInjected = false;

  constructor(princess: Princess, childId: string, callbacks: CallCallbacks) {
    this.princess = princess;
    this.childId = childId;
    this.callbacks = callbacks;
  }

  private setState(state: CallState) {
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  async start(): Promise<void> {
    try {
      this.setState('LOADING');

      const [, sessionData] = await Promise.all([
        loadModel(),
        startCall(this.childId, this.princess),
      ]);
      this.sessionData = sessionData;
      this.secondsRemaining = sessionData.timer_seconds;

      this.messages = [{ role: 'system', content: buildSystemPrompt(sessionData) }];

      this.audioContext = new AudioContext();

      this.setState('THINKING');
      const greeting = await generate(this.messages);
      this.messages.push({ role: 'assistant', content: greeting });
      this.transcript.push({ role: 'princess', text: greeting });
      this.callbacks.onTranscript({ role: 'princess', text: greeting });

      this.setState('SPEAKING');
      await playTtsStream(greeting, sessionData.persona.voice_id, this.audioContext);

      this.startTime = Date.now();
      this.timerInterval = setInterval(() => this.tick(), 1000);

      this.startListening();
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err.message : 'Failed to start call');
      this.setState('ENDED');
    }
  }

  private tick() {
    this.secondsRemaining = Math.max(0, this.secondsRemaining - 1);
    this.callbacks.onTimerTick(this.secondsRemaining);

    if (this.secondsRemaining <= 60 && !this.wrapUpInjected) {
      this.wrapUpInjected = true;
      this.messages.push({
        role: 'system',
        content: '[The call is ending soon. Start wrapping up naturally within your next 2-3 responses. Say goodbye warmly and use your signature phrase.]',
      });
    }

    if (this.secondsRemaining <= 0) {
      this.endCall();
    }
  }

  private startListening() {
    this.setState('IDLE');

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      this.callbacks.onError('Speech recognition not supported on this device');
      this.endCall();
      return;
    }

    this.recognition = new SpeechRecognitionClass();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) {
        const text = last[0].transcript.trim();
        if (text) {
          this.clearSilenceTimeout();
          this.clearIdleTimeout();
          this.handleChildSpeech(text);
        }
      }
    };

    this.recognition.onspeechstart = () => {
      this.setState('LISTENING');
      this.clearIdleTimeout();
    };

    this.recognition.onspeechend = () => {
      this.startSilenceTimeout();
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        this.callbacks.onError(`Speech recognition error: ${event.error}`);
      }
    };

    this.recognition.onend = () => {
      if (this.state === 'IDLE' || this.state === 'LISTENING') {
        try {
          this.recognition?.start();
        } catch {
          // already running
        }
      }
    };

    this.recognition.start();
    this.startIdleTimeout();
  }

  private startSilenceTimeout() {
    this.clearSilenceTimeout();
    this.silenceTimeout = setTimeout(() => {
      // Silence detected
    }, SILENCE_TIMEOUT_MS);
  }

  private clearSilenceTimeout() {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
  }

  private startIdleTimeout() {
    this.clearIdleTimeout();
    this.idleTimeout = setTimeout(() => {
      this.handleChildSpeech('');
    }, IDLE_PROMPT_TIMEOUT_MS);
  }

  private clearIdleTimeout() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
  }

  private async handleChildSpeech(text: string) {
    if (this.state === 'THINKING' || this.state === 'SPEAKING' || this.state === 'ENDED') return;

    this.recognition?.stop();

    if (text) {
      this.transcript.push({ role: 'child', text });
      this.callbacks.onTranscript({ role: 'child', text });
      this.messages.push({ role: 'user', content: text });
    } else {
      this.messages.push({
        role: 'user',
        content: '(silence — the child has been quiet for a while)',
      });
    }

    // Trim context window: keep system prompt (index 0) + last 20 messages
    if (this.messages.length > 21) {
      this.messages = [this.messages[0], ...this.messages.slice(-20)];
    }

    this.setState('THINKING');
    try {
      const response = await generate(this.messages);
      this.messages.push({ role: 'assistant', content: response });
      this.transcript.push({ role: 'princess', text: response });
      this.callbacks.onTranscript({ role: 'princess', text: response });

      // State can change asynchronously (e.g. endCall from timer), so re-check
      if ((this.state as CallState) === 'ENDED' || !this.audioContext || !this.sessionData) return;
      this.setState('SPEAKING');
      await playTtsStream(response, this.sessionData.persona.voice_id, this.audioContext);

      if ((this.state as CallState) !== 'ENDED') {
        this.startListening();
      }
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err.message : 'Generation failed');
      if ((this.state as CallState) !== 'ENDED') {
        this.startListening();
      }
    }
  }

  async endCall(): Promise<void> {
    if (this.state === 'ENDED') return;
    this.setState('ENDED');

    this.recognition?.stop();
    this.recognition = null;
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.clearSilenceTimeout();
    this.clearIdleTimeout();
    await this.audioContext?.close();
    this.audioContext = null;

    if (this.sessionData) {
      const durationSeconds = Math.round((Date.now() - this.startTime) / 1000);
      try {
        await endCall(
          this.sessionData.session_id,
          this.childId,
          this.princess,
          durationSeconds,
          this.transcript,
        );
      } catch {
        // Best-effort
      }
    }

    await unloadModel();
  }
}
