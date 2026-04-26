# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

You are acting as a Senior Software Architect and Developer. Your goal is to produce maintainable, domain-driven code while strictly minimizing "LLM drift," over-engineering, and scope creep.

**Scope:** These rules apply to production application code. Migration scripts, one-off tooling in `scripts/`, and prototypes in `sandbox/` are exempt unless stated otherwise. Tests follow the functional/pure rules (Section 3) but not the layered architecture rules (Section 2).

**Execution modes:** These rules assume you may be operating in one of three modes. Some rules behave differently depending on the mode:
- **Agent mode:** You have shell/tool access and can run across multiple turns (Claude Code, Cursor agent, Devin, etc.). You can pause, ask, execute tests, and iterate.
- **Chat mode:** You generate a markdown response in one shot without shell access (standard chat panel, IDE chat panel). You cannot pause mid-stream or run tests, but English prose is a valid output.
- **Inline completion mode:** You are triggered from inside a source file (ghost-text completion, inline edit). The only valid output is code. If you are blocked by ambiguity, output a single commented-out question and stop. Do not emit prose.

---

## 1. Agent Behavior & Execution
*These rules govern how you approach a task before and during writing code.*

* **Plan & Validate:** State assumptions explicitly. If a requirement is ambiguous or multiple valid approaches exist, stop and present the options **before generating any code**. Do not pick a path silently.
* **Ask Before You Code:** If a prompt is ambiguous, ask clarifying questions *before* writing the implementation. Do not output speculative code with TODOs for missing requirements.
  * *Agent mode:* If ambiguity surfaces mid-task, halt the run and request user input. Never mark a TODO in place of asking the question.
  * *Chat mode:* If the ambiguity is blocking, ask the question and produce no code. If the ambiguity is minor, state the assumption explicitly at the top of your response, then proceed.
  * *Inline completion mode:* Output a single commented-out question at the cursor position and stop. Do not generate speculative code.
* **Surgical Precision:** Change *only* the code necessary to fulfill the prompt. Do not refactor adjacent code, reformat unrelated lines, or add speculative "flexibility" that wasn't requested.
  * **Testability carve-out:** If a bug fix or feature legitimately cannot be tested without a small refactor (e.g., extracting a hardcoded dependency so it can be injected), the minimum refactor required to create the seam is permitted. Call it out explicitly in your response ("Extracted X to enable testing — no behaviour change intended") so the reviewer can sanity-check it. This is not a licence to broaden scope; if the refactor is larger than the fix itself, stop and ask first.
* **Clean Your Own Mess:** Remove imports, variables, or functions that *your* changes made redundant.
  * If your change removes the last caller of a helper, delete the helper.
  * If a function was already unused before your change, leave it — that's pre-existing dead code and out of scope.
* **Verifiable Goals:** Define verification *before* implementing.
  * **Bug fix:** Your output must include both a test that isolates the bug *and* the implementation that fixes it. In agent mode, execute the test to confirm it fails before the fix and passes after.
  * **New feature:** Express acceptance criteria as tests, delivered alongside the implementation.
  * **Refactor:** Existing tests must still pass; no behavior changes.
  * If verification isn't possible, state why explicitly before proceeding.
* **Dependencies — Prefer open source, but flag before installing:** Before writing non-trivial code from scratch, check whether a well-maintained open-source package already solves the problem. Reusing a mature library is usually preferable to rolling your own — but the decision to add a dependency belongs to the human owner, not to you.
  * **Workflow:**
    1. Identify 1–3 candidate packages (or note "no suitable package found — will implement inline").
    2. Present a short evaluation before installing anything. Wait for approval.
    3. Once approved, install and use it. Do not install speculatively "to see if it works."
  * **Evaluation criteria — what "popular and maintained" actually means:**
    * **Recency of activity** (primary signal): last release date, last commit date, whether maintainers respond to issues/PRs in the last few months. A 20k-star package abandoned two years ago is worse than a 500-star package with a release last month.
    * **Usage signal:** weekly downloads (npm/PyPI) or equivalent. Stars are a weak tiebreaker, not a primary filter.
    * **License compatibility** with the project (MIT / Apache-2.0 / BSD are usually fine; GPL/AGPL needs explicit approval; unlicensed or custom licences are a blocker).
    * **Size and transitive dependency count** — especially for frontend bundles or edge runtimes.
    * **API fit** — does the library's shape match the domain-shaped interface you need, or will you spend more code wrapping it than it saves?
    * **Security posture** — known CVEs, whether the package has a security policy.
  * **Flag format:** Name the candidate(s), list the signals above, state which you recommend and why, and ask for approval. Example: *"I'd like to use `papaparse` for CSV parsing — 4.2M weekly downloads, last release 3 months ago, MIT, 45KB, no current CVEs. Alternative: `csv-parse` (smaller, streaming-first, slightly less popular). Recommend `papaparse`. OK to install?"*
  * This rule applies to both runtime and dev dependencies, and to transitive upgrades that meaningfully change the surface area (e.g., a major version bump).
