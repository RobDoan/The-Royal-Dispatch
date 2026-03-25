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
