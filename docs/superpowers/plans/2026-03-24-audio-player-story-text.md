# Audio Player Story Text & Polling Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock story text and hardcoded duration in AudioPlayer with real API data, and replace the blocking inbox wait with an immediate navigation + looping video polling flow.

**Architecture:** The inbox fires `POST /story` fire-and-forget and immediately navigates to the play page. The play page polls `GET /story/today/{princess}` every 3 seconds (max 75s) — showing a looping video while waiting, then transitioning to AudioPlayer once the story is ready. AudioPlayer receives `storyText` as a prop and displays it with ElevenLabs audio tags stripped.

**Tech Stack:** FastAPI (Python, pytest), Next.js 15 App Router, TypeScript, Vitest + React Testing Library, next-intl for i18n

**Spec:** `docs/superpowers/specs/2026-03-24-audio-player-story-text-design.md`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `backend/main.py` | Modify | Add `GET /story/today/{princess}` endpoint after existing `/story/today` |
| `backend/tests/test_api.py` | Modify | Add tests for new endpoint |
| `frontend/lib/api.ts` | Modify | Add `fetchStory()` function |
| `frontend/messages/en.json` | Modify | Add sorry messages + writing label keys |
| `frontend/messages/vi.json` | Modify | Add Vietnamese versions of same |
| `frontend/components/AudioPlayer.tsx` | Modify | Add `storyText` prop, `formatTime`, `stripAudioTags`, fix listener leak |
| `frontend/tests/AudioPlayer.test.tsx` | Modify | Add tests for storyText rendering and duration formatting |
| `frontend/app/[locale]/play/[princess]/page.tsx` | Modify | Replace search-param approach with polling loop + video + sorry card |
| `frontend/app/[locale]/page.tsx` | Modify | Fire-and-forget `requestStory`, remove loading state, navigate immediately |

---

## Task 1: Backend — `GET /story/today/{princess}` endpoint

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/test_api.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_api.py`:

```python
def test_get_story_today_princess_returns_story(mocker):
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"audio_url": "https://example.com/elsa.mp3", "story_text": "Dear Emma, [PROUD] today you were brave..."},
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_supabase)
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.get("/story/today/elsa")
    assert response.status_code == 200
    assert response.json()["audio_url"] == "https://example.com/elsa.mp3"
    assert response.json()["story_text"] == "Dear Emma, [PROUD] today you were brave..."

def test_get_story_today_princess_returns_404_when_not_generated(mocker):
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    mocker.patch("backend.main.get_supabase_client", return_value=mock_supabase)
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.get("/story/today/elsa")
    assert response.status_code == 404

def test_get_story_today_static_route_not_shadowed(mocker):
    """Verify /story/today (no param) still works after adding /story/today/{princess}."""
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"princess": "elsa", "audio_url": "https://example.com/elsa.mp3"},
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_supabase)
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.get("/story/today")
    assert response.status_code == 200
    assert "cached" in response.json()
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch
pytest backend/tests/test_api.py::test_get_story_today_princess_returns_story \
       backend/tests/test_api.py::test_get_story_today_princess_returns_404_when_not_generated \
       backend/tests/test_api.py::test_get_story_today_static_route_not_shadowed -v
```

Expected: first two tests FAIL (endpoint doesn't exist), third PASS.

- [ ] **Step 3: Add the endpoint to `backend/main.py`**

Add a new response model and endpoint **after** the existing `get_today_stories` function:

```python
class StoryDetailResponse(BaseModel):
    audio_url: str
    story_text: str

@app.get("/story/today/{princess}", response_model=StoryDetailResponse)
def get_today_story_for_princess(princess: str):
    today = date.today().isoformat()
    client = get_supabase_client()
    result = client.table("stories").select("audio_url,story_text").eq("date", today).eq("princess", princess).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Story not found for today")
    row = result.data[0]
    return StoryDetailResponse(audio_url=row["audio_url"], story_text=row["story_text"])
