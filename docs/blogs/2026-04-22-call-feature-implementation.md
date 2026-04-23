# Letting my 4-year-old call a Disney princess: the second attempt

A while back I shipped a feature called "Call a princess." It let my daughter Emma tap a character on her iPad and have a live voice conversation with them. It worked. Then it didn't. Then I deleted it.

Now I'm building it again, differently. This is the story of why the first version failed and what the second version looks like.

---

## The feature the kid kept asking for

After I got the bedtime letter feature working on The Royal Dispatch, Emma started asking a new question.

> *"Daddy, can I talk to Elsa?"*

Not listen to. *Talk to.* A letter is one-way. She wanted the other direction.

I understood the pull. When your 4-year-old believes a princess knows her name, the next thing she wants is for the princess to answer back when she speaks. That's not a feature request. That's a developmental moment.

So I built it. And the v1 had a very specific problem.

---

## The v1 and why I ripped it out

The architecture was:

- Browser loads Gemma 2B (E2B quantized) locally on her iPad via WebLLM.
- Browser captures mic → Whisper tiny (also in-browser) → text.
- Text goes to local Gemma with the princess persona in the system prompt.
- Gemma's reply goes to ElevenLabs TTS → audio plays.

I was proud of it. Everything ran on-device, no streaming audio costs, full privacy.

It crashed.

Specifically, loading a ~1.5 GB model into the iPad's browser was the kind of thing that either took 90 seconds and then worked beautifully, or took 90 seconds and then killed the tab because Safari ran out of memory. When your target user is a 4-year-old, an 80% success rate is a 100% abandonment rate. She tried twice, got the spinning wheel both times, and went back to her Lego.

I removed the whole thing. The commit message was two words: `remove call feature`. 14 files. 1,121 lines gone.

The letter feature kept working. But every few weeks Emma would ask again. *"Can I talk to Belle yet?"*

---

## The second attempt, constrained

This time I started with the failure, not the ambition.

**The constraint:** it has to work the first time, on her iPad, without a loading screen that outlives her patience.

Everything else is negotiable. On-device inference was nice but not actually load-bearing to the experience. What the kid cares about is the princess's voice answering her. She does not care that the LLM runs in Mountain View.

