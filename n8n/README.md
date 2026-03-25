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