```

**Important:** This function must appear in the file *after* `get_today_stories` (the `GET /story/today` handler). FastAPI resolves static path segments before parameterized ones only when the static route is registered first.

- [ ] **Step 4: Run all three tests — confirm they all pass**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch
pytest backend/tests/test_api.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_api.py
git commit -m "feat: add GET /story/today/{princess} endpoint"
```

---

## Task 2: Frontend — `fetchStory` in `lib/api.ts`

**Files:**
- Modify: `frontend/lib/api.ts`

No test file exists for `api.ts` — this is a thin fetch wrapper, integration-tested indirectly by the play page tests. The function is simple enough that a dedicated unit test would be testing `fetch` itself.

- [ ] **Step 1: Add `fetchStory` to `frontend/lib/api.ts`**

```typescript
export async function fetchStory(princess: Princess): Promise<{ audioUrl: string; storyText: string }> {
  const res = await fetch(`${API_URL}/story/today/${princess}`);
  if (res.status === 404) throw new Error('STORY_NOT_FOUND');
  if (!res.ok) throw new Error('STORY_ERROR');
  const data = await res.json();
  return { audioUrl: data.audio_url, storyText: data.story_text };
}
```

Place this after the existing `requestStory` function. The snake_case→camelCase mapping happens here so all components receive consistent camelCase.

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: add fetchStory to api.ts"
```

---

## Task 3: i18n — Add sorry messages and writing label

**Files:**
- Modify: `frontend/messages/en.json`
- Modify: `frontend/messages/vi.json`

- [ ] **Step 1: Update `frontend/messages/en.json`**

Add `sorryMessages` and `writing` keys inside the `"app"` object:

```json
{
  "app": {
    "title": "The Royal Dispatch",
    "greeting": "Good evening, Princess Emma",
    "subtitle": "Your letters have arrived",
    "loading": "{princess} is writing your letter...",
    "error": "{princess}'s letter is on its way — try again in a moment 💌",
    "playing": "Playing {princess}'s letter to Emma...",
    "writing": "{princess} is writing your letter...",
    "goBack": "Go Back",
    "sorryMessages": {
      "elsa": "Elsa got caught in a snowstorm in Arendelle... ❄️ Try again in a little while!",
      "belle": "Belle is lost in her favourite book right now 📚 She'll be back soon!",
      "cinderella": "Cinderella is at the royal ball tonight 👠 Try again in a moment!",
      "ariel": "Ariel is swimming with the dolphins and can't come to the surface 🐠 Try again soon!"
    },
    "origins": {
      "elsa": "Kingdom of Arendelle",
      "belle": "The Enchanted Castle",
      "cinderella": "The Royal Palace",
      "ariel": "Under the Sea"
    }
  }
}
```

- [ ] **Step 2: Update `frontend/messages/vi.json`**

```json
{
  "app": {
    "title": "Thư Từ Công Chúa",
    "greeting": "Chào buổi tối, Công chúa Emma",
    "subtitle": "Thư của em đã đến rồi",
    "loading": "{princess} đang viết thư cho em...",
    "error": "Thư của {princess} đang trên đường — thử lại một chút nhé 💌",
    "playing": "Đang phát thư của {princess} cho Emma...",
    "writing": "{princess} đang viết thư cho em...",
    "goBack": "Quay lại",
    "sorryMessages": {
      "elsa": "Elsa bị mắc kẹt trong trận bão tuyết ở Arendelle... ❄️ Thử lại một lát nữa nhé!",
      "belle": "Belle đang mải đọc cuốn sách yêu thích 📚 Cô ấy sẽ quay lại sớm thôi!",
      "cinderella": "Cinderella đang ở vũ hội hoàng gia tối nay 👠 Thử lại một chút nhé!",
      "ariel": "Ariel đang bơi cùng những chú cá heo và chưa thể lên mặt nước 🐠 Thử lại sớm nhé!"
    },
    "origins": {
      "elsa": "Vương quốc Arendelle",
      "belle": "Lâu đài Phù chú",
      "cinderella": "Hoàng cung",
      "ariel": "Dưới lòng đại dương"
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/messages/en.json frontend/messages/vi.json
git commit -m "feat: add sorry messages and writing label to i18n"
```

---

## Task 4: `AudioPlayer.tsx` — real story text, fixed duration, listener cleanup

**Files:**
- Modify: `frontend/components/AudioPlayer.tsx`
- Modify: `frontend/tests/AudioPlayer.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `frontend/tests/AudioPlayer.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AudioPlayer } from '@/components/AudioPlayer';
import { describe, it, expect } from 'vitest';
import messages from '../messages/en.json';

const mockPrincess = { id: 'elsa' as const, name: 'Queen Elsa', emoji: '❄️' };

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe('AudioPlayer', () => {
  it('renders the princess name', () => {
    renderWithIntl(
      <AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" storyText="Hello Emma" />
    );
    expect(screen.getAllByText(/Queen Elsa/i).length).toBeGreaterThan(0);
  });

  it('renders the ambient emoji', () => {
    renderWithIntl(
      <AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" storyText="Hello Emma" />
    );
    expect(screen.getAllByText('❄️').length).toBeGreaterThan(0);
  });

  it('renders the story text', () => {
    renderWithIntl(
      <AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" storyText="Dear Emma, you were so brave today." />
    );
    expect(screen.getByText(/Dear Emma, you were so brave today\./i)).toBeInTheDocument();
  });

  it('strips ElevenLabs audio tags from story text', () => {
    renderWithIntl(
      <AudioPlayer
        princess={mockPrincess}
        audioUrl="https://example.com/test.mp3"
        storyText="[PROUD] Dear Emma, [CALM] you were brave."
      />
    );
    expect(screen.getByText(/Dear Emma,\s+you were brave\./i)).toBeInTheDocument();
    expect(screen.queryByText(/\[PROUD\]/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\[CALM\]/)).not.toBeInTheDocument();
  });

  it('shows --:-- for duration before audio metadata loads', () => {
    renderWithIntl(
      <AudioPlayer princess={mockPrincess} audioUrl="https://example.com/test.mp3" storyText="Hello" />
    );
    // Both the Runtime label and footer right timestamp use formatTime(0) = '--:--'
    const dashes = screen.getAllByText('--:--');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend
npx vitest run tests/AudioPlayer.test.tsx
```

Expected: `renders the story text`, `strips ElevenLabs audio tags`, `shows --:--` FAIL. First two PASS.

- [ ] **Step 3: Update `frontend/components/AudioPlayer.tsx`**

Make these changes:

**a) Update Props interface:**
```typescript
interface Props {
  princess: { id: string; name: string; emoji: string; origin?: string };
  audioUrl: string;
  storyText: string;
}
```

**b) Add helpers above the component function:**
```typescript
// duration is undefined until loadedmetadata fires; progress is always a number (starts at 0).
function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function stripAudioTags(text: string): string {
  // Strip [ALL_CAPS] tags then collapse any resulting double spaces.
  return text.replace(/\[[A-Z_]+\]/g, '').replace(/\s{2,}/g, ' ').trim();
}
```

**c) Fix the `loadedmetadata` listener leak in `useEffect`:**

