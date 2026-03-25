# Telegram → /brief Integration Design

**Date:** 2026-03-25
**Status:** Approved

## Overview

A single n8n workflow that receives Telegram messages from the parent via a native Telegram Trigger node, filters by sender chat ID, handles text and voice messages, transcribes voice notes via OpenAI Whisper, and posts the brief text to the FastAPI `POST /brief` endpoint.

Replaces the WhatsApp Cloud API design with a simpler Telegram Bot API integration requiring no business account, no webhook verification handshake, and no two-step media download.

---

## Architecture & Data Flow

```
[Telegram Trigger]
        │
[Sender Filter]       ──── not parent ──→ exit silently
        │ match
[Message Type Switch]
        ├── text  → [Post to /brief]
        └── voice → [Download Voice File] → [Whisper Transcribe] → [Post to /brief]
```

### Nodes

1. **Telegram Trigger** — n8n native Telegram Trigger node. Connects to the bot via long polling. No public URL or webhook registration required. Fires on every incoming message and outputs a clean `message` object. Non-message events (joins, leaves, etc.) are not emitted by this node.

2. **Sender Filter** — IF node checking `{{ $json.message.chat.id }}` equals `{{ $env.PARENT_CHAT_ID }}` (integer comparison). Exits silently if no match.

3. **Message Type Switch** — Switch node routing on message content:
   - `message.text` exists → text path (output 0)
   - `message.voice` exists → voice path (output 1)
   - Anything else (photo, sticker, document, etc.) → fallback `none`, exits cleanly.

4. **Post to /brief** (text path) — HTTP Request node:
   - Method: `POST`
   - URL: `{{ $env.BACKEND_URL }}/brief`
   - Body (JSON): `{ "text": $json.message.text }`

5. **Download Voice File** — HTTP Request node (single step):
   - Method: `GET`
   - URL: `=https://api.telegram.org/bot{{ $credentials.telegramApi.accessToken }}/getFile?file_id={{ $json.message.voice.file_id }}`
   - First call returns `result.file_path`; second call fetches binary:
     `=https://api.telegram.org/file/bot{{ $credentials.telegramApi.accessToken }}/{{ $node["Download Voice File"].json.result.file_path }}`
   - In practice implemented as two HTTP Request nodes: **Get File Path** and **Download File Binary** (response format: file/binary).

6. **Whisper Transcribe** — HTTP Request node:
   - Method: `POST`
   - URL: `https://api.openai.com/v1/audio/transcriptions`
   - Content-Type: `multipart/form-data`
   - Form fields:
     - `file`: binary from previous node, filename `voice.oga`, MIME type `audio/ogg`
     - `model`: `whisper-1`
   - Auth: **OpenAI** n8n Credential (Header Auth: `Authorization: Bearer <key>`)
   - Returns JSON: `{"text": "..."}`

7. **Post to /brief** (voice path) — HTTP Request node:
   - Method: `POST`
   - URL: `{{ $env.BACKEND_URL }}/brief`
   - Body (JSON): `{ "text": $node["Whisper Transcribe"].json.text }`

All logic lives in a single exportable file: `n8n/telegram-brief.json`.

---

## Configuration & Credentials

### n8n Credentials

| Credential name | Type | Value |
|---|---|---|
| `Telegram Bot` | Telegram API | Bot token from @BotFather |
| `OpenAI` | Header Auth | `Authorization: Bearer <openai-api-key>` |

### n8n Environment Variables

| Variable | Description |
|---|---|
| `PARENT_CHAT_ID` | Parent's Telegram chat ID with the bot (integer, e.g. `123456789`). Find by messaging the bot then calling `https://api.telegram.org/bot<token>/getUpdates` |
| `BACKEND_URL` | Backend base URL (e.g. `http://backend:8000` for Docker Compose) |

### Bot Setup (one-time)

1. Message **@BotFather** → `/newbot` → follow prompts → receive bot token
2. Message your new bot once to create the chat
3. Call `https://api.telegram.org/bot<token>/getUpdates` to find your `chat.id`
4. Set `PARENT_CHAT_ID` to that integer value

No Meta dashboard, no webhook registration, no business verification required.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Message from unknown sender | Sender Filter exits silently — no error |
| Unsupported message type (photo, sticker, document, etc.) | Switch fallback exits cleanly |
| Get File Path failure | Execution marked failed; parent resends voice note |
| Download File Binary failure | Execution marked failed; parent resends voice note |
| Whisper transcription failure | Execution marked failed; parent resends voice note |
| `/brief` call failure | Execution marked failed; brief not stored; parent resends |

No automatic retries. The workflow is idempotent — duplicate rows in Supabase are acceptable. Manual resend is the recovery path.

No guard node needed for status updates: the Telegram Trigger native node only emits actual message events, not delivery receipts or other non-message updates.

---

## Files Produced

- **`n8n/telegram-brief.json`** — Importable n8n workflow with all nodes, credentials referenced by name.
- **`n8n/README.md`** — Updated setup instructions covering:
  - Bot creation via @BotFather
  - Finding `PARENT_CHAT_ID` via `getUpdates`
  - Docker Compose env var configuration
  - n8n credential setup
  - Workflow import and activation steps
  - Local test payloads (text and voice routing)
  - End-to-end verification steps

The previous `n8n/whatsapp-brief.json` is superseded by `n8n/telegram-brief.json`.

---

## Testing

**Local:**
Use n8n's "Test step" on the Telegram Trigger node — send a real message from the parent's Telegram account to the bot while the workflow is open in the editor. Step through nodes visually. The voice path requires a real bot token and file ID for the download step; routing logic is fully verifiable with text messages.

**End-to-end:**
Activate the workflow, send a text message from the parent's phone → verify row in Supabase `briefs` table. Send a voice note → verify transcribed text in the table.

---

## Out of Scope

- Automated tests for the n8n workflow
- Support for message types beyond text and voice
- Retry logic or dead-letter queuing
- Changes to the FastAPI backend
- Keeping the WhatsApp workflow active alongside Telegram
