# Telegram → /brief Integration Design

**Date:** 2026-03-25
**Status:** Approved

## Overview

A single n8n workflow that receives Telegram messages from the parent via a native Telegram Trigger node, filters by sender chat ID, handles text and voice messages, transcribes voice notes via OpenAI Whisper, and posts the brief text to the FastAPI `POST /brief` endpoint.

Replaces the WhatsApp Cloud API design with a simpler Telegram Bot API integration requiring no business account, no webhook verification handshake, and no business approval process.

---

## Architecture & Data Flow

```
[Telegram Trigger]
        │
[Sender Filter]         ──── not parent ──→ exit silently
        │ match
[Message Type Switch]
        ├── text  → [Post to /brief]
        └── voice → [Get File Path] → [Download File Binary] → [Whisper Transcribe] → [Post to /brief]
```

### Nodes

1. **Telegram Trigger** — n8n native Telegram Trigger node. Connects to the bot via long polling. No public URL or webhook registration required. Fires on every incoming message and outputs a clean `message` object. Non-message events (joins, leaves, etc.) are not emitted by this node.

2. **Sender Filter** — IF node checking `{{ $json.message.chat.id }}` equals `{{ parseInt($env.PARENT_CHAT_ID) }}`. Use **Number** comparison type in the n8n IF node (not string), because `$env` variables are always strings while `chat.id` from Telegram is an integer. Exits silently if no match.

3. **Message Type Switch** — Switch node routing on message content:
   - `message.text` exists → text path (output 0)
   - `message.voice` exists → voice path (output 1)
   - Anything else (photo, sticker, document, etc.) → fallback `none`, exits cleanly.

4. **Post to /brief** (text path) — HTTP Request node:
   - Method: `POST`
   - URL: `={{ $env.BACKEND_URL }}/brief`
   - Body (JSON): `{ "text": "{{ $json.message.text }}" }`

5. **Get File Path** — HTTP Request node (first step of Telegram's two-step voice download):
   - Method: `GET`
   - URL: `=https://api.telegram.org/bot{{ $credentials.telegramApi.accessToken }}/getFile?file_id={{ $json.message.voice.file_id }}`
   - Returns JSON: `{ "result": { "file_path": "voice/file_123.oga" } }`

6. **Download File Binary** — HTTP Request node (second step):
   - Method: `GET`
   - URL: `=https://api.telegram.org/file/bot{{ $credentials.telegramApi.accessToken }}/{{ $json.result.file_path }}`
   - Response format: **Binary** (saves to buffer for upload)

7. **Whisper Transcribe** — HTTP Request node:
   - Method: `POST`
   - URL: `https://api.openai.com/v1/audio/transcriptions`
   - Content-Type: `multipart/form-data`
   - Form fields:
     - `file`: binary from previous node, filename `voice.oga`, MIME type `audio/ogg`
     - `model`: `whisper-1`
   - Auth: **OpenAI** n8n Credential (Header Auth type with `Authorization: Bearer <key>`). The Whisper node is a generic HTTP Request node, so it cannot use n8n's built-in OpenAI credential type — a raw Header Auth credential is required here.
   - Returns JSON: `{"text": "..."}`

8. **Post to /brief** (voice path) — HTTP Request node:
   - Method: `POST`
   - URL: `={{ $env.BACKEND_URL }}/brief`
   - Body (JSON): `{ "text": "{{ $node["Whisper Transcribe"].json.text }}" }`

All logic lives in a single exportable file: `n8n/telegram-brief.json`.

---

## Configuration & Credentials

### n8n Credentials

| Credential name | Type | Notes |
|---|---|---|
| `Telegram Bot` | Telegram API | Bot token from @BotFather. Used by the Telegram Trigger node and referenced in URL expressions for file download. |
| `OpenAI` | Header Auth | Header name: `Authorization`, value: `Bearer <openai-api-key>`. Used by the Whisper Transcribe node. A raw Header Auth is used because the Whisper node is a generic HTTP Request node. |

### n8n Environment Variables

| Variable | Type | Description |
|---|---|---|
| `PARENT_CHAT_ID` | String (parsed as integer at runtime) | Parent's Telegram chat ID with the bot (e.g. `"123456789"`). Find by messaging the bot then calling `https://api.telegram.org/bot<token>/getUpdates` and reading `result[0].message.chat.id`. |
| `BACKEND_URL` | String | Backend base URL (e.g. `http://backend:8000` for Docker Compose) |

### Bot Setup (one-time, ~2 minutes)

1. Message **@BotFather** → `/newbot` → follow prompts → receive bot token
2. Message your new bot once to create the chat
3. Call `https://api.telegram.org/bot<token>/getUpdates` to find your `chat.id`
4. Set `PARENT_CHAT_ID` to that integer value (as a string in the env block)

No Meta dashboard, no webhook registration, no business verification required.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Message from unknown sender | Sender Filter exits silently — no error |
| Unsupported message type (photo, sticker, document, etc.) | Switch fallback exits cleanly |
| `/brief` call failure (text path) | Execution marked failed; brief not stored; parent resends |
| Get File Path failure | Execution marked failed; parent resends voice note |
| Download File Binary failure | Execution marked failed; parent resends voice note |
| Whisper transcription failure | Execution marked failed; parent resends voice note |
| `/brief` call failure (voice path) | Execution marked failed; brief not stored; parent resends |

No automatic retries. The workflow is idempotent — duplicate rows in Supabase are acceptable. Manual resend is the recovery path.

No guard node is needed for non-message events: the Telegram Trigger native node only emits actual message events, not delivery receipts or status updates.

---

## Files Produced

- **`n8n/telegram-brief.json`** — Importable n8n workflow with all nodes, credentials referenced by name.
- **`n8n/README.md`** — Replaces the previous WhatsApp README. Covers bot creation, finding `PARENT_CHAT_ID`, Docker Compose env var configuration, n8n credential setup, workflow import and activation, local test steps, and end-to-end verification.
- **`n8n/whatsapp-brief.json`** — Delete this file as part of this task. It is superseded by `telegram-brief.json`.

---

## Testing

**Local (text path):**
In the n8n editor, click "Test step" on the Telegram Trigger node, then send a real text message from the parent's Telegram account to the bot. Step through Sender Filter, Switch, and Post to /brief nodes visually. Verify the row appears in Supabase.

**Local (voice path — limited):**
The voice path requires a live bot token and real voice file ID. There is no mock path for the download steps. To verify routing only: send a real voice note to the bot in test mode — the workflow will route correctly through Get File Path and fail at the download step if credentials aren't configured. Full voice path verification requires an activated workflow with real credentials.

**End-to-end:**
Activate the workflow, send a text message → verify row in Supabase `briefs` table. Send a voice note → verify transcribed text in the table.

---

## Out of Scope

- Automated tests for the n8n workflow
- Support for message types beyond text and voice
- Retry logic or dead-letter queuing
- Changes to the FastAPI backend
- Keeping the WhatsApp workflow active alongside Telegram