Change `duration` state initializer to `undefined` (so `formatTime` correctly shows `--:--` before metadata loads):
```typescript
const [duration, setDuration] = useState<number | undefined>(undefined);
```

Replace the anonymous inline listener with a named reference:
```typescript
useEffect(() => {
  const audio = audioRef.current;
  if (!audio) return;
  audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  audio.onended = () => setPlaying(false);

  const handleTimeUpdate = () => {
    setProgress(audio.currentTime);
  };
  const handleMetadata = () => setDuration(audio.duration);

  audio.addEventListener('timeupdate', handleTimeUpdate);
  audio.addEventListener('loadedmetadata', handleMetadata);
  return () => {
    audio.removeEventListener('timeupdate', handleTimeUpdate);
    audio.removeEventListener('loadedmetadata', handleMetadata);
    audio.onended = null;
  };
}, [audioUrl]);
```

**d) Replace "Runtime: 7 mins" with real duration:**
```typescript
// Replace:
<p className="text-gray-500 font-semibold mb-8 text-sm">Runtime: 7 mins</p>
// With:
<p className="text-gray-500 font-semibold mb-8 text-sm">Runtime: {formatTime(duration)}</p>
```

**e) Replace mock transcript paragraphs with real story text:**
```typescript
// Replace the entire "Mock Transcript Text" div:
<div className="text-[17px] text-gray-700 leading-relaxed space-y-7 font-medium pb-8 w-full max-w-prose">
  <p>{stripAudioTags(storyText)}</p>
</div>
```