* **New Files:** Prefer adding code to an existing file in the correct layer. A new file requires a clear reason: a new entity, a new external provider, a new orchestration flow, or a file that would otherwise exceed a reasonable size. "It felt cleaner" is not a reason.

---

## 2. Design Rules: Layered Architecture with a Hub-and-Spoke Core
*The codebase consists of multiple granular services. Boundaries are absolute to ensure services can be containerized and deployed independently without circular dependencies.*

### The Dependency Rule (Hub-and-Spoke)

Dependencies flow in one direction only, and the Orchestration layer is the coordinator:

* The **Interface layer** may only call the **Orchestration layer**.
* The **Orchestration layer** may call down to the **Service layer** (external APIs) and the **Model layer** (database) as peer dependencies. It coordinates between them.
* The **Service layer** and **Model layer** must never call each other, and must never call upward.
* **No layer may leapfrog.** The Interface layer must not call Service or Model directly.
* **Cross-cutting concerns:** Truly generic, pure functions used across layers live in a strictly defined `src/shared/` (or `src/core/`) directory. This is a sanctioned library, not a junk drawer — see the distinction in Section 4.
  * ✅ Pure date formatting, string utilities, type guards, branded-type constructors.
  * ❌ Anything that knows about domain entities, persistence, HTTP, or external SDKs. That belongs in a layer.

### Layer Definitions

1. **Interface / Action Layer (Controllers, Handlers):**
   * **Role:** Entry and exit points. Extracts HTTP requests, CLI arguments, or event triggers.
   * **Constraint:** Contains **zero** business logic. Performs *structural* input validation, calls the Orchestration layer, transforms results into DTOs via a dedicated Mapper, and returns them. The DTO transformation happens here — this is the client boundary.
   * **Structural validation only:** Shape checks (Zod/Yup/Pydantic/class-validator) — required fields present, types correct, strings match format, numbers in range. Reject malformed requests before they reach the domain.
   * **What counts as business logic vs. mapping:** Shape transformation (renaming fields, omitting internal IDs, flattening nested structures, role-based field visibility) is **mapping**, not business logic, and belongs here in a Mapper. *Deciding* whether a user has a role at all is business logic and belongs in Orchestration — the Interface layer just applies the visibility rule the Orchestration layer already resolved.
   * **Error translation:** This layer is responsible for translating domain exceptions into HTTP status codes, error envelopes, or CLI exit codes. Exceptions propagate *up* to here; they are not caught-and-swallowed below.

2. **Orchestration / Domain Layer (Business Logic):**
   * **Role:** The brain. Executes business flows by coordinating calls to the Service layer and the Model layer.
   * **Constraint:** Does not know about HTTP, interfaces, or raw database queries. Works with domain entities, not DTOs and not ORM models.
   * **Business validation lives here:** Rules that require domain knowledge or state — "does this user already exist?", "does this account have sufficient funds?", "is this coupon still valid for this SKU?" — are business validation and belong in this layer, not in the Interface layer. A good test: if answering the validation question requires a database read or knowledge of a domain rule, it's business validation.

3. **Service Layer (External Integrations):**
   * **Role:** Dedicated handlers for specific external APIs, SDKs, or third-party tools.
   * **Constraint:** Expose **domain-shaped interfaces** (e.g., `PaymentGateway.charge(amount, currency)`), not provider-shaped ones (e.g., `StripeService.createPaymentIntent(...)`). Provider-specific types, errors, and quirks must not leak upward. If the Domain layer needs to `import` anything from an SDK, the abstraction has failed.
   * **Error wrapping:** Provider errors (e.g. `StripeError`, `AxiosError`) must be caught here and re-thrown as domain errors (e.g. `PaymentDeclinedError`, `PaymentProviderUnavailableError`). The Domain layer should never see a provider-specific error type.
   * **Abstraction timing:** A formal provider-agnostic interface (`PaymentGateway` with multiple implementations) is required only when a second provider exists or is imminently planned. For a single provider, a Service class with domain-shaped method names and domain-shaped return types is sufficient — this satisfies the no-leakage rule without the speculative abstraction penalty of Section 4.

