# Telegram Commands: /register and /add-child

> **SUPERSEDED (2026-04-15).** This design — parameterized `/register <name>` + separate `/add-child` command — was replaced before implementation by the onboarding-flow design, which uses a stateless `/register` command that returns a signed web onboarding URL. See [`2026-04-15-onboarding-flow-design.md`](./2026-04-15-onboarding-flow-design.md) for the authoritative current design. Kept here for historical context only.

## Overview

Add two Telegram bot commands implemented as n8n workflow branches. These let parents self-register and add children with character preferences, without needing the admin UI.

## Commands

### `/register <name>`

**Purpose:** Register the sender as a parent user.

**Flow:**
1. Parse name from message text (everything after `/register`)
2. Check if `chat_id` already exists via `GET /user/by-chat-id?chat_id=<chat_id>`
   - If 200: respond "You're already registered"
   - If 404: proceed
3. Call `POST /admin/users` with `{name, telegram_chat_id: chat_id}`
4. Respond with welcome message + instructions for `/add-child`

**Response template:**
```
Welcome, <name>! You're registered.

Now add your child with their favorite characters:
/add-child <child_name> <character1,character2,...>

Available characters: Elsa, Belle, Cinderella, Ariel, Rapunzel, Moana, Raya, Mirabel, Chase, Marshall, Skye, Rubble
```

**Edge cases:**
- No name provided: "Usage: `/register <your name>`"
- Name with spaces supported (e.g., `/register John Doe`)
- Already registered: "You're already registered"

### `/add-child <name> [character1,character2,...]`

**Purpose:** Create a child linked to the registered parent, with optional character preferences.

**Flow:**
1. Check sender is registered via `GET /user/by-chat-id?chat_id=<chat_id>`
   - If 404: respond "Please /register first"
2. Parse child name (first argument after `/add-child`) and optional comma-separated character list (second argument)
3. Fetch available personas via `GET /admin/personas`
4. Validate each provided character against persona list (case-insensitive match)
   - Split into valid and invalid lists
   - If no characters provided: pick 3 random characters from available personas
5. Create child via `POST /admin/children` with `{name, timezone: "America/Los_Angeles"}`
   - On duplicate name conflict (409/error): respond "You already have a child named <name>"
6. Link child to user via `POST /admin/children/{child_id}/users` with `{user_id}`
7. Store preferences via `PUT /admin/children/{child_id}/preferences` with `{"characters": [<valid character names>]}`
8. Respond with confirmation

**Response template (with characters provided, some invalid):**
```
<child_name> has been added with characters: Elsa, Belle, Moana.

We haven't supported Elza, Olaf yet.
```

**Response template (with all characters valid):**
```
<child_name> has been added with characters: Elsa, Belle, Moana.
```

**Response template (no characters provided):**
```
<child_name> has been added! I picked some characters for now: Chase, Elsa, Mirabel.

Contact <parent_name> to change them later.
```

**Edge cases:**
- Not registered: "Please /register first"
- No arguments: "Usage: `/add-child <child_name> [character1,character2,...]`"
- Duplicate child name: "You already have a child named <name>"
- All characters invalid: assign random characters, list all as unsupported

## Implementation

### Approach: n8n workflow branches

Both commands are added as branches in the existing `telegram-brief.json` workflow. The Telegram Trigger already receives all messages. A new Switch node routes based on whether the message starts with `/register` or `/add-child`.

### Workflow structure

```
Telegram Trigger
  → Command Router (Switch node: /register, /add-child, default)
    → /register branch:
        → Parse name from message
        → Check existing user (GET /user/by-chat-id)
        → IF exists: send "already registered"
        → ELSE: Create user (POST /admin/users) → send welcome + instructions
    → /add-child branch:
        → Check user registered (GET /user/by-chat-id)
        → IF not registered: send "please register first"
        → ELSE:
          → Parse child name + characters from message
          → Fetch personas (GET /admin/personas)
          → Validate characters (Code node: split valid/invalid, random fallback)
          → Create child (POST /admin/children)
          → Link to user (POST /admin/children/{id}/users)
          → Set preferences (PUT /admin/children/{id}/preferences)
          → Send confirmation
    → default: existing brief flow (unchanged)
```

### Backend changes

None required. All needed endpoints already exist in the admin and user routes.

### Data storage

Character preferences stored in `children.preferences` JSONB column:
```json
{"characters": ["elsa", "belle", "moana"]}
```

Character names stored lowercase to match persona YAML filenames.
