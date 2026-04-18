# Telegram → /brief Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WhatsApp n8n workflow with a Telegram Bot workflow that receives text and voice messages from the parent, filters by chat ID, transcribes voice via Whisper, and posts to `POST /brief`.

**Architecture:** A single n8n workflow (`n8n/telegram-brief.json`) using the native Telegram Trigger node. The POST path splits on message type — text goes directly to `/brief`, voice goes through a two-step Telegram file download then Whisper transcription before posting. The bot token is stored as both an n8n Telegram API credential (for the trigger) and as `TELEGRAM_BOT_TOKEN` env var (for the file download URL expressions, since those are plain HTTP Request nodes without credentials assigned).

**Tech Stack:** n8n 1.x, Telegram Bot API, OpenAI Whisper (`whisper-1`), FastAPI `/brief` (unchanged).

**Spec:** `docs/superpowers/specs/2026-03-25-telegram-brief-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `n8n/telegram-brief.json` | Create | Complete importable n8n workflow (8 nodes) |
| `n8n/README.md` | Replace | Telegram setup instructions (replaces WhatsApp README) |
| `n8n/whatsapp-brief.json` | Delete | Superseded — remove from repo |

---

## Task 1: Delete `n8n/whatsapp-brief.json` and create `n8n/telegram-brief.json`

**Files:**
- Delete: `n8n/whatsapp-brief.json`
- Create: `n8n/telegram-brief.json`

> **Implementation note on bot token:** The spec references `$credentials.telegramApi.accessToken` in the file download URL expressions. In practice, plain HTTP Request nodes (no credentials assigned) cannot access `$credentials`. Instead, `TELEGRAM_BOT_TOKEN` is added as an env var so the token is available in URL expressions as `$env.TELEGRAM_BOT_TOKEN`. The Telegram API credential is still required for the Telegram Trigger node.

- [ ] **Step 1: Delete the WhatsApp workflow file**

```bash
git rm n8n/whatsapp-brief.json
```

- [ ] **Step 2: Create `n8n/telegram-brief.json`**

Create the file with exactly this content:

```json
{
  "name": "Telegram Brief",
  "nodes": [
    {
      "parameters": {
        "updates": ["message"],
        "additionalFields": {}
      },
      "id": "node-telegram-trigger",
      "name": "Telegram Trigger",
      "type": "n8n-nodes-base.telegramTrigger",
      "typeVersion": 1.1,
      "position": [240, 300],
      "webhookId": "royal-dispatch-telegram",
      "credentials": {
        "telegramApi": {
          "id": "telegram-cred-id",
          "name": "Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true },
          "conditions": [
            {
              "leftValue": "={{ $json.message.chat.id }}",
              "rightValue": "={{ parseInt($env.PARENT_CHAT_ID) }}",
              "operator": { "type": "number", "operation": "equals" }
            }
          ]
        }
      },
      "id": "node-sender-filter",
      "name": "Sender Filter",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [460, 300]
    },
    {
      "parameters": {
        "mode": "rules",
        "rules": {
          "values": [
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{ $json.message.text }}",
                    "operator": { "type": "string", "operation": "exists" }
                  }
                ]
              },
              "outputKey": "text"
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{ $json.message.voice }}",
                    "operator": { "type": "object", "operation": "exists" }
                  }
                ]
              },
              "outputKey": "voice"
            }
          ]
        },
        "fallbackOutput": "none"
      },
      "id": "node-type-switch",
      "name": "Message Type Switch",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [680, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $env.BACKEND_URL }}/brief",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ { text: $json.message.text } }}",
        "options": {}
      },
      "id": "node-post-brief-text",
      "name": "Post Brief (text)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [900, 180]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ 'https://api.telegram.org/bot' + $env.TELEGRAM_BOT_TOKEN + '/getFile?file_id=' + $json.message.voice.file_id }}",
        "options": {}
      },
      "id": "node-get-file-path",
      "name": "Get File Path",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [900, 420]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ 'https://api.telegram.org/file/bot' + $env.TELEGRAM_BOT_TOKEN + '/' + $json.result.file_path }}",
        "options": {
          "response": {
            "response": {
              "responseFormat": "file"
            }
          }
        }
      },
      "id": "node-download-binary",
      "name": "Download File Binary",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1120, 420]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://api.openai.com/v1/audio/transcriptions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "contentType": "multipart-form-data",
        "bodyParameters": {
          "parameters": [
            {
              "parameterType": "formBinaryData",
              "name": "file",
              "inputDataFieldName": "data",
              "options": {
                "filename": "voice.oga",
                "contentType": "audio/ogg"
              }
            },
            {
              "name": "model",
              "value": "whisper-1"
            }
          ]
        },
        "options": {}
      },
      "id": "node-whisper",
      "name": "Whisper Transcribe",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1340, 420],
      "credentials": {
        "httpHeaderAuth": {
          "id": "openai-cred-id",
          "name": "OpenAI"
        }
      }
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $env.BACKEND_URL }}/brief",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ { text: $('Whisper Transcribe').first().json.text } }}",
        "options": {}
      },
      "id": "node-post-brief-voice",
      "name": "Post Brief (voice)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1560, 420]
    }
  ],
  "connections": {
    "Telegram Trigger": {
      "main": [
        [{ "node": "Sender Filter", "type": "main", "index": 0 }]
      ]
    },
    "Sender Filter": {
      "main": [
        [{ "node": "Message Type Switch", "type": "main", "index": 0 }],
        []
      ]
    },
    "Message Type Switch": {
      "main": [
        [{ "node": "Post Brief (text)", "type": "main", "index": 0 }],
        [{ "node": "Get File Path", "type": "main", "index": 0 }]
      ]
    },
    "Get File Path": {
      "main": [
        [{ "node": "Download File Binary", "type": "main", "index": 0 }]
      ]
    },
    "Download File Binary": {
      "main": [
        [{ "node": "Whisper Transcribe", "type": "main", "index": 0 }]
      ]
    },
    "Whisper Transcribe": {
      "main": [
        [{ "node": "Post Brief (voice)", "type": "main", "index": 0 }]
      ]
    }
  },
  "active": false,
  "settings": {
    "executionOrder": "v1"
  },
  "versionId": "1",
  "meta": {
    "instanceId": "royal-dispatch"
  },
  "id": "royal-dispatch-telegram-brief",
  "tags": []
}
```

- [ ] **Step 3: Verify JSON is valid**

```bash
cd /Users/quydoan/Projects/ai-agents/the-royal-dispatch
python3 -c "import json; json.load(open('n8n/telegram-brief.json')); print('valid')"
```

Expected: `valid`

- [ ] **Step 4: Commit**

```bash
git add n8n/telegram-brief.json
git commit -m "feat: add n8n Telegram → /brief workflow"
```

---

## Task 2: Replace `n8n/README.md`

**Files:**
- Replace: `n8n/README.md`

- [ ] **Step 1: Overwrite `n8n/README.md` with Telegram setup instructions**

```markdown
# n8n Telegram → /brief Workflow