**f) Fix footer timestamps — replace both hardcoded values:**
```typescript
// Left timestamp — replace:
<span className="text-[11px] font-bold text-gray-400 w-10 text-left">
  0:{Math.floor(progress).toString().padStart(2, '0')}
</span>
// With:
<span className="text-[11px] font-bold text-gray-400 w-10 text-left">
  {formatTime(progress)}
</span>

// Right timestamp — replace:
<span className="text-[11px] font-bold text-gray-400 w-10 text-right">
  {duration ? `0:${Math.floor(duration).toString().padStart(2, '0')}` : '7:00'}
</span>
// With:
<span className="text-[11px] font-bold text-gray-400 w-10 text-right">
  {formatTime(duration)}
</span>
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend
npx vitest run tests/AudioPlayer.test.tsx
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/AudioPlayer.tsx frontend/tests/AudioPlayer.test.tsx
git commit -m "feat: AudioPlayer accepts real storyText, fixes duration format and listener leak"
```

---

## Task 5: Play page — polling loop, video loading state, sorry card

**Files:**
- Modify: `frontend/app/[locale]/play/[princess]/page.tsx`

- [ ] **Step 1: Define princess theme colors for the overlay**

Each princess needs a color overlay on the loading video. Add this map at the top of the file (alongside `PRINCESS_META`):

```typescript
const PRINCESS_OVERLAY: Record<string, string> = {
  elsa:       'rgba(147, 197, 253, 0.25)',  // blue-300
  belle:      'rgba(252, 211, 77, 0.25)',   // yellow-300
  cinderella: 'rgba(249, 168, 212, 0.25)',  // pink-300
  ariel:      'rgba(110, 231, 183, 0.25)',  // emerald-300
};
```

- [ ] **Step 2: Rewrite `play/[princess]/page.tsx`**

Replace the entire file:

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { AudioPlayer } from '@/components/AudioPlayer';
import { fetchStory, Princess } from '@/lib/api';

const PRINCESS_META = {
  elsa:       { name: 'Queen Elsa',  emoji: '❄️',  origin: 'Kingdom of Arendelle' },
  belle:      { name: 'Belle',       emoji: '📚',  origin: 'The Enchanted Castle' },
  cinderella: { name: 'Cinderella',  emoji: '👠',  origin: 'The Royal Palace' },
  ariel:      { name: 'Ariel',       emoji: '🐠',  origin: 'Under the Sea' },
} as const;

const PRINCESS_OVERLAY: Record<string, string> = {
  elsa:       'rgba(147, 197, 253, 0.25)',
  belle:      'rgba(252, 211, 77, 0.25)',
  cinderella: 'rgba(249, 168, 212, 0.25)',
  ariel:      'rgba(110, 231, 183, 0.25)',
};

type PrincessId = keyof typeof PRINCESS_META;
type PageState = 'polling' | 'ready' | 'timeout' | 'error';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 75000;

