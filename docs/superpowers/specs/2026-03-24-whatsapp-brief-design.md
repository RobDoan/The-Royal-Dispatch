# WhatsApp → /brief Integration Design

**Date:** 2026-03-24
**Status:** Approved

## Overview

A single n8n workflow that receives WhatsApp messages from the parent, filters by sender, handles both text and voice messages, transcribes voice notes via OpenAI Whisper, and posts the brief text to the FastAPI `POST /brief` endpoint.

---

## Architecture & Data Flow

```
[WhatsApp Trigger]
        │
        ├── GET (verification)  → [Respond to Webhook] (echo hub.challenge)
        │
        └── POST (message event)
                │
        [Guard: has messages?]  ──── no (status update) ──→ exit silently
                │ yes
        [Sender Filter]         ──── not parent ──────────→ exit silently
                │ match
        [Message Type Switch]
                ├── text  → [Post to /brief]
                └── audio → [Fetch Media URL] → [Download Media Binary] → [Whisper Transcribe] → [Post to /brief]
```

### Nodes

1. **WhatsApp Trigger** — n8n Webhook node registered at a fixed path (e.g. `/webhook/whatsapp`). Handles two HTTP methods:
   - **GET** (Meta verification handshake): reads `hub.verify_token` from query params and compares it to `WHATSAPP_VERIFY_TOKEN`. If they **match**, a **Respond to Webhook** node echoes back the raw string value of `hub.challenge` as `text/plain` (not `application/json`) with HTTP 200. The workflow exits here. If they **do not match**, a Respond to Webhook node returns HTTP 403 with body `"Forbidden"`. This prevents any caller from using n8n to echo arbitrary challenges.
   - **POST** (incoming message events): passes the payload body downstream.

2. **Guard: has messages?** — IF node checking that `entry[0].changes[0].value.messages` exists and is non-empty. Meta also sends delivery receipts and read-receipt status updates via POST to the same webhook URL; those payloads have no `messages` key. If the guard fails, the workflow exits silently.

3. **Sender Filter** — IF node checking `{{ $json.entry[0].changes[0].value.messages[0].from }}` equals `PARENT_PHONE_NUMBER`. Exits silently if no match.

4. **Message Type Switch** — Switch node on `{{ $json.entry[0].changes[0].value.messages[0].type }}`: routes `"text"` to the text path, `"audio"` to the voice path.

5. **Post to /brief** (text path) — HTTP Request node:
   - Method: `POST`
   - URL: `{{ $env.BACKEND_URL }}/brief`
   - Body (JSON): `{"text": "{{ $json.entry[0].changes[0].value.messages[0].text.body }}"}`

