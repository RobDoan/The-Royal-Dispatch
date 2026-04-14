# Replace S3 with MinIO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AWS S3 with a self-hosted MinIO instance for audio file storage, keeping boto3 as the client library.

**Architecture:** MinIO runs as a Docker Compose service alongside the existing stack. boto3 connects via `endpoint_url` instead of AWS defaults. A one-shot init container creates the bucket and sets it public. Audio URLs are constructed from a configurable public URL instead of the AWS S3 URL pattern.

**Tech Stack:** MinIO (Docker), boto3 (unchanged), minio/mc (init container)

---

## File Structure

| File | Role |
|------|------|
| `docker-compose.yml` | Add `minio` + `minio-init` services, `minio_data` volume |
| `backend/storage/client.py` | Update boto3 client to use `endpoint_url` and renamed env vars |
| `backend/nodes/synthesize_voice.py` | Change URL construction to use `S3_PUBLIC_URL` |
| `backend/.env` | Replace `AWS_*` vars with `S3_*` and `MINIO_*` vars |
| `backend/.env.example` | Same env var changes |
| `backend/tests/test_storage_client.py` | Update to use new env var names |
| `backend/tests/test_nodes/test_synthesize_voice.py` | Update URL assertions and env var mocks |
| `CLAUDE.md` | Update env var documentation |

---

### Task 1: Update backend/storage/client.py and its test

**Files:**
- Modify: `backend/storage/client.py`
- Modify: `backend/tests/test_storage_client.py`

- [ ] **Step 1: Update the test to use new env vars**

Replace the test in `backend/tests/test_storage_client.py` with:

```python
import os
from unittest.mock import MagicMock


def test_get_storage_returns_singleton(mocker):
    mock_s3 = MagicMock()
    mocker.patch.dict(os.environ, {
        "S3_ACCESS_KEY": "test-key",
        "S3_SECRET_KEY": "test-secret",
        "S3_ENDPOINT_URL": "http://minio:9000",
    })
    mocker.patch("backend.storage.client.boto3.client", return_value=mock_s3)
    import backend.storage.client as storage_module
    storage_module._client = None
    from backend.storage.client import get_storage
    s1 = get_storage()
    s2 = get_storage()
    assert s1 is s2
    assert s1 is mock_s3
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/test_storage_client.py -v`
Expected: FAIL — `get_storage()` still reads `AWS_ACCESS_KEY_ID` etc., which aren't set.

- [ ] **Step 3: Update storage client implementation**

Replace `backend/storage/client.py` with:

```python
import os
import boto3
from dotenv import load_dotenv

load_dotenv()

_client = None


def get_storage():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            aws_access_key_id=os.environ["S3_ACCESS_KEY"],
            aws_secret_access_key=os.environ["S3_SECRET_KEY"],
            endpoint_url=os.environ["S3_ENDPOINT_URL"],
        )
    return _client
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/test_storage_client.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/storage/client.py backend/tests/test_storage_client.py
git commit -m "feat: update storage client to use MinIO endpoint URL"
```

---

### Task 2: Update synthesize_voice.py and its tests

**Files:**
- Modify: `backend/nodes/synthesize_voice.py`
- Modify: `backend/tests/test_nodes/test_synthesize_voice.py`

- [ ] **Step 1: Update tests to use new env vars and URL format**

Replace `backend/tests/test_nodes/test_synthesize_voice.py` with:

