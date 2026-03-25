# WhatsApp → /brief Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an n8n workflow that receives WhatsApp messages (text and voice) from the parent, filters by sender, transcribes voice notes via Whisper, and posts the brief text to `POST /brief`.

**Architecture:** A single n8n workflow JSON (`n8n/whatsapp-brief.json`) with two webhook trigger branches — one for Meta's GET verification handshake and one for POST message events. The POST branch guards against non-message events, filters by sender, then routes text directly to `/brief` and voice through a two-step Meta media download + Whisper transcription before posting.

**Tech Stack:** n8n 1.x, WhatsApp Cloud API (Meta Graph API v18.0), OpenAI Whisper (`whisper-1`), FastAPI `/brief` endpoint (already exists).

**Spec:** `docs/superpowers/specs/2026-03-24-whatsapp-brief-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `n8n/whatsapp-brief.json` | Create | Complete importable n8n workflow |
| `n8n/README.md` | Create | Setup instructions, credential config, curl test payloads |

No backend changes required — `POST /brief` already exists.

---

## Task 1: Create `n8n/whatsapp-brief.json`

**Files:**
- Create: `n8n/whatsapp-brief.json`

The workflow has two independent trigger paths sharing no nodes:

```
GET /webhook/whatsapp  →  Token Matches? → [200 Challenge | 403 Forbidden]

POST /webhook/whatsapp →  Guard: Has Messages?
                               └─ yes → Sender Filter
                                          └─ match → Message Type Switch
                                                        ├─ text  → Post Brief (text)
                                                        └─ audio → Fetch Media URL
                                                                   → Download Media Binary
                                                                   → Whisper Transcribe
                                                                   → Post Brief (voice)