6. **Fetch Media URL** — HTTP Request node (first step of Meta's two-step media download):
   - Method: `GET`
   - URL: `https://graph.facebook.com/v18.0/{{ $json.entry[0].changes[0].value.messages[0].audio.id }}` (Graph API version pinned to `v18.0`; update if Meta deprecates this version)
   - Header: `Authorization: Bearer` — use the **WhatsApp Cloud API** n8n credential (credential type: Header Auth), not a raw `$env` expression.
   - Returns JSON with a temporary `url` field.

7. **Download Media Binary** — HTTP Request node (second step):
   - Method: `GET`
   - URL: `{{ $node["Fetch Media URL"].json["url"] }}`
   - Auth: use the **WhatsApp Cloud API** n8n Credential (same as Node 6).
   - Response format: **Binary** (saves to a buffer for upload).

8. **Whisper Transcribe** — HTTP Request node:
   - Method: `POST`
   - URL: `https://api.openai.com/v1/audio/transcriptions`
   - Content-Type: `multipart/form-data`
   - Form fields:
     - `file`: binary data from previous node, filename `audio.ogg`, MIME type `audio/ogg`
     - `model`: `whisper-1`
   - Header: `Authorization: Bearer {{ $env.OPENAI_API_KEY }}`
   - Returns JSON: `{"text": "..."}`.

9. **Post to /brief** (voice path) — HTTP Request node:
   - Method: `POST`
   - URL: `{{ $env.BACKEND_URL }}/brief`
   - Body (JSON): `{"text": "{{ $node["Whisper Transcribe"].json["text"] }}"}`

All logic lives in a single exportable file: `n8n/whatsapp-brief.json`.

---

## Configuration & Credentials

All sensitive values are stored as n8n **Credentials** or **environment variables** — never hardcoded in the workflow JSON. The JSON is safe to commit.

**n8n Credentials** (configured via Settings → Credentials in the n8n UI; referenced by credential name in each node's credential picker):

| Credential name | Type | Value |
|---|---|---|
| `WhatsApp Cloud API` | Header Auth | `Authorization: Bearer <System User token>` — long-lived System User token from Meta Business Manager. Do not use the app secret or a short-lived page token. Used in Fetch Media URL and Download Media Binary nodes. |
| `OpenAI` | Header Auth | `Authorization: Bearer <OPENAI_API_KEY>` — used in the Whisper Transcribe node. |

**n8n Environment Variables** (set in n8n's environment or Docker Compose `environment` block; accessed via `{{ $env.VAR_NAME }}` in expressions):

| Variable | Description |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | A secret string chosen by the operator; entered in both n8n and the Meta App Dashboard. Meta sends it on GET to prove ownership of the webhook URL. |
| `PARENT_PHONE_NUMBER` | Parent's WhatsApp number in E.164 format without `+` (e.g. `15551234567`). Must match exactly what Meta sends in `messages[0].from`. |
| `BACKEND_URL` | Backend base URL (e.g. `http://backend:8000` for Docker Compose, or public URL in production). |

> **Meta App Dashboard steps:** After importing the workflow, register the n8n webhook URL under WhatsApp → Configuration → Webhook, entering your `WHATSAPP_VERIFY_TOKEN` as the verify token. Then subscribe the webhook to the **`messages`** field. Without this subscription, Meta will not forward incoming message events.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Meta GET verification request | Guard passes `hub.verify_token`, echoes `hub.challenge`, exits. |
| Status update / delivery receipt (no `messages` key) | Guard node exits silently — no error. |
| Message from unknown sender | Sender Filter exits silently — no error. |
| Unsupported message type (image, sticker, reaction, etc.) | Switch default branch exits cleanly. |
| Fetch Media URL failure | Execution marked failed; parent resends voice note. |
| Download Media Binary failure | Execution marked failed; parent resends voice note. |
| Whisper transcription failure | Execution marked failed; parent resends voice note. |
| `/brief` call failure | Execution marked failed; brief not stored; parent resends. |

No automatic retries. The workflow is idempotent — duplicate briefs in Supabase are acceptable. Manual resend is the recovery path.

---

## Files Produced

- **`n8n/whatsapp-brief.json`** — Importable n8n workflow containing all nodes described above, with credentials referenced by name (not embedded).
- **`n8n/README.md`** — Setup instructions covering:
  - How to import the workflow into n8n
  - How to configure each credential/environment variable
  - How to register the webhook URL with Meta (including setting `WHATSAPP_VERIFY_TOKEN` in the Meta App Dashboard)
  - How to subscribe the webhook to the `messages` field
  - Sample `curl` payloads for local testing (text message and voice note)

---

## Testing

**Local (no Meta account needed):**
Use n8n's "Test Webhook" URL and `curl` sample payloads (text and voice) documented in `n8n/README.md` to step through the workflow node-by-node in the n8n editor. The Download Media and Whisper nodes will fail with a mock payload, but routing logic can be fully verified.

**End-to-end:**
Deploy with a public URL, register the webhook with Meta (subscribe to `messages`), use the WhatsApp Cloud API dashboard test tool to send a real message, and verify the brief appears in the Supabase `briefs` table.

**Backend `/brief`:**
Already independently testable via `curl` — no changes to the FastAPI backend required.

---

## Out of Scope

- Automated tests for the n8n workflow (it is configuration, not code)
- Support for message types beyond text and audio
- Retry logic or dead-letter queuing
- Changes to the FastAPI backend
