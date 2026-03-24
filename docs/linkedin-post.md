# LinkedIn Post — The Royal Dispatch

---

I built a bedtime storytelling app for my 4-year-old daughter using AI — and it changed our nightly routine completely.

Here's the story.

---

## My daughter Emma loves Disney Princesses.

Every night, she would come to me and ask: *"Tell me a story, but I want Elsa in it."*

She's 4. She's sensitive. She notices everything. And she responds deeply when her heroes notice *her* — when Elsa praises her for sharing her toys, when Belle tells her that being kind makes her brave.

I realized stories were the most powerful parenting tool I had. Not lectures. Not reminders. Stories.

But there was a problem.

**I'm not a good storyteller.** After a long day of work, coming up with a fresh, creative, personalized story every single night was exhausting. The stories started repeating. Emma started noticing. The magic was fading.

I had another problem too: Emma sometimes struggled with small habits — brushing her teeth, tidying up, going to bed without a fuss. I didn't want to nag. I wanted her heroes to model those habits for her, in a way she'd actually listen to.

So I thought: *what if I could build something that does this for me?*

---

## The idea: The Royal Dispatch

Every evening, I send a quick WhatsApp voice note or text — 30 seconds max:

> *"She shared her blocks with her cousin today. But she didn't want to brush her teeth."*

That's it. That's my input.

Emma opens her iPad before bed. She sees her **Royal Inbox** — four sealed letters, one from each princess. She taps the one she wants.

A few seconds later, **Elsa's voice plays** — a personal letter written just for Emma, based on what I sent. If Emma did something good, Elsa celebrates her directly. If Emma struggled with a habit, Elsa tells a story about how *she* once had to practice the same thing in Arendelle.

Emma goes to sleep feeling seen by her hero.

---

## The tech stack — and why I chose each piece

I wanted to use this project to learn modern AI engineering, not just glue APIs together. Here's what I built with:

**FastAPI + LangGraph**
The backend is a LangGraph state machine — a graph of 6 nodes that runs on demand when Emma taps a princess. I chose LangGraph because it makes the pipeline explicit and debuggable: each step is its own node with a clear input/output contract. No black boxes.

```
fetch_brief → classify_tone → load_persona → generate_story → synthesize_voice → store_result
```

**Claude (Anthropic)**
Two models in the pipeline: Claude Haiku classifies the parent brief into *Praise Mode* or *Habit Modeling Mode* (fast and cheap). Claude Sonnet writes the actual letter — bilingual (English/Vietnamese), in the princess's voice, with the right emotional tone. The model is instructed through a YAML persona config per princess — editable without touching code.

**ElevenLabs v3 with Expressive Mode**
This is what makes it feel real. ElevenLabs v3 supports audio tags like `[PROUD]`, `[CALM]`, `[GENTLE]` embedded in the text. The generated letter uses these tags so the voice doesn't just *say* the words — it *performs* them. Elsa sounds majestic. Belle sounds warm and curious.

**Supabase**
Postgres stores the parent briefs and generated stories. Storage hosts the `.mp3` files. There's a natural cache: once a story is generated for a princess on a given day, replaying it just returns the existing audio URL — no LLM calls, no cost.

**n8n**
Handles the WhatsApp webhook. When I send a voice note, n8n transcribes it via OpenAI Whisper and posts the text to the FastAPI backend. The whole flow — voice note to story — is fully automated.

**Next.js 16 PWA**
The frontend is installed on Emma's iPad as a home screen app. No App Store. No login. She opens it, taps a princess, and listens. It's bilingual — a language toggle switches the entire UI and story generation between English and Tiếng Việt.

---

## What it actually looks like in use

I open WhatsApp. I record 20 seconds:

> *"Em chia đồ chơi cho bạn hôm nay. Nhưng tối vẫn không chịu đánh răng."*

Emma gets her iPad. She taps Elsa.

Elsa says (in English or Vietnamese depending on the setting):

> *"Emma... I heard something very special happened today. Your friend needed some blocks, and without even being asked — you shared yours. Do you know what that is? That is the kind of magic that even I am still learning in Arendelle. As for brushing teeth — I used to think it was silly too. But then one winter morning I realized: a princess who takes care of herself is a princess who can take care of her kingdom. I believe in you, Emma. Goodnight."*

She asks to hear it again.

That's the "one more" test. We pass every night.

---

## The code

The full project is open source. It includes the FastAPI backend, LangGraph pipeline, Next.js PWA, princess persona YAML configs, Supabase schema, and n8n workflow.

👉 **[GitHub repo link — add yours here]**

---

## The demo

📹 **[Video demo link — add yours here]**

---

## What I learned

Building this taught me more about AI engineering than any tutorial:

- **LangGraph** is genuinely the right mental model for multi-step AI pipelines. The explicit node/edge structure makes it easy to test, debug, and extend.
- **Prompt engineering as configuration**: moving the system prompts into YAML persona files means I can tweak Elsa's personality without touching Python. Non-technical parents could theoretically customize this themselves.
- **Bilingual LLM output** works surprisingly well with Claude. The same voice, the same persona — just a language parameter.
- **ElevenLabs v3 Expressive Mode** is a step change. The difference between a flat TTS voice and one that performs emotional audio tags is the difference between a robot and a storyteller.

---

## What's next

I want to add more princesses. I want to let Emma record a reply back. I want to experiment with memory — so the princesses remember what happened last week and reference it.

But mostly — I want Emma to keep asking for one more letter.

---

*If you're building something for your kids, or just exploring AI engineering — I'd love to hear about it. Drop a comment or DM me.*

*#AIEngineering #LangGraph #ElevenLabs #Anthropic #Claude #NextJS #PersonalProject #BuildingForFamily #ParentingWithTech*