```

**Node reference — expression paths:**

In n8n Webhook nodes (typeVersion 2), the raw request is wrapped:
- POST body: `$json.body.entry[0]...`
- GET query params: `$json.query['hub.verify_token']`

When referencing a prior node by name from a downstream node: `$('Node Name').first().json.body...`

- [ ] **Step 1: Create the `n8n/` directory and write the workflow JSON**

```bash
mkdir -p /path/to/the-royal-dispatch/n8n
```

Create `n8n/whatsapp-brief.json` with the following content. Credential `id` values (`"whatsapp-cred-id"`, `"openai-cred-id"`) are placeholders — n8n replaces them with real IDs when you map credentials during import.

```json
{
  "name": "WhatsApp Brief",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "GET",
        "path": "whatsapp",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "node-get-webhook",
      "name": "WhatsApp GET",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 160],
      "webhookId": "royal-dispatch-whatsapp-get"
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true },
          "conditions": [
            {
              "leftValue": "={{ $json.query['hub.verify_token'] }}",
              "rightValue": "={{ $env.WHATSAPP_VERIFY_TOKEN }}",
              "operator": { "type": "string", "operation": "equals" }
            }
          ]
        }
      },
      "id": "node-token-check",
      "name": "Token Matches?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [460, 160]
    },
    {
      "parameters": {
        "options": {
          "responseCode": 200,
          "responseHeaders": {
            "entries": [{ "name": "Content-Type", "value": "text/plain" }]
          },
          "responseBody": "={{ $('WhatsApp GET').first().json.query['hub.challenge'] }}"
        }
      },
      "id": "node-respond-200",
      "name": "Respond 200 Challenge",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [680, 80]
    },
    {
      "parameters": {
        "options": {
          "responseCode": 403,
          "responseHeaders": {
            "entries": [{ "name": "Content-Type", "value": "text/plain" }]
          },
          "responseBody": "Forbidden"
        }
      },
      "id": "node-respond-403",
      "name": "Respond 403 Forbidden",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [680, 240]
    },
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "whatsapp",
        "responseMode": "onReceived",
        "options": {}
      },
      "id": "node-post-webhook",
      "name": "WhatsApp POST",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 440],
      "webhookId": "royal-dispatch-whatsapp-post"
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true },
          "conditions": [
            {
              "leftValue": "={{ !!$json.body?.entry?.[0]?.changes?.[0]?.value?.messages?.length }}",
              "rightValue": true,
              "operator": { "type": "boolean", "operation": "equals" }
            }
          ]
        }
      },
      "id": "node-guard",
      "name": "Guard: Has Messages?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [460, 440]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true },
          "conditions": [
            {
              "leftValue": "={{ $json.body.entry[0].changes[0].value.messages[0].from }}",
              "rightValue": "={{ $env.PARENT_PHONE_NUMBER }}",
              "operator": { "type": "string", "operation": "equals" }
            }
          ]
        }
      },
      "id": "node-sender-filter",
      "name": "Sender Filter",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [680, 440]
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
                    "leftValue": "={{ $json.body.entry[0].changes[0].value.messages[0].type }}",
                    "rightValue": "text",
                    "operator": { "type": "string", "operation": "equals" }
                  }
                ]
              },
              "outputKey": "text"
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{ $json.body.entry[0].changes[0].value.messages[0].type }}",
                    "rightValue": "audio",
                    "operator": { "type": "string", "operation": "equals" }
                  }
                ]
              },
              "outputKey": "audio"
            }
          ]
        },
        "fallbackOutput": "none"
      },
      "id": "node-type-switch",
      "name": "Message Type Switch",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [900, 440]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $env.BACKEND_URL }}/brief",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ { text: $('Sender Filter').first().json.body.entry[0].changes[0].value.messages[0].text.body } }}",
        "options": {}
      },
      "id": "node-post-brief-text",
      "name": "Post Brief (text)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1120, 360]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ 'https://graph.facebook.com/v18.0/' + $('Sender Filter').first().json.body.entry[0].changes[0].value.messages[0].audio.id }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "options": {}
      },
      "id": "node-fetch-media-url",
      "name": "Fetch Media URL",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1120, 520],
      "credentials": {
        "httpHeaderAuth": {
          "id": "whatsapp-cred-id",
          "name": "WhatsApp Cloud API"
        }
      }
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ $json.url }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "options": {
          "response": {
            "response": {
              "responseFormat": "file"
            }
          }
        }
      },
      "id": "node-download-binary",
      "name": "Download Media Binary",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1340, 520],
      "credentials": {
        "httpHeaderAuth": {
          "id": "whatsapp-cred-id",
          "name": "WhatsApp Cloud API"
        }
      }
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
                "filename": "audio.ogg",
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
      "position": [1560, 520],
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
      "position": [1780, 520]
    }
  ],
  "connections": {
    "WhatsApp GET": {
      "main": [
        [{ "node": "Token Matches?", "type": "main", "index": 0 }]
      ]
    },
    "Token Matches?": {
      "main": [
        [{ "node": "Respond 200 Challenge", "type": "main", "index": 0 }],
        [{ "node": "Respond 403 Forbidden", "type": "main", "index": 0 }]
      ]
    },
    "WhatsApp POST": {
      "main": [
        [{ "node": "Guard: Has Messages?", "type": "main", "index": 0 }]
      ]
    },
    "Guard: Has Messages?": {
      "main": [
        [{ "node": "Sender Filter", "type": "main", "index": 0 }],
        []
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
        [{ "node": "Fetch Media URL", "type": "main", "index": 0 }]
      ]
    },
    "Fetch Media URL": {
      "main": [
        [{ "node": "Download Media Binary", "type": "main", "index": 0 }]
      ]
    },
    "Download Media Binary": {
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
  "id": "royal-dispatch-whatsapp-brief",
  "tags": []
}
```

> **Note on n8n version compatibility:** This JSON targets n8n 1.x. If import fails on a specific node, open that node in the n8n editor and re-configure the highlighted fields manually using the values in the spec. The node names and connection structure are the ground truth.

- [ ] **Step 2: Verify JSON is valid**

```bash
cd /path/to/the-royal-dispatch
python3 -c "import json; json.load(open('n8n/whatsapp-brief.json')); print('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add n8n/whatsapp-brief.json
git commit -m "feat: add n8n WhatsApp → /brief workflow"
```

---

## Task 2: Create `n8n/README.md`

**Files:**
- Create: `n8n/README.md`

- [ ] **Step 1: Write the README**

Create `n8n/README.md`:

````markdown
# n8n WhatsApp → /brief Workflow

Receives WhatsApp messages from the parent, transcribes voice notes via Whisper, and posts the brief text to `POST /brief`.

---

## Prerequisites

- n8n 1.x (self-hosted or cloud)
- A Meta WhatsApp Cloud API app with a phone number
- An OpenAI API key (for Whisper)
- The Royal Dispatch backend running and accessible

---

## 1. Add n8n to Docker Compose (if self-hosting)

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
      - WHATSAPP_VERIFY_TOKEN=your-secret-verify-token
      - PARENT_PHONE_NUMBER=15551234567
      - BACKEND_URL=http://backend:8000
    volumes:
      - n8n_data:/home/node/.n8n
    restart: unless-stopped
    depends_on:
      - backend

volumes:
  n8n_data:
```

Replace `WHATSAPP_VERIFY_TOKEN` with a secret string you choose, `PARENT_PHONE_NUMBER` with the parent's WhatsApp number in E.164 format (no `+`), and `BACKEND_URL` with the backend URL (use the Docker service name if on the same network).

---

## 2. Configure n8n Credentials

Open the n8n UI at `http://localhost:5678`. Go to **Settings → Credentials → Add Credential**.

### WhatsApp Cloud API

- Type: **Header Auth**
- Name: `WhatsApp Cloud API`
- Name (header): `Authorization`
- Value: `Bearer <your-system-user-token>`

Get the System User token from **Meta Business Manager → System Users**. Use a long-lived token, not a page token.

### OpenAI

- Type: **Header Auth**
- Name: `OpenAI`
- Name (header): `Authorization`
- Value: `Bearer <your-openai-api-key>`

---

## 3. Import the Workflow

1. In n8n, go to **Workflows → Import from File**
2. Select `n8n/whatsapp-brief.json`
3. After import, open each HTTP Request node that requires credentials and select the matching credential from the dropdown:
   - `Fetch Media URL` → **WhatsApp Cloud API**
   - `Download Media Binary` → **WhatsApp Cloud API**
   - `Whisper Transcribe` → **OpenAI**
   > **Note:** Both credential types are "Header Auth" in n8n, so the picker shows both options. Make sure to assign the correct one to each node — assigning the WhatsApp credential to Whisper (or vice versa) will cause silent auth failures.
4. **Activate** the workflow using the toggle in the top-right

---

## 4. Register the Webhook with Meta

After activating the workflow (toggle must be **ON**, not in test mode), n8n will display the production webhook URL:

```
https://your-n8n-host/webhook/whatsapp
```

> **HTTPS required:** Meta only accepts HTTPS webhook URLs. For local development, use a tunnel such as ngrok (`ngrok http 5678`) to get a public HTTPS URL. An `http://` URL will be rejected.

In the **Meta App Dashboard**:
1. Go to **WhatsApp → Configuration → Webhook**
2. Click **Edit** and enter:
   - **Callback URL:** `https://your-n8n-host/webhook/whatsapp`
   - **Verify Token:** the value of `WHATSAPP_VERIFY_TOKEN` you set in step 1
3. Click **Verify and Save** — Meta sends a GET request; n8n responds with the challenge
4. Under **Webhook Fields**, click **Subscribe** next to **`messages`**

Without the `messages` subscription, Meta will not forward incoming message events.

> **Important:** The workflow must remain **active** for the production webhook URL to stay live. If you deactivate the workflow, Meta's POST events will receive connection errors.

---

## 5. Test Locally (Without Meta)

Use n8n's **Test Webhook** URL (shown when the workflow is open in the editor and not yet active) to send payloads directly.

### Test: GET verification handshake

`hub.mode=subscribe` is required by Meta — do not omit it.

```bash
curl -G "http://localhost:5678/webhook-test/whatsapp" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=your-secret-verify-token" \
  --data-urlencode "hub.challenge=test_challenge_string"
```

Expected response: `test_challenge_string` (plain text, HTTP 200)

### Test: Wrong verify token → 403

```bash
curl -G "http://localhost:5678/webhook-test/whatsapp" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=wrong-token" \
  --data-urlencode "hub.challenge=test_challenge_string"
```

Expected response: `Forbidden` (HTTP 403)

### Test: Text message from parent

Replace `15551234567` with your `PARENT_PHONE_NUMBER` value.

```bash
curl -X POST "http://localhost:5678/webhook-test/whatsapp" \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "15551234567",
            "type": "text",
            "text": { "body": "She shared her blocks today but did not want to brush her teeth." }
          }]
        }
      }]
    }]
  }'
```

Expected: Workflow executes through to "Post Brief (text)", brief appears in Supabase `briefs` table.

### Test: Status update (should exit silently)

```bash
curl -X POST "http://localhost:5678/webhook-test/whatsapp" \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "statuses": [{ "status": "delivered" }]
        }
      }]
    }]
  }'
```

Expected: Workflow exits at "Guard: Has Messages?" with no error.

### Test: Message from unknown sender (should exit silently)

```bash
curl -X POST "http://localhost:5678/webhook-test/whatsapp" \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "19999999999",
            "type": "text",
            "text": { "body": "Who is this?" }
          }]
        }
      }]
    }]
  }'
```

Expected: Workflow exits at "Sender Filter" with no error.

### Test: Voice note (routing only — Fetch Media URL will fail without real credentials)

```bash
curl -X POST "http://localhost:5678/webhook-test/whatsapp" \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "15551234567",
            "type": "audio",
            "audio": { "id": "fake-media-id-123" }
          }]
        }
      }]
    }]
  }'
```

Expected: Workflow routes to "Fetch Media URL" and fails there (real media ID required for full success). Routing logic is verified.

---

## 6. End-to-End Verification

1. Deploy n8n with a public URL (e.g. via ngrok for local testing, or a VPS)
2. Register the webhook with Meta (step 4 above)
3. Send a real WhatsApp text message from the parent's phone
4. Check the Supabase `briefs` table — a new row should appear with today's date and the message text
5. Send a real voice note — the row should appear with the Whisper transcription
````

- [ ] **Step 2: Commit**

```bash
git add n8n/README.md
git commit -m "docs: add n8n workflow setup README"
```

---

## Task 3: Manual Verification Checklist

No automated tests for n8n workflows. Run through these manually after import.

- [ ] **Step 1: Import workflow and map credentials**

Import `n8n/whatsapp-brief.json` into n8n. Open each node listed below and confirm the credential is selected:
- `Fetch Media URL` → `WhatsApp Cloud API`
- `Download Media Binary` → `WhatsApp Cloud API`
- `Whisper Transcribe` → `OpenAI`

- [ ] **Step 2: Run GET verification test**

```bash
curl -G "http://localhost:5678/webhook-test/whatsapp" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=$WHATSAPP_VERIFY_TOKEN" \
  --data-urlencode "hub.challenge=abc123"
```

Expected: `abc123` (plain text, status 200). In n8n execution history: only "Respond 200 Challenge" executed.

- [ ] **Step 3: Run wrong token test**

```bash
curl -G "http://localhost:5678/webhook-test/whatsapp" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=wrong" \
  --data-urlencode "hub.challenge=abc123"
```

Expected: `Forbidden` (status 403). In execution history: only "Respond 403 Forbidden" executed.

- [ ] **Step 4: Run status update test**

Send the status update payload from the README. Expected: execution stops at "Guard: Has Messages?" (false branch), no error in n8n.

- [ ] **Step 5: Run unknown sender test**

Send the unknown sender payload from the README. Expected: execution stops at "Sender Filter" (false branch), no error in n8n.

- [ ] **Step 6: Run unsupported message type test (e.g. image)**

```bash
curl -X POST "http://localhost:5678/webhook-test/whatsapp" \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\": [{
      \"changes\": [{
        \"value\": {
          \"messages\": [{
            \"from\": \"$PARENT_PHONE_NUMBER\",
            \"type\": \"image\",
            \"image\": { \"id\": \"fake-img-id\" }
          }]
        }
      }]
    }]
  }"
```

Expected: Workflow routes through Guard and Sender Filter, hits the Switch fallback (`fallbackOutput: "none"`), exits cleanly with no error in n8n.

- [ ] **Step 7: Run text message test**

Send the text message payload with the correct `PARENT_PHONE_NUMBER`. Expected: "Post Brief (text)" executes successfully, row appears in Supabase `briefs` table.

- [ ] **Step 8: Final commit**

```bash
git add n8n/whatsapp-brief.json n8n/README.md
git commit -m "feat: complete WhatsApp → /brief n8n integration"
```