export default function PlayPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('app');

  const princessId = (params.princess as PrincessId) ?? 'elsa';
  const meta = PRINCESS_META[princessId] ?? PRINCESS_META.elsa;
  const overlay = PRINCESS_OVERLAY[princessId] ?? 'rgba(200,200,200,0.2)';

  const [pageState, setPageState] = useState<PageState>('polling');
  const [audioUrl, setAudioUrl] = useState('');
  const [storyText, setStoryText] = useState('');

  const elapsedRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function stopPolling() {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(async () => {
      elapsedRef.current += POLL_INTERVAL_MS;

      if (elapsedRef.current >= POLL_TIMEOUT_MS) {
        stopPolling();
        setPageState('timeout');
        return;
      }

      try {
        const result = await fetchStory(princessId as Princess);
        stopPolling();
        setAudioUrl(result.audioUrl);
        setStoryText(result.storyText);
        setPageState('ready');
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'STORY_ERROR') {
          stopPolling();
          setPageState('error');
        }
        // STORY_NOT_FOUND → keep polling
      }
    }, POLL_INTERVAL_MS);

    return stopPolling;
  }, [princessId]);

  if (pageState === 'ready') {
    return (
      <AudioPlayer
        princess={{ id: princessId, ...meta }}
        audioUrl={audioUrl}
        storyText={storyText}
      />
    );
  }

  if (pageState === 'timeout' || pageState === 'error') {
    const sorryKey = `sorryMessages.${princessId}` as const;
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[var(--background)] px-8 text-center gap-6">
        <img
          src={`/characters/${princessId}.png`}
          alt={meta.name}
          className="w-48 h-48 object-cover rounded-full shadow-lg opacity-80"
        />
        <p className="text-xl font-bold text-gray-700 max-w-xs leading-snug">
          {t(sorryKey)}
        </p>
        <button
          onClick={() => router.push(`/${locale}`)}
          className="mt-2 px-8 py-3 bg-black text-white font-bold rounded-full text-sm tracking-widest uppercase"
        >
          {t('goBack')}
        </button>
      </div>
    );
  }

  // polling state — looping video
  return (
    <div className="fixed inset-0 overflow-hidden">
      <video
        src="/videos/Princess_Writes_Letter_For_Emma.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-cover"
      />
      <div
        className="absolute inset-0"
        style={{ backgroundColor: overlay }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Run the full frontend test suite to confirm no regressions**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/[locale]/play/[princess]/page.tsx
git commit -m "feat: play page polls for story with video loading state and sorry card"
```

---

## Task 6: Inbox — fire-and-forget, immediate navigation

**Files:**
- Modify: `frontend/app/[locale]/page.tsx`

- [ ] **Step 1: Update `handleSelectPrincess` in `frontend/app/[locale]/page.tsx`**

Replace the existing `handleSelectPrincess` function:

```typescript
function handleSelectPrincess(id: Princess) {
  // Fire generation — no await. Errors are handled on the play page.
  requestStory(id, language);
  router.push(`/${locale}/play/${id}`);
}
```

Also remove the now-unused state and related JSX:
- Remove `const [loadingPrincess, setLoadingPrincess] = useState<Princess | null>(null);`
- Remove `const [error, setError] = useState<string | null>(null);`
- Remove `isLoading={loadingPrincess === p.id}` from `<PrincessCard>`
- Remove the error message `<div>` at the bottom of the JSX

- [ ] **Step 2: Run the full frontend test suite**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 3: Run the backend test suite to confirm no regressions**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch
pytest backend/tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/[locale]/page.tsx
git commit -m "feat: inbox navigates immediately, story generation fires in background"
```

---

## Task 7: Smoke test end-to-end

- [ ] **Step 1: Start backend**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch
uvicorn backend.main:app --reload
```

- [ ] **Step 2: Start frontend**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch/frontend
npm run dev
```

- [ ] **Step 3: Verify the following manually**

1. Open `http://localhost:3000` — Royal Inbox loads
2. Tap a princess — navigates immediately to play page (no waiting on inbox)
3. Play page shows looping video
4. After story generates (~20–40s), video disappears and AudioPlayer appears
5. Audio auto-plays, story text shows in scroll area (no mock text)
6. Duration shows real value (e.g. `3:42`), not `7:00` or `7 mins`
7. Progress timestamps show `m:ss` format correctly
8. To test timeout: use a princess with no story and disconnect the backend — after 75s the sorry card appears with the correct princess message

- [ ] **Step 4: Final commit if any tweaks were needed**

```bash
git add -p  # stage only intentional tweaks
git commit -m "fix: smoke test adjustments"
```