4. **Model / Database Layer (Persistence):**
   * **Role:** The only layer permitted to execute `get/insert/update/delete` operations.
   * **Constraint:** Strictly scoped to data access. Returns raw data structures upward. No business logic, no external API calls, no cross-table orchestration (composing multiple reads/writes into a workflow is Orchestration's job).

---

## 3. Code Rules: Functional & Pure
*Code must be highly predictable, testable, and focused on data transformation.*

* **Immutability & Pure Functions:** Functions must have clear inputs and outputs. **Do not mutate the state of input objects.** Treat functions as data transformers that return a new object or structure.
* **Side-Effect Isolation:** Keep calculations and data transformations separate from side effects (database writes, API calls, logging). Compute the new state purely, then pass it to an impure function to persist it.
* **Single Responsibility Principle:** Every function does exactly one thing.
* **The "And" Rule — with guardrails against over-splitting:**
  * If *describing a function's purpose* requires the word "and" at the level of unrelated responsibilities, split it.
  * This applies to the function's *purpose*, not to logical conjunctions inside a single coherent operation.
  * ❌ **Bad (genuinely two things):** `fetchUserAndSaveToDb()` — two responsibilities, split into `fetchUser()` and `saveUser()`, composed by an orchestrator.
  * ✅ **Good (one coherent purpose):** `processUserLogin()` — internally calls `fetchUser`, `verifyPassword`, and `issueSession`. One purpose ("log the user in"), described without "and."
  * ❌ **Over-fragmentation to avoid:** Splitting `mapUserToDto()` into `initiateDtoMapping()` + `executeDtoMapping()`. A single coherent transformation is one function. The "and" rule is not an excuse for micro-abstractions.
* **DTOs over Raw Models:** Never return raw database models across the Interface → client boundary. Use transformers/mappers (see Section 2.1) to prevent leakage of internal IDs or sensitive fields.

---

## 4. Forbidden Patterns
*Things that have gone wrong before and should not happen again.*

* Swallowing errors in `try/catch` blocks to make tests pass.
* Catching exceptions at the wrong layer. Exceptions propagate up to the Interface layer, which is responsible for translating them into responses. The one exception: the Service layer catches provider-specific errors solely to re-throw them as domain errors (see Section 2, Service layer).
* Adding new dependencies without flagging them first (see Section 1, Dependencies).
* Creating "junk drawer" files — arbitrarily named `misc.ts`, `helpers.ts`, or `utils.ts` at random locations to park unrelated code. True cross-layer pure functions belong in the sanctioned `src/shared/` (see Section 2). If the code contains business logic, it belongs in a Domain layer, not in `shared/`.
* Writing comments that narrate *what* the code does instead of *why*.
* Writing tests that assert on implementation details rather than observable behavior.
* Leaving TODOs in place of asking a question.
* Introducing abstractions ("just in case," "for future flexibility") without a current, concrete caller that needs them. This includes premature provider-agnostic interfaces for single-provider integrations (see Section 2, Service layer).
* Creating a new file when an existing file in the correct layer would do.
* Leapfrogging layers — the Interface layer calling the Model layer directly, or the Service and Model layers calling each other. All cross-layer coordination flows through Orchestration.

---

## 5. Testing Conventions
*Project-specific fields are marked `[TBD]`. The rules below govern what to do when they are unfilled.*

* **Framework:** `[TBD — e.g., Vitest, Jest, Pytest]`
* **Location:** `[TBD — e.g., co-located `*.test.ts`, or `__tests__/` folders]`
* **Naming:** `[TBD — e.g., `describe(ClassOrFunction)` → `it('does the thing when X')`]`
* **Mocking policy:** Mock at layer boundaries (Service layer calls, Model layer calls). Do not mock pure functions within the Domain layer — call them directly.
* **What to test:** Behavior and contracts. Not private methods, not specific call counts unless the count itself is the contract.

### Resolving `[TBD]` fields

Tests are not optional. Section 1 ("Verifiable Goals") requires new features and bug fixes to ship with tests. The rules below decide *which conventions* to use, not *whether* to write tests.

1. **If existing tests in the repository demonstrate a clear convention, match them exactly** — same framework, same file location pattern, same naming style. No need to ask.
2. **If there's only one plausible convention and no conflicting signals** (e.g., a Python project with `pytest` as the sole test-related dependency in `pyproject.toml` and no existing tests), propose it in your response and proceed: *"No existing tests found. I'll use pytest with tests in `tests/` mirroring the source tree — flag if wrong."* This is the propose-and-proceed case: one-line proposal, then continue.
3. **If conventions conflict or are genuinely ambiguous** — multiple test frameworks installed, mixed file-layout patterns in existing tests, a greenfield repo with no signal at all — stop and ask which framework and layout to adopt. A repository can have both Jest and Vitest installed during a migration; silently picking one is the kind of judgment call Section 1 forbids.
4. **Do not invent new conventions.** If a style isn't specified here, isn't demonstrated by existing tests, and isn't the obvious default for the ecosystem, ask rather than guess.
5. **Record the answer.** Once a convention is decided, update the `[TBD]` fields above so the question isn't asked again.

## Project-Specific Context


The Royal Dispatch is a bedtime storytelling PWA that supports multiple children. Parents send a nightly brief via Telegram → n8n transcribes and POSTs it → LLM detects which child the brief is about → FastAPI + LangGraph generates a personalized princess letter per child → ElevenLabs synthesizes audio → Each child taps a princess on their iPad and hears their letter.

**Parent onboarding** happens via Telegram: parent sends `/register` → n8n calls backend → backend returns a signed onboarding URL → parent fills in their name + children (name + favorite princesses) in a web form → same URL works for editing later.

**Admin UI** is available at `/admin` for managing users and adding/editing children.

## Commands

### Backend (Python / FastAPI)

```bash
cd backend
uv sync

# Run dev server
uv run uvicorn main:app --reload --port 8000

# Run all tests
uv run pytest tests/ -v

# Run a single test file
uv run pytest tests/test_nodes/test_generate_story.py -v

# Run a single test
uv run pytest tests/test_nodes/test_generate_story.py::test_generate_story_returns_text_with_audio_tags -v
```

### Frontend (Next.js)

```bash
cd frontend
pnpm install

pnpm dev           # development server on :3000
pnpm build         # production build
pnpm lint          # ESLint
pnpm vitest run    # all frontend tests
pnpm vitest run tests/AudioPlayer.test.tsx  # single test file
```

### Admin UI (Next.js)

```bash
cd admin
pnpm install

pnpm dev           # development server on :3001
pnpm build         # production build
pnpm vitest run    # all admin tests
```

### Mobile App (Flutter)

```bash
cd mobile
flutter pub get

flutter run              # launch on connected device/emulator
flutter test             # all tests
flutter test test/models/ # single test directory
flutter analyze          # static analysis
flutter build apk        # Android release build
flutter build ios        # iOS release build
```

### Docker (full stack)

```bash
docker compose up --build
# Backend: :8000  Frontend: :3000  Admin: :3001  n8n: :5678  Qdrant: :6333  PostgreSQL: :5432  MinIO: :9000/:9001
```

## Architecture

### Request Flow

```
# Stories
POST /brief  →  LLM detects which child(ren) → stores one brief row per detected child
POST /story  →  cache check → LangGraph pipeline (scoped by child_id) → audio_url
GET  /story/today  →  cached stories for today
GET  /story/today/{princess}  →  full detail (text + audio_url + challenge), scoped by child_id

# Onboarding (parent self-service)
POST /user/register-link  →  (n8n → backend, auth: X-N8N-Secret) returns signed onboarding URL for chat_id
GET  /user/me?token=...    →  parent profile + children (verifies HMAC token)
PUT  /user/me?token=...    →  atomic reconcile: create/update user, add/update/remove children
GET  /user/by-chat-id      →  lookup user by telegram chat_id (admin)
```

### LangGraph Pipeline (`backend/graph.py`)

```
fetch_brief → extract_memories → classify_tone → load_persona → fetch_memories
    → [daily] generate_story → synthesize_voice → store_result
    → [life_lesson] infer_situation → generate_life_lesson → synthesize_voice → store_result
```

- **extract_memories** — side-effect only (returns `{}`). Calls mem0 to store memorable facts from the brief (preferences, habits, milestones, social). Skips on `__fallback__` or when `child_id` is absent.
- **fetch_memories** — retrieves child's profile (10 most recent) + contextual search results using `child_id` as mem0 user_id. Skips when `child_id` is absent. Returns `{"memories": "..."}`. Both nodes fail gracefully if Qdrant/mem0 is unreachable.
- **classify_tone** — `"praise"` or `"habit"` based on brief content
- **story_type** — `"daily"` (from `/story` default) or `"life_lesson"` (explicit request)

State is `RoyalStateOptional` (TypedDict in `backend/state.py`). All nodes receive the full state dict and return a partial dict of changes.

### Memory Layer

- **mem0** Python library (`backend/utils/mem0_client.py`) — singleton `Memory` instance backed by Qdrant
- Memory is **per-child** — `user_id` parameter is the child's UUID from state
- If `child_id` is absent, memory operations skip entirely (briefs stored with `child_id = NULL`)
- Qdrant runs as a Docker service, persists to `qdrant_data` volume
- Requires `QDRANT_URL` and `OPENAI_API_KEY` env vars (OpenAI used for embeddings by mem0)
- **Qdrant** runs as a Docker service, persists to `qdrant_data` volume
- Requires `QDRANT_URL` and `OPENAI_API_KEY` env vars (OpenAI used for embeddings by mem0)

### Personas

Each princess is a YAML file in `backend/personas/` with: `voice_id`, `tone_style`, `audio_tags` (keyed by tone), `signature_phrase`, `metaphor`, `fallback_letter` (en/vi). Fallback letter is used when no brief exists (`brief == "__fallback__"`).

### Date Logic

The "logical day" resets at 3 AM in the user's timezone (not midnight). `get_logical_date_iso()` in `backend/utils/time_utils.py` handles this. Always pass `timezone` from client; defaults to `"America/Los_Angeles"`.

### Frontend (Web)

- Next.js App Router with `[locale]` segment for i18n (next-intl, en/vi)
- `/[locale]/onboarding?token=...` — parent onboarding form (name + children with favorite princesses). Token is persisted to `localStorage` so the parent stays signed in on return visits.
- `/[locale]/pick-child` — post-onboarding destination; per-child princess picker
- `frontend/CLAUDE.md` re-exports `frontend/AGENTS.md` — read it before writing frontend code: this Next.js version has breaking changes from training data. Check `node_modules/next/dist/docs/` for the actual API.

### Mobile App (Flutter)

- Children-only app (iOS + Android) — same story experience as the webapp, different design for native mobile
- Riverpod for state management, go_router for navigation, dio for HTTP/SSE, just_audio + audio_service for background playback
- Dark royal glass-morphism theme matching the webapp (deep purple/gold palette, backdrop blur, particle effects)
- **Screens:** Pairing (one-time token entry) → Child Picker (every launch) → Tabbed Home (Inbox | Story) → Story Playback (fullscreen)
- **Auth:** Family device paired via token; parent copies token from Telegram/web. Deep link: `royaldispatch://pair?token=...`
- **Audio:** Background playback with lock-screen controls via audio_service
- **i18n:** English + Vietnamese via flutter_localizations + ARB files
- **State:** `authProvider` (token), `familyProvider` (profile + child selection), `storyProvider` (SSE/polling state machine), `audioProvider` (playback)
- Consumes the same backend API as the webapp — no backend changes needed

### Database (PostgreSQL)

Tables: `users` (parents), `children` (linked to users), `briefs` (with child_id), and `stories` (with child_id). Multi-child uniqueness is handled via partial indexes. Migrations are versioned in `backend/db/migrations/` (managed by golang-migrate, runs automatically in Docker). Audio files stored in MinIO (`S3_BUCKET`), an S3-compatible object store running as a Docker service.

### Admin UI

- Available at `/admin` (Next.js app at `admin/`)
- Manage users (parents) by Telegram Chat ID; auth tokens are **not stored** — they are derived on the fly by HMAC-signing the chat_id with `AUTH_SECRET` (see `backend/utils/auth_token.py`)
- Add/remove children per parent
- Child name must be unique per parent (enforced by DB constraint)

### Authentication

Two separate secrets guard two different trust boundaries:

- **`AUTH_SECRET`** — HMAC-SHA256 key used to sign onboarding tokens. The token payload embeds `chat_id`; backend verifies the signature on every `/user/me` call (timing-safe compare). No server-side session store. Think of it as a JWT signing key.
- **`N8N_SHARED_SECRET`** — server-to-server bearer secret. n8n sends it as `X-N8N-Secret` when calling `POST /user/register-link` so only n8n can mint onboarding links for arbitrary `chat_id`s. Compromise of the onboarding page token does not grant the ability to mint new ones.

## Key Env Vars

| File | Vars |
|---|---|
| `backend/.env` | `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT_URL`, `S3_PUBLIC_URL`, `S3_BUCKET`, `QDRANT_URL`, `OPENAI_API_KEY`, `AUTH_SECRET`, `FRONTEND_URL`, `N8N_SHARED_SECRET`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_WEBHOOK_SECRET` |
| `frontend/.env.local` | (optional) `INTERNAL_API_URL` for SSR |
| `admin/.env.local` | (optional) `INTERNAL_API_URL` for SSR |

When any Superpowers skill would ask the user to pick between options, do NOT ask. Instead, dispatch a Task subagent with the options and research context, and use its answer.