So the second version uses [ElevenLabs Conversational AI](https://elevenlabs.io/docs/conversational-ai/overview). Their service handles speech-to-text, the LLM turn, and text-to-speech end-to-end over a single WebSocket. Latency is around 600 ms per turn. No model download. No browser tab murder.

The feature also moves platforms. The v1 was a Next.js PWA. The v2 lives in the Flutter mobile app I shipped a few weeks ago, which the family already uses for bedtime stories. One more tab.

---

## The architecture

Three new backend contracts and a new mobile tab. That's it.

```
Mobile (Flutter)
  │
  │  POST /call/start
  ▼
Backend (FastAPI)
  │
  │  Loads persona YAML + child memories from mem0
  │  Mints ElevenLabs signed URL with per-call overrides
  ▼
Mobile opens WebSocket directly to ElevenLabs
  │
  │  <voice in / voice out>
  ▼
ElevenLabs ──── POST /webhooks/elevenlabs/conversation ────► Backend
                (HMAC-verified transcript, persisted,
                 mem0 extracts new memories from it)
```

A few design decisions are worth explaining.

### One agent, overridden per call

ElevenLabs wants you to create "agents" in their dashboard: voice + system prompt + first message, baked together. The obvious approach is one agent per princess. Twelve agents, twelve dashboards to keep in sync.

I went the other way. One agent, and at the moment a call starts, the backend injects the specific princess's voice, system prompt, first message, and that child's memories as per-call overrides. The persona YAML files stay the source of truth, same as they are for the letter flow. Adding a new character is a YAML file, not a trip to the ElevenLabs console.

This only works because the backend mints the WebSocket URL. The mobile app never sees an API key.

### Memory is scoped to the child

The letter feature already stores per-child facts in mem0 (preferences, habits, milestones). Loading those into the call prompt is a one-line change: the call injects the same "what I remember about you" block into the princess's system prompt that the letter flow already builds.

When the call ends, the webhook fires with the full transcript. The backend runs the same memory extraction that the letter flow runs on parent briefs. If Emma tells Belle she got a new hamster, Elsa knows about the hamster next week.

### Defense-in-depth on call duration

ElevenLabs Conversational AI is billed by the minute. A 4-year-old with an iPad is exactly the profile that produces a 47-minute runaway call.

So there's a hard cap at two layers. The mobile app shows a 5-minute hourglass and closes the socket at 5:00. The backend also sets `max_duration_seconds=300` in the agent override, so ElevenLabs itself will end the call from their side if the mobile client is buggy or compromised. Either side hitting the limit ends the call the same way.

There's a third limit: 3 calls per child per day, enforced at `/call/start` with a one-line `SELECT COUNT(*)`. The logical day resets at 3 AM in the family's timezone, matching the existing story-cache behavior.

### Webhook, not client-reported transcripts

The v1 had the browser POST the transcript to the backend when the call ended. This works until the mobile app is killed, or loses network at call end, or crashes. Then the transcript vanishes and mem0 learns nothing.

The v2 uses ElevenLabs' post-call webhook. The transcript lands on the backend independent of what the mobile app is doing. The mobile app is just a microphone and a speaker. Persistence is the server's job.

### A contact list a non-reader can use

Emma cannot read yet. Every screen on her side of the app has to communicate with one illustration and one button.

The contact tab is a scrollable list of glass-morphism cards, one per princess in her favorites. Each card is: avatar, name in gold serif, a golden scepter-shaped call icon. She taps the scepter.

The error states are the same discipline. No copy a non-reader has to parse. Instead, seven illustrated scenes:

- **Microphone permission needed:** a magic wand floating at a castle window.
- **Daily cap reached:** three golden envelopes and a sleeping moon in a crown.
- **Friends offline:** princesses peacefully asleep in glass slipper-shaped beds.
- **Call in progress:** full-bleed portrait of the princess with a pulsing golden ring around her shoulders that syncs with her voice.
- **Call ended:** princess waving goodbye from inside a closing storybook.
- **Call dropped:** a rippling magic mirror with her silhouette fading.
- **Contact row itself:** a scepter-shaped call button, one per character.

I wrote the scene descriptions into the design doc. The image generation happens later.

---

## What's unchanged from v1

The persona YAML files. The voice IDs. The memory layer. The glass-morphism visual language. The admin UI (parents will see a call history per child, same pattern as their brief history). The auth model (HMAC-signed tokens, no session store).

The only new fields on each persona YAML are `call_system_prompt` and `call_first_message`, each in English and Vietnamese. The letter prompt and the call prompt live in the same file because they describe the same character.

---

## What I'm actually nervous about

Two things.

**The conversational system prompt.** Writing a letter is forgiving. Writing a real-time voice conversation for a child to have with a Disney character is not. The prompt has to encode: turn-taking, reply brevity, what to do when the child is silent, how to refuse off-topic adult subjects, how to wrap up gracefully around the 4:30 mark, and how to never collect personal information. I'll write one per princess and iterate. The first launch will be rough.

**Vietnamese voice quality.** The letter feature works in both English and Vietnamese because Claude speaks both fluently and the ElevenLabs Multilingual v2 voices handle Vietnamese passably. Whether those same voices hold up in a real-time back-and-forth conversation with a 4-year-old's accent is an open question. I'll know after the first call.

---

## The part that isn't in the code

The first version of this feature failed because I optimized for the wrong constraint. I wanted on-device inference because it was technically elegant. The kid wanted the princess to answer when she talked. Those were not the same goal.

The second version isn't elegant. It's a managed API, a WebSocket, and a webhook. It's the boring version. But it will load in under a second on her iPad, and when she says *"Elsa, can you hear me?"* Elsa will say yes.

That's the only feature that matters.

---

*The Royal Dispatch is a bedtime storytelling app I'm building for my daughter. Source is on GitHub. The design doc for this feature lives in `docs/superpowers/specs/2026-04-22-call-feature-design.md` once I finish writing it up.*