Receives Telegram messages from the parent (text and voice), transcribes voice notes via Whisper, and posts the brief text to `POST /brief`.

---

## Prerequisites

- n8n 1.x (self-hosted)
- A Telegram bot token (from @BotFather — free, takes 2 minutes)
- An OpenAI API key (for Whisper transcription)
- The Royal Dispatch backend running and accessible

---

## 1. Create the Telegram Bot

1. Open Telegram and message **@BotFather**
2. Send `/newbot` and follow the prompts
3. Copy the bot token (format: `123456789:ABCdef...`)
4. **Message your new bot once** (send any text) to create the chat
5. Find your `chat.id` — call this URL in a browser, replacing `<token>`:
   ```
   https://api.telegram.org/bot<token>/getUpdates
   ```
   Look for `result[0].message.chat.id` in the response. This is your `PARENT_CHAT_ID`.

---

## 2. Add n8n to Docker Compose

Add this service to `docker-compose.yml`:

```yaml
  n8n:
    image: n8nio/n8n
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=changeme
      - TELEGRAM_BOT_TOKEN=123456789:ABCdef...
      - PARENT_CHAT_ID=123456789
      - BACKEND_URL=http://backend:8000
    volumes:
      - n8n_data:/home/node/.n8n
    restart: unless-stopped
    depends_on:
      - backend

volumes:
  n8n_data:
```

