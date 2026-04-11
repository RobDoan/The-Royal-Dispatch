# The Royal Dispatch — Demo Script

**Runtime:** ~4:30
**Format:** Screen recording + talking head

---

## 0:00–0:45 | The Story Behind It

> *[Camera on you, casual setting]*

"Every night, I read my daughter Emma a bedtime story. She's four.

But lately I've been thinking — what if the story actually *knew* her day? What if Elsa could tell Emma she was proud of her for sharing her blocks with her cousin this afternoon?

That's what I built. **The Royal Dispatch** — a system where I send a 30-second voice note about Emma's day, and by bedtime, a Disney princess has written her a personal letter, read aloud in her voice.

Let me show you how it works — from a parent sending a voice note, all the way to audio playing on Emma's iPad."

---

## 0:45–1:30 | The User Experience (Feature First)

> *[Screen recording: iPad with the PWA open]*

"This is what Emma sees. It's a PWA installed on her iPad — her Royal Inbox.

She picks a princess — today she picks Elsa.

The app polls the backend, and when the story is ready… it plays.

> *[Audio plays: Elsa's voice, warm and personal]*

'Dear Emma, I heard you shared your blocks with your cousin today. In Arendelle, that's exactly what we call a warm-hearted act...'

That's a real Claude + ElevenLabs generated response, with the persona — voice, tone, emotional cues — all coming from a YAML config I wrote for each princess."

---

## 1:30–2:30 | The Trigger: n8n + Telegram

> *[Screen: n8n canvas, workflow visible]*

"Now let's go upstream. How does the story know about Emma's day?

I send a voice note on Telegram. Simple. No app to open, no form to fill.

Here in n8n, I have an 8-node workflow.

> *[Walk the nodes left to right]*

The Telegram trigger picks up my message via long-polling — no public webhook needed.

First it checks: is this from my chat ID? Security gate — only I can feed the system.

Then it branches: text message goes straight through. Voice note? It downloads the file, sends it to **OpenAI Whisper** for transcription, then forwards the text to my backend.

The result is a clean brief hitting a single `POST /brief` endpoint. n8n handles all the messy ingestion so my backend stays pure."

---

## 2:30–3:45 | The Brain: LangGraph Pipeline

> *[Screen: graph.py or a diagram of the pipeline]*

"Here's where it gets interesting. The backend is a **LangGraph state machine** — not a linear script.

> *[Show the graph flow]*

```
fetch_brief → classify_tone → load_persona → [branch]
                                              ├→ generate_story → synthesize_voice → store
                                              └→ infer_situation → generate_life_lesson → synthesize_voice → store
```

**Node 1** pulls today's brief from Supabase.

**Node 2** — `classify_tone` — sends it to Claude Haiku. Fast, cheap. One job: is this a *praise* moment or a *habit* challenge?

Today's brief: 'She shared her blocks, but didn't want to brush her teeth.' Two signals. Haiku classifies: habit.

**Node 3** loads the princess persona from YAML — Elsa's voice ID, her tone, her emotional audio tags, her signature phrase.

Then the graph branches:
- **Praise path**: Claude Sonnet writes a direct celebration letter.
- **Habit path** (our case): Haiku first infers the teachable moment — *dental hygiene* — then Sonnet writes a story where Elsa herself once struggled to brush her teeth in Arendelle. Metaphor-based. Emma doesn't feel lectured. She feels like Elsa gets it.

Final node: ElevenLabs v3 with **Expressive Mode**. The prompt has embedded audio tags — `[PROUD]`, `[WARM]`, `[PLAYFUL]` — so the voice actually performs the emotion, not just reads the words.

Story is cached in Supabase. Frontend polls, finds it, plays it."

---

## 3:45–4:15 | The Stack at a Glance

> *[Split screen or simple diagram]*

"To recap the stack:

- **n8n** handles ingestion — Telegram, Whisper transcription, routing
- **LangGraph** orchestrates the AI pipeline with conditional branching
- **Claude Haiku** for fast classification, **Claude Sonnet** for generation
- **ElevenLabs v3** for expressive voice synthesis
- **FastAPI** backend, **Next.js** PWA frontend
- **Supabase** for storage and caching
- All running on **Docker Compose**

What I'm proud of: the system is *data-driven*. Adding a new princess means adding one YAML file. The graph, the prompts, the voice — all flow from config."

---

## 4:15–4:30 | Close

> *[Back to camera]*

"Emma doesn't know any of this. She just knows Elsa wrote her a letter tonight.

And that's the whole point.

The Royal Dispatch — AI infrastructure that disappears into magic."

---

## Shooting Notes

- Record n8n and LangGraph sections as screen recordings first — easier to trim
- Do the Telegram → audio demo live if possible; the latency (~5–10s generation) actually builds suspense
- For Emma's iPad scene, even a mockup on your own device works perfectly
