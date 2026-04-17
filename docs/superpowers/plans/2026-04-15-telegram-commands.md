# Telegram Commands Implementation Plan

> **SUPERSEDED (2026-04-15).** The `/register <name>` + `/add-child` workflow described here was built (commits `eb46be9`, `850cbd6`) and then replaced by the onboarding-flow: stateless `/register` → signed web URL → form submit. The Command Router and `/add-child` branch were removed in commit `44a547b`. See [`../specs/2026-04-15-onboarding-flow-design.md`](../specs/2026-04-15-onboarding-flow-design.md) and [`2026-04-15-onboarding-flow.md`](./2026-04-15-onboarding-flow.md) for the authoritative current design and plan. Kept here for historical context only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/register` and `/add-child` Telegram commands as new branches in the existing n8n workflow.

**Architecture:** Modify the existing `n8n/telegram-brief.json` workflow to add a Command Router switch node right after the Telegram Trigger. The router sends `/register` and `/add-child` messages to new branches, while all other messages continue through the existing brief flow. Each command branch uses HTTP Request nodes to call existing backend admin APIs — no backend changes needed.

**Tech Stack:** n8n workflow JSON, existing FastAPI backend endpoints

---

## File Structure

- **Modify:** `n8n/telegram-brief.json` — Add Command Router, /register branch nodes, /add-child branch nodes, rewire connections

No new files. No backend changes. All needed endpoints exist:
- `GET /user/by-chat-id?chat_id=` — check if user registered
- `POST /admin/users` — create user
- `POST /admin/children` — create child
- `POST /admin/children/{id}/users` — link child to user
- `PUT /admin/children/{id}/preferences` — set character preferences
- `GET /admin/personas` — list available characters

---

### Task 1: Add Command Router Switch Node

**Files:**
- Modify: `n8n/telegram-brief.json`

The Command Router sits between Telegram Trigger and the rest of the workflow. It routes based on whether the message text starts with `/register`, `/add-child`, or neither (default → existing brief flow).

- [ ] **Step 1: Add Command Router node to the nodes array**

Add this node to the `"nodes"` array in `telegram-brief.json`:

```json
{
  "parameters": {
    "rules": {
      "values": [
        {
          "conditions": {
            "conditions": [
              {
                "leftValue": "={{ $json.message.text }}",
                "rightValue": "/register",
                "operator": {
                  "type": "string",
                  "operation": "startsWith"
                }
              }
            ]
          },
          "renameOutput": true,
          "outputKey": "register"
        },
        {
          "conditions": {
            "conditions": [
              {
                "leftValue": "={{ $json.message.text }}",
                "rightValue": "/add-child",
                "operator": {
                  "type": "string",
                  "operation": "startsWith"
                }
              }
            ]
          },
          "renameOutput": true,
          "outputKey": "add-child"
        }
      ]
    },
    "options": {
      "fallbackOutput": "extra"
    }
  },
  "id": "cmd-router-001",
  "name": "Command Router",
  "type": "n8n-nodes-base.switch",
  "typeVersion": 3,
  "position": [-1560, 928]
}
```

- [ ] **Step 2: Rewire Telegram Trigger → Command Router → Lookup User**

Update the `"connections"` object:

1. Change `"Telegram Trigger"` connection to point to `"Command Router"` instead of `"Lookup User"`
2. Add `"Command Router"` connections with 3 outputs:
   - Output 0 (register) → `"Check Existing User"` (Task 2)
   - Output 1 (add-child) → `"Lookup User for Add Child"` (Task 3)
   - Output 2 (fallback/default) → `"Lookup User"` (existing node)

```json
"Telegram Trigger": {
  "main": [
    [
      {
        "node": "Command Router",
        "type": "main",
        "index": 0
      }
    ]
  ]
},
"Command Router": {
  "main": [
    [
      {
        "node": "Check Existing User",
        "type": "main",
        "index": 0
      }
    ],
    [
      {
        "node": "Lookup User for Add Child",
        "type": "main",
        "index": 0
      }
    ],
    [
      {
        "node": "Lookup User",
        "type": "main",
        "index": 0
      }
    ]
  ]
}
```

- [ ] **Step 3: Shift existing nodes to the right to make room**

Move existing nodes' X positions to accommodate the new Command Router at x=-1560. The Telegram Trigger stays at x=-1680. Shift `Lookup User` to x=-1340 (was -1456). Shift `Sender Filter` to x=-1130 (was -1248). Shift `Message Type Switch` to x=-900 (was -1024). Shift remaining nodes proportionally.

- [ ] **Step 4: Commit**

```bash
git add n8n/telegram-brief.json
git commit -m "feat(n8n): add Command Router for /register and /add-child"
```

---

### Task 2: Build /register Branch

**Files:**
- Modify: `n8n/telegram-brief.json`

The /register branch: parse name → check if already registered → create user OR reject → send Telegram response.

- [ ] **Step 1: Add "Check Existing User" HTTP Request node**

Checks if the chat_id is already registered. Uses `options.response.fullResponse: true` and `options.ignoreHttpStatusErrors: true` so we get the status code without n8n erroring on 404.

```json
{
  "parameters": {
    "url": "={{ $env.BACKEND_URL }}/user/by-chat-id?chat_id={{ $('Telegram Trigger').first().json.message.chat.id }}",
    "options": {
      "response": {
        "response": {
          "fullResponse": true
        }
      },
      "ignoreHttpStatusErrors": true
    }
  },
  "id": "reg-check-001",
  "name": "Check Existing User",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [-1340, 528]
}
```

- [ ] **Step 2: Add "Is Already Registered?" IF node**

```json
{
  "parameters": {
    "conditions": {
      "options": { "caseSensitive": true },
      "conditions": [
        {
          "leftValue": "={{ $json.statusCode }}",
          "rightValue": 200,
          "operator": {
            "type": "number",
            "operation": "equals"
          }
        }
      ]
    },
    "options": {}
  },
  "id": "reg-if-001",
  "name": "Is Already Registered?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2,
  "position": [-1130, 528]
}
```

- [ ] **Step 3: Add "Reply Already Registered" Telegram node (true branch)**

```json
{
  "parameters": {
    "chatId": "={{ $('Telegram Trigger').first().json.message.chat.id }}",
    "text": "You're already registered! 👋\n\nUse /add-child <name> <character1,character2,...> to add a child.",
    "additionalFields": {
      "parse_mode": "Markdown"
    }
  },
  "id": "reg-reply-exists-001",
  "name": "Reply Already Registered",
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1.2,
  "position": [-900, 428],
  "credentials": {
    "telegramApi": {
      "id": "6b9KM3MrqkX0lsLl",
      "name": "Telegram account"
    }
  }
}
```

- [ ] **Step 4: Add "Parse Register Name" Code node (false branch — not registered)**

Extracts the name from the message text. If no name provided, sets an error flag.

```json
{
  "parameters": {
    "jsCode": "const text = $('Telegram Trigger').first().json.message.text || '';\nconst parts = text.replace(/^\\/register\\s*/, '').trim();\nif (!parts) {\n  return [{ json: { error: true, message: 'Usage: /register <your name>' } }];\n}\nreturn [{ json: { error: false, name: parts } }];"
  },
  "id": "reg-parse-001",
  "name": "Parse Register Name",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [-900, 628]
}
```

- [ ] **Step 5: Add "Has Register Name?" IF node**

```json
{
  "parameters": {
    "conditions": {
      "options": { "caseSensitive": true },
      "conditions": [
        {
          "leftValue": "={{ $json.error }}",
          "rightValue": true,
          "operator": {
            "type": "boolean",
            "operation": "equals"
          }
        }
      ]
    },
    "options": {}
  },
  "id": "reg-has-name-001",
  "name": "Has Register Name?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2,
  "position": [-680, 628]
}
```

- [ ] **Step 6: Add "Reply Register Usage" Telegram node (true branch — error/no name)**

```json
{
  "parameters": {
    "chatId": "={{ $('Telegram Trigger').first().json.message.chat.id }}",
    "text": "Usage: `/register <your name>`\n\nExample: `/register John Doe`",
    "additionalFields": {
      "parse_mode": "Markdown"
    }
  },
  "id": "reg-reply-usage-001",
  "name": "Reply Register Usage",
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1.2,
  "position": [-460, 528],
  "credentials": {
    "telegramApi": {
      "id": "6b9KM3MrqkX0lsLl",
      "name": "Telegram account"
    }
  }
}
```

- [ ] **Step 7: Add "Create User" HTTP Request node (false branch — has name)**

```json
{
  "parameters": {
    "method": "POST",
    "url": "={{ $env.BACKEND_URL }}/admin/users",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ name: $('Parse Register Name').first().json.name, telegram_chat_id: $('Telegram Trigger').first().json.message.chat.id }) }}",
    "options": {}
  },
  "id": "reg-create-001",
  "name": "Create User",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [-460, 728]
}
```

- [ ] **Step 8: Add "Reply Welcome" Telegram node**

```json
{
  "parameters": {
    "chatId": "={{ $('Telegram Trigger').first().json.message.chat.id }}",
    "text": "={{ 'Welcome, ' + $('Parse Register Name').first().json.name + '! You\\'re registered. 🎉\\n\\nNow add your child with their favorite characters:\\n`/add-child <child_name> <character1,character2,...>`\\n\\nAvailable characters: Elsa, Belle, Cinderella, Ariel, Rapunzel, Moana, Raya, Mirabel, Chase, Marshall, Skye, Rubble' }}",
    "additionalFields": {
      "parse_mode": "Markdown"
    }
  },
  "id": "reg-reply-welcome-001",
  "name": "Reply Welcome",
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1.2,
  "position": [-240, 728],
  "credentials": {
    "telegramApi": {
      "id": "6b9KM3MrqkX0lsLl",
      "name": "Telegram account"
    }
  }
}
```

- [ ] **Step 9: Wire all /register branch connections**

Add to `"connections"`:

```json
"Check Existing User": {
  "main": [[{ "node": "Is Already Registered?", "type": "main", "index": 0 }]]
},
"Is Already Registered?": {
  "main": [
    [{ "node": "Reply Already Registered", "type": "main", "index": 0 }],
    [{ "node": "Parse Register Name", "type": "main", "index": 0 }]
  ]
},
"Parse Register Name": {
  "main": [[{ "node": "Has Register Name?", "type": "main", "index": 0 }]]
},
"Has Register Name?": {
  "main": [
    [{ "node": "Reply Register Usage", "type": "main", "index": 0 }],
    [{ "node": "Create User", "type": "main", "index": 0 }]
  ]
},
"Create User": {
  "main": [[{ "node": "Reply Welcome", "type": "main", "index": 0 }]]
}
```

- [ ] **Step 10: Commit**

```bash
git add n8n/telegram-brief.json
git commit -m "feat(n8n): add /register command branch"
```

---

### Task 3: Build /add-child Branch

**Files:**
- Modify: `n8n/telegram-brief.json`

The /add-child branch: check registered → parse args → fetch personas → validate characters → create child → link → set preferences → respond.

- [ ] **Step 1: Add "Lookup User for Add Child" HTTP Request node**

```json
{
  "parameters": {
    "url": "={{ $env.BACKEND_URL }}/user/by-chat-id?chat_id={{ $('Telegram Trigger').first().json.message.chat.id }}",
    "options": {
      "response": {
        "response": {
          "fullResponse": true
        }
      },
      "ignoreHttpStatusErrors": true
    }
  },
  "id": "ac-lookup-001",
  "name": "Lookup User for Add Child",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [-1340, 1328]
}
```

- [ ] **Step 2: Add "Is Registered for Add Child?" IF node**

```json
{
  "parameters": {
    "conditions": {
      "options": { "caseSensitive": true },
      "conditions": [
        {
          "leftValue": "={{ $json.statusCode }}",
          "rightValue": 200,
          "operator": {
            "type": "number",
            "operation": "equals"
          }
        }
      ]
    },
    "options": {}
  },
  "id": "ac-is-reg-001",
  "name": "Is Registered for Add Child?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2,
  "position": [-1130, 1328]
}
```

- [ ] **Step 3: Add "Reply Not Registered" Telegram node (false branch)**

```json
{
  "parameters": {
    "chatId": "={{ $('Telegram Trigger').first().json.message.chat.id }}",
    "text": "Please /register first before adding a child.",
    "additionalFields": {}
  },
  "id": "ac-reply-noreg-001",
  "name": "Reply Not Registered",
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1.2,
  "position": [-900, 1428],
  "credentials": {
    "telegramApi": {
      "id": "6b9KM3MrqkX0lsLl",
      "name": "Telegram account"
    }
  }
}
```

- [ ] **Step 4: Add "Fetch Personas" HTTP Request node (true branch — registered)**

```json
{
  "parameters": {
    "url": "={{ $env.BACKEND_URL }}/admin/personas",
    "options": {}
  },
  "id": "ac-personas-001",
  "name": "Fetch Personas",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [-900, 1228]
}
```

- [ ] **Step 5: Add "Parse Add Child Args" Code node**

Parses child name and characters, validates against personas, handles random fallback.

```json
{
  "parameters": {
    "jsCode": "const text = $('Telegram Trigger').first().json.message.text || '';\nconst args = text.replace(/^\\/add-child\\s*/, '').trim();\n\nif (!args) {\n  return [{ json: { error: true, message: 'Usage: `/add-child <child_name> [character1,character2,...]`\\n\\nExample: `/add-child Emma Elsa,Belle,Moana`' } }];\n}\n\nconst parts = args.split(/\\s+/);\nconst childName = parts[0];\nconst characterInput = parts.slice(1).join(' ');\n\n// Get available personas\nconst personas = $('Fetch Personas').first().json;\nconst personaList = Array.isArray(personas) ? personas : [];\nconst validIds = personaList.map(p => p.id.toLowerCase());\nconst personaNames = personaList.map(p => p.name);\n\nlet selectedCharacters = [];\nlet invalidCharacters = [];\nlet randomPicked = false;\n\nif (characterInput) {\n  const requested = characterInput.split(',').map(c => c.trim()).filter(c => c);\n  for (const c of requested) {\n    const lower = c.toLowerCase();\n    if (validIds.includes(lower)) {\n      selectedCharacters.push(lower);\n    } else {\n      invalidCharacters.push(c);\n    }\n  }\n}\n\nif (selectedCharacters.length === 0) {\n  // Pick 3 random characters\n  const shuffled = [...validIds].sort(() => Math.random() - 0.5);\n  selectedCharacters = shuffled.slice(0, 3);\n  randomPicked = true;\n}\n\n// Build display names for selected characters\nconst displayNames = selectedCharacters.map(id => {\n  const p = personaList.find(p => p.id.toLowerCase() === id);\n  return p ? p.name : id;\n});\n\nreturn [{ json: {\n  error: false,\n  childName,\n  selectedCharacters,\n  displayNames,\n  invalidCharacters,\n  randomPicked,\n  personaNames\n} }];"
  },
  "id": "ac-parse-001",
  "name": "Parse Add Child Args",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [-680, 1228]
}
```

- [ ] **Step 6: Add "Has Child Name?" IF node**

```json
{
  "parameters": {
    "conditions": {
      "options": { "caseSensitive": true },
      "conditions": [
        {
          "leftValue": "={{ $json.error }}",
          "rightValue": true,
          "operator": {
            "type": "boolean",
            "operation": "equals"
          }
        }
      ]
    },
    "options": {}
  },
  "id": "ac-has-name-001",
  "name": "Has Child Name?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2,
  "position": [-460, 1228]
}
```

- [ ] **Step 7: Add "Reply Add Child Usage" Telegram node (true branch — error)**

```json
{
  "parameters": {
    "chatId": "={{ $('Telegram Trigger').first().json.message.chat.id }}",
    "text": "={{ $('Parse Add Child Args').first().json.message }}",
    "additionalFields": {
      "parse_mode": "Markdown"
    }
  },
  "id": "ac-reply-usage-001",
  "name": "Reply Add Child Usage",
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1.2,
  "position": [-240, 1128],
  "credentials": {
    "telegramApi": {
      "id": "6b9KM3MrqkX0lsLl",
      "name": "Telegram account"
    }
  }
}
```

- [ ] **Step 8: Add "Create Child" HTTP Request node (false branch — valid args)**

```json
{
  "parameters": {
    "method": "POST",
    "url": "={{ $env.BACKEND_URL }}/admin/children",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ name: $('Parse Add Child Args').first().json.childName }) }}",
    "options": {}
  },
  "id": "ac-create-001",
  "name": "Create Child",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [-240, 1328]
}
```

- [ ] **Step 9: Add "Link Child to User" HTTP Request node**

Links the newly created child to the user. The link endpoint (admin.py:187-219) checks for duplicate child names per user and returns 409 if the user already has a child with that name. We use `fullResponse` and `ignoreHttpStatusErrors` to handle this.

```json
{
  "parameters": {
    "method": "POST",
    "url": "={{ $env.BACKEND_URL + '/admin/children/' + $('Create Child').first().json.id + '/users' }}",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ user_id: $('Lookup User for Add Child').first().json.body.user_id }) }}",
    "options": {
      "response": {
        "response": {
          "fullResponse": true
        }
      },
      "ignoreHttpStatusErrors": true
    }
  },
  "id": "ac-link-001",
  "name": "Link Child to User",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [-20, 1328]
}
```

- [ ] **Step 10: Add "Link OK?" IF node**

Checks if the link succeeded (201) or failed due to duplicate name (409).

```json
{
  "parameters": {
    "conditions": {
      "options": { "caseSensitive": true },
      "conditions": [
        {
          "leftValue": "={{ $json.statusCode }}",
          "rightValue": 201,
          "operator": {
            "type": "number",
            "operation": "equals"
          }
        }
      ]
    },
    "options": {}
  },
  "id": "ac-link-ok-001",
  "name": "Link OK?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2,
  "position": [200, 1328]
}
```

- [ ] **Step 11: Add "Reply Duplicate Child" Telegram node (false branch — link failed)**

```json
{
  "parameters": {
    "chatId": "={{ $('Telegram Trigger').first().json.message.chat.id }}",
    "text": "={{ 'You already have a child named ' + $('Parse Add Child Args').first().json.childName + '. Please choose a different name.' }}",
    "additionalFields": {}
  },
  "id": "ac-reply-dup-001",
  "name": "Reply Duplicate Child",
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1.2,
  "position": [420, 1428],
  "credentials": {
    "telegramApi": {
      "id": "6b9KM3MrqkX0lsLl",
      "name": "Telegram account"
    }
  }
}
```

- [ ] **Step 12: Add "Set Child Preferences" HTTP Request node (true branch — link OK)**

```json
{
  "parameters": {
    "method": "PUT",
    "url": "={{ $env.BACKEND_URL + '/admin/children/' + $('Create Child').first().json.id + '/preferences' }}",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ preferences: { characters: $('Parse Add Child Args').first().json.selectedCharacters } }) }}",
    "options": {}
  },
  "id": "ac-prefs-001",
  "name": "Set Child Preferences",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [420, 1228]
}
```

- [ ] **Step 13: Add "Build Add Child Response" Code node**

Constructs the response message with valid/invalid/random character info.

```json
{
  "parameters": {
    "jsCode": "const data = $('Parse Add Child Args').first().json;\nlet msg = data.childName + ' has been added';\n\nif (data.randomPicked) {\n  msg += '! I picked some characters for now: ' + data.displayNames.join(', ') + '.\\n\\nContact the admin to change them later.';\n} else {\n  msg += ' with characters: ' + data.displayNames.join(', ') + '.';\n}\n\nif (data.invalidCharacters.length > 0) {\n  msg += '\\n\\nWe haven\\'t supported ' + data.invalidCharacters.join(', ') + ' yet.';\n}\n\nreturn [{ json: { message: msg } }];"
  },
  "id": "ac-build-resp-001",
  "name": "Build Add Child Response",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [640, 1228]
}
```

- [ ] **Step 14: Add "Reply Child Added" Telegram node**

```json
{
  "parameters": {
    "chatId": "={{ $('Telegram Trigger').first().json.message.chat.id }}",
    "text": "={{ $json.message }}",
    "additionalFields": {}
  },
  "id": "ac-reply-ok-001",
  "name": "Reply Child Added",
  "type": "n8n-nodes-base.telegram",
  "typeVersion": 1.2,
  "position": [860, 1228],
  "credentials": {
    "telegramApi": {
      "id": "6b9KM3MrqkX0lsLl",
      "name": "Telegram account"
    }
  }
}
```

- [ ] **Step 15: Wire all /add-child branch connections**

Add to `"connections"`:

```json
"Lookup User for Add Child": {
  "main": [[{ "node": "Is Registered for Add Child?", "type": "main", "index": 0 }]]
},
"Is Registered for Add Child?": {
  "main": [
    [{ "node": "Fetch Personas", "type": "main", "index": 0 }],
    [{ "node": "Reply Not Registered", "type": "main", "index": 0 }]
  ]
},
"Fetch Personas": {
  "main": [[{ "node": "Parse Add Child Args", "type": "main", "index": 0 }]]
},
"Parse Add Child Args": {
  "main": [[{ "node": "Has Child Name?", "type": "main", "index": 0 }]]
},
"Has Child Name?": {
  "main": [
    [{ "node": "Reply Add Child Usage", "type": "main", "index": 0 }],
    [{ "node": "Create Child", "type": "main", "index": 0 }]
  ]
},
"Create Child": {
  "main": [[{ "node": "Link Child to User", "type": "main", "index": 0 }]]
},
"Link Child to User": {
  "main": [[{ "node": "Link OK?", "type": "main", "index": 0 }]]
},
"Link OK?": {
  "main": [
    [{ "node": "Set Child Preferences", "type": "main", "index": 0 }],
    [{ "node": "Reply Duplicate Child", "type": "main", "index": 0 }]
  ]
},
"Set Child Preferences": {
  "main": [[{ "node": "Build Add Child Response", "type": "main", "index": 0 }]]
},
"Build Add Child Response": {
  "main": [[{ "node": "Reply Child Added", "type": "main", "index": 0 }]]
}
```

- [ ] **Step 16: Commit**

```bash
git add n8n/telegram-brief.json
git commit -m "feat(n8n): add /add-child command branch"
```

---

### Task 4: Manual Testing

- [ ] **Step 1: Start the stack**

```bash
docker compose up --build
```

- [ ] **Step 2: Import updated workflow into n8n**

Open `http://localhost:5678`, delete the old "Telegram Brief" workflow, import the updated `n8n/telegram-brief.json`.

- [ ] **Step 3: Test /register**

Send these messages to the Telegram bot:

1. `/register` → should reply with usage instructions
2. `/register John Doe` → should reply with welcome message + character list
3. `/register John Doe` again → should reply "You're already registered"
4. Verify user exists: `curl http://localhost:8000/user/by-chat-id?chat_id=<your_chat_id>`

- [ ] **Step 4: Test /add-child**

1. `/add-child` → should reply with usage instructions
2. `/add-child Emma Elsa,Belle,Moana` → should reply "Emma has been added with characters: Queen Elsa, Belle, Moana."
3. `/add-child Liam Elza,Chase` → should reply "Liam has been added with characters: Chase." + "We haven't supported Elza yet."
4. `/add-child Noah` → should reply with random characters + "Contact the admin to change them later."
5. `/add-child Emma Elsa` → should reply "You already have a child named Emma."

- [ ] **Step 5: Test existing brief flow still works**

Send a regular text message (not starting with `/register` or `/add-child`) and verify it still routes through the existing brief flow.

- [ ] **Step 6: Final commit**

```bash
git add n8n/telegram-brief.json
git commit -m "feat(n8n): finalize telegram commands workflow"
```
