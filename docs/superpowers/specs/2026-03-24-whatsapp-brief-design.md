# WhatsApp → /brief Integration Design

**Date:** 2026-03-24
**Status:** Approved

## Overview

A single n8n workflow that receives WhatsApp messages from the parent, filters by sender, handles both text and voice messages, transcribes voice notes via OpenAI Whisper, and posts the brief text to the FastAPI `POST /brief` endpoint.

---

## Architecture & Data Flow

```
[WhatsApp Trigger] → [Sender Filter] → [Message Type Switch]
                                              ├── text  → [Post to /brief]
                                              └── voice → [Download Media] → [Whisper Transcribe] → [Post to /brief]
```

### Nodes

1. **WhatsApp Trigger** — Webhook node handling both Meta's GET verification handshake (`hub.challenge` response) and incoming POST message events.
2. **Sender Filter** — IF node checking `entry[0].changes[0].value.messages[0].from` equals the configured parent phone number. Exits silently if no match.
3. **Message Type Switch** — Switch node on `messages[0].type`: routes `"text"` to the text path, `"audio"` to the voice path.
4. **Post to /brief** (text path) — HTTP Request: `POST {{BACKEND_URL}}/brief` with `{"text": "{{message.text.body}}"}`.
5. **Download Media** — HTTP Request to Meta Graph API to fetch the voice note binary using the media ID and bearer token.
6. **Whisper Transcribe** — HTTP Request: `POST https://api.openai.com/v1/audio/transcriptions` with audio binary and `model: whisper-1`.
7. **Post to /brief** (voice path) — HTTP Request: `POST {{BACKEND_URL}}/brief` with `{"text": "{{transcription.text}}"}`.

All logic lives in a single exportable file: `n8n/whatsapp-brief.json`.

---

## Configuration & Credentials

All sensitive values are stored as n8n environment variables or credentials — never hardcoded in the workflow JSON. The JSON is safe to commit.

| Variable | Description |
|---|---|
| `WHATSAPP_TOKEN` | Meta Cloud API bearer token (webhook verification + media download) |
| `WHATSAPP_VERIFY_TOKEN` | Secret string chosen by operator; Meta uses it to verify the webhook URL |
| `PARENT_PHONE_NUMBER` | Parent's WhatsApp number in E.164 format without `+` (e.g. `15551234567`) |
| `OPENAI_API_KEY` | OpenAI API key for Whisper transcription |
| `BACKEND_URL` | Backend base URL (e.g. `http://backend:8000` for Docker, or public URL) |

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Message from unknown sender | Exits silently at Sender Filter — no error, no log |
| Unsupported message type (image, sticker, etc.) | Switch default branch exits cleanly |
| Media download failure | Execution marked failed; parent resends voice note |
| Whisper transcription failure | Execution marked failed; parent resends voice note |
| `/brief` call failure | Execution marked failed; brief not stored; parent resends |

No automatic retries. The workflow is idempotent — duplicate briefs in Supabase are acceptable. Manual resend is the recovery path.

---

## Files Produced

- `n8n/whatsapp-brief.json` — Importable n8n workflow
- `n8n/README.md` — Setup instructions: import steps, credential configuration, Meta webhook registration, and sample curl payloads for local testing

---

## Testing

**Local (no Meta account needed):**
Use n8n's "Test Webhook" URL and `curl` sample payloads (text and voice) documented in `n8n/README.md` to step through the workflow in the n8n editor.

**End-to-end:**
Deploy with a public URL, register with Meta, use the WhatsApp Cloud API dashboard test tool to send a real message, and verify the brief appears in the Supabase `briefs` table.

**Backend `/brief`:**
Already independently testable via `curl` — no changes to the FastAPI backend required.

---

## Out of Scope

- Automated tests for the n8n workflow (it is configuration, not code)
- Support for message types beyond text and audio
- Retry logic or dead-letter queuing
- Changes to the FastAPI backend