Replace the values with your actual bot token, parent chat ID, and backend URL.

> **Note:** `TELEGRAM_BOT_TOKEN` is used in the file download URL expressions inside the workflow. The same token is also stored as the `Telegram Bot` n8n credential for the trigger node — storing it in both places is required.

---

## 3. Configure n8n Credentials

Open the n8n UI at `http://localhost:5678`. Go to **Settings → Credentials → Add Credential**.

### Telegram Bot

- Type: **Telegram API**
- Name: `Telegram Bot`
- Access Token: your bot token from @BotFather

### OpenAI

- Type: **Header Auth**
- Name: `OpenAI`
- Name (header): `Authorization`
- Value: `Bearer <your-openai-api-key>`

> **Note:** A raw Header Auth is used for OpenAI because the Whisper node is a generic HTTP Request node — it cannot use n8n's built-in OpenAI credential type.

---

## 4. Import and Activate the Workflow

1. In n8n, go to **Workflows → Import from File**
2. Select `n8n/telegram-brief.json`
3. After import, open the **Whisper Transcribe** node and select the **OpenAI** credential from the dropdown
4. Open the **Telegram Trigger** node and confirm the **Telegram Bot** credential is selected
5. **Activate** the workflow using the toggle in the top-right

Once active, n8n connects to Telegram via long polling — no public URL or webhook registration required.

---

## 5. Test Locally

### Test: Text message

Send a text message from the parent's Telegram account to the bot. In the n8n execution history, you should see:

- Telegram Trigger → Sender Filter (true) → Message Type Switch (text output) → Post Brief (text) ✓
- A new row should appear in the Supabase `briefs` table with the message text.

### Test: Unknown sender (should exit silently)

Send a text message from a different Telegram account. Expected: execution stops at Sender Filter (false branch) with no error.

### Test: Unsupported message type (should exit cleanly)

Send a photo or sticker from the parent's account. Expected: execution stops at Message Type Switch (fallback) with no error.

### Test: Voice note routing

Send a voice note from the parent's account. Expected: workflow routes to Get File Path. With real credentials configured, it should continue through to Post Brief (voice) and store the transcription in Supabase.

> **Note:** The voice path cannot be step-tested without a live bot token and real file ID. Full voice path verification requires the activated workflow.

---

## 6. End-to-End Verification

1. Ensure the workflow is **active**
2. Send a text message from the parent's phone → verify row appears in Supabase `briefs` table with today's date and the message text
3. Send a voice note → verify the transcribed text appears in the `briefs` table
```

- [ ] **Step 2: Commit**

```bash
git add n8n/README.md
git commit -m "docs: replace WhatsApp README with Telegram setup guide"
```

---

## Task 3: Manual Verification Checklist

No automated tests for n8n workflows. Run through these after import.

- [ ] **Step 1: Import workflow and confirm credentials**

Import `n8n/telegram-brief.json`. Confirm:
- Telegram Trigger → **Telegram Bot** credential selected
- Whisper Transcribe → **OpenAI** credential selected

- [ ] **Step 2: Activate and send a text message**

Activate the workflow. Send a text message from the parent's Telegram account to the bot. Check n8n execution history — all nodes through Post Brief (text) should show ✓. Check Supabase `briefs` table for the new row.

- [ ] **Step 3: Test unknown sender**

Send a message from a different Telegram account. Expected: stops at Sender Filter (false), no error.

- [ ] **Step 4: Test unsupported message type**

Send a photo from the parent's account. Expected: stops at Message Type Switch fallback, no error.

- [ ] **Step 5: Test voice note**

Send a voice note from the parent's account. Expected: routes through Get File Path → Download File Binary → Whisper Transcribe → Post Brief (voice). Check Supabase `briefs` table for the transcription.

- [ ] **Step 6: Final commit**

```bash
git add n8n/telegram-brief.json n8n/README.md
git commit -m "feat: complete Telegram → /brief n8n integration"
```