```python
import os
import pytest
from unittest.mock import MagicMock
from datetime import date
from backend.state import RoyalState
from backend.nodes.synthesize_voice import synthesize_voice


@pytest.fixture
def ready_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She shared today.", tone="praise",
        persona={"voice_id": "test-voice-id"},
        story_type="daily", situation="",
        story_text="[PROUD] Emma, you did wonderfully today!",
        audio_url="", language="en",
        timezone="America/Los_Angeles",
    )


def test_synthesize_voice_uploads_and_returns_url(ready_state, mocker):
    mock_elevenlabs = MagicMock()
    mock_elevenlabs.text_to_speech.convert.return_value = iter([b"chunk1", b"chunk2"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_elevenlabs)

    mock_s3 = MagicMock()
    mocker.patch("backend.nodes.synthesize_voice.get_storage", return_value=mock_s3)
    mocker.patch.dict(os.environ, {
        "S3_BUCKET": "royal-audio",
        "S3_PUBLIC_URL": "https://minio.quybits.com",
    })

    result = synthesize_voice(ready_state)

    mock_s3.put_object.assert_called_once()
    call_kwargs = mock_s3.put_object.call_args[1]
    assert call_kwargs["Bucket"] == "royal-audio"
    assert call_kwargs["ContentType"] == "audio/mpeg"
    assert result["audio_url"].startswith("https://minio.quybits.com/royal-audio/")


def test_synthesize_voice_daily_filename_format(ready_state, mocker):
    ready_state["date"] = "2026-03-29"
    ready_state["princess"] = "elsa"
    ready_state["language"] = "en"
    ready_state["story_type"] = "daily"

    mock_elevenlabs = MagicMock()
    mock_elevenlabs.text_to_speech.convert.return_value = iter([b"chunk"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_elevenlabs)
    mock_s3 = MagicMock()
    mocker.patch("backend.nodes.synthesize_voice.get_storage", return_value=mock_s3)
    mocker.patch.dict(os.environ, {
        "S3_BUCKET": "royal-audio",
        "S3_PUBLIC_URL": "https://minio.quybits.com",
    })

    synthesize_voice(ready_state)

    key = mock_s3.put_object.call_args[1]["Key"]
    assert key == "2026-03-29-elsa-en.mp3"


def test_synthesize_voice_life_lesson_filename_includes_suffix(mocker):
    state = RoyalState(
        princess="elsa", date="2026-03-24",
        brief="Emma shared today.", tone="praise",
        persona={"voice_id": "test-voice-id"},
        story_type="life_lesson", situation="sharing",
        story_text="[GENTLE] Emma, sharing is caring.",
        audio_url="", language="en",
        timezone="America/Los_Angeles",
    )
    mock_elevenlabs = MagicMock()
    mock_elevenlabs.text_to_speech.convert.return_value = iter([b"chunk"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_elevenlabs)
    mock_s3 = MagicMock()
    mocker.patch("backend.nodes.synthesize_voice.get_storage", return_value=mock_s3)
    mocker.patch.dict(os.environ, {
        "S3_BUCKET": "royal-audio",
        "S3_PUBLIC_URL": "https://minio.quybits.com",
    })

    synthesize_voice(state)

    key = mock_s3.put_object.call_args[1]["Key"]
    assert key == "2026-03-24-elsa-en-life_lesson.mp3"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_nodes/test_synthesize_voice.py -v`
Expected: FAIL — `test_synthesize_voice_uploads_and_returns_url` fails because URL still uses AWS S3 pattern.

- [ ] **Step 3: Update synthesize_voice implementation**

Replace `backend/nodes/synthesize_voice.py` with:

```python
import os
from elevenlabs.client import ElevenLabs
from backend.state import RoyalStateOptional
from backend.storage.client import get_storage

_elevenlabs = None


def get_elevenlabs_client() -> ElevenLabs:
    global _elevenlabs
    if _elevenlabs is None:
        _elevenlabs = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    return _elevenlabs


def synthesize_voice(state: RoyalStateOptional) -> dict:
    client = get_elevenlabs_client()
    audio_chunks = client.text_to_speech.convert(
        voice_id=state["persona"]["voice_id"],
        text=state["story_text"],
        model_id="eleven_v3",
        output_format="mp3_44100_128",
    )
    audio_bytes = b"".join(audio_chunks)

    story_type = state["story_type"]
    suffix = f"-{story_type}" if story_type != "daily" else ""
    filename = f"{state['date']}-{state['princess']}-{state['language']}{suffix}.mp3"

    bucket = os.environ["S3_BUCKET"]
    public_url = os.environ["S3_PUBLIC_URL"]
    get_storage().put_object(
        Bucket=bucket,
        Key=filename,
        Body=audio_bytes,
        ContentType="audio/mpeg",
    )
    audio_url = f"{public_url}/{bucket}/{filename}"
    return {"audio_url": audio_url}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_nodes/test_synthesize_voice.py -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/nodes/synthesize_voice.py backend/tests/test_nodes/test_synthesize_voice.py
git commit -m "feat: use S3_PUBLIC_URL for audio URL construction"
```

---

### Task 3: Update environment files

**Files:**
- Modify: `backend/.env`
- Modify: `backend/.env.example`

- [ ] **Step 1: Update backend/.env**

Replace the S3/AWS section in `backend/.env`:

Old:
```
# Amazon S3
AWS_ACCESS_KEY_ID=your-key-id
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
S3_BUCKET=royal-audio
```

New:
```
# MinIO (S3-compatible)
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_ENDPOINT_URL=http://minio:9000
S3_PUBLIC_URL=https://minio.quybits.com
S3_BUCKET=royal-audio
```

- [ ] **Step 2: Update backend/.env.example**

Replace the same section in `backend/.env.example`:

Old:
```
# Amazon S3
AWS_ACCESS_KEY_ID=your-key-id
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
S3_BUCKET=royal-audio
```

New:
```
# MinIO (S3-compatible)
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_ENDPOINT_URL=http://minio:9000
S3_PUBLIC_URL=https://minio.quybits.com
S3_BUCKET=royal-audio
```

- [ ] **Step 3: Commit**

```bash
git add backend/.env.example
git commit -m "feat: update env vars from AWS to MinIO"
```

Note: `backend/.env` may be gitignored — only commit `.env.example`. Update `.env` locally.

---

### Task 4: Add MinIO services to docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add minio service**

Add the following after the `qdrant` service block (before `postgres`):

```yaml
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
    volumes:
      - minio_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 5s
      timeout: 5s
      retries: 5
```

- [ ] **Step 2: Add minio-init service**

Add the following after the `minio` service:

```yaml
  minio-init:
    image: minio/mc
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 $${MINIO_ROOT_USER:-minioadmin} $${MINIO_ROOT_PASSWORD:-minioadmin};
      mc mb --ignore-existing local/royal-audio;
      mc anonymous set download local/royal-audio;
      "
    restart: "no"
```

- [ ] **Step 3: Add minio_data volume**

Add `minio_data:` to the `volumes:` section at the bottom of the file:

```yaml
volumes:
  n8n_data:
  qdrant_data:
  postgres_data:
  minio_data:
```

- [ ] **Step 4: Add minio to backend depends_on**

Update the backend service's `depends_on` to include `minio`:

```yaml
    depends_on:
      qdrant:
        condition: service_started
      minio:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add MinIO and init services to docker-compose"
```

---

### Task 5: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Database section**

In the `### Database (PostgreSQL)` section, change:

```
Audio files stored in Amazon S3 (`S3_BUCKET`).
```

to:

```
Audio files stored in MinIO (`S3_BUCKET`), an S3-compatible object store running as a Docker service.
```

- [ ] **Step 2: Update the Key Env Vars table**

Replace the backend env vars row:

Old:
```
| `backend/.env` | `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`, `QDRANT_URL`, `OPENAI_API_KEY` |
```

New:
```
| `backend/.env` | `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT_URL`, `S3_PUBLIC_URL`, `S3_BUCKET`, `QDRANT_URL`, `OPENAI_API_KEY` |
```

- [ ] **Step 3: Update the Docker comment**

In the Docker (full stack) section, update the comment:

Old:
```
# Backend: :8000  Frontend: :3000  Admin: :3001  n8n: :5678  Qdrant: :6333  PostgreSQL: :5432
```

New:
```
# Backend: :8000  Frontend: :3000  Admin: :3001  n8n: :5678  Qdrant: :6333  PostgreSQL: :5432  MinIO: :9000/:9001
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for MinIO storage"
```

---

### Task 6: Smoke test with Docker Compose

- [ ] **Step 1: Start the stack**

Run: `docker compose up --build -d`
Expected: All services start, including `minio` and `minio-init`.

- [ ] **Step 2: Verify MinIO is healthy**

Run: `docker compose ps minio`
Expected: Status shows "healthy"

- [ ] **Step 3: Verify bucket was created**

Run: `docker compose exec minio mc alias set local http://localhost:9000 minioadmin minioadmin && docker compose exec minio mc ls local/`
Expected: `royal-audio` bucket listed.

Alternative check via curl:
Run: `curl -s http://localhost:9000/minio/health/live`
Expected: HTTP 200

- [ ] **Step 4: Verify backend can upload**

Run: `curl -s http://localhost:8000/docs`
Expected: FastAPI docs page loads (backend started successfully with new env vars).

- [ ] **Step 5: Check MinIO console**

Open `http://localhost:9001` in browser. Login with `minioadmin`/`minioadmin`. Verify `royal-audio` bucket exists and has public download policy.
