@AGENTS.md

# Nexus OS — Master Engineering Specification

AI-native personal knowledge and productivity operating system for Youssef Zuaiter
(AI Engineering student, Bahçeşehir University).

**Core product principle: everything is connected.** Notes, tasks, calendar events,
projects, and knowledge form one interconnected workspace the AI understands, while
respecting strict security, privacy, and architectural boundaries.

## Execution strategy

Build strictly step-by-step. Do not generate the entire codebase in one response.
Inspect the repository, identify architectural implications, propose the affected
files/data models/interfaces, and only then implement.

## Non-negotiable engineering rules

- Complete, production-ready TypeScript. **Zero stubs, zero fake implementations,
  zero mock databases, zero TODO placeholders.**
- Every implemented file must be fully functional. Never silently omit required
  functionality or substitute fake data for an unavailable integration.
- Business logic stays separate from presentation logic.
- Standard request flow:
  `UI → Server Action / API → Validation (Zod) → Authorization → Service / Use Case → Repository`
- No overengineering. Stick to Next.js, PostgreSQL, Prisma, and pgvector. No
  premature microservice extraction or distributed infrastructure.

## API contracts

```ts
type ApiResponse<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: { code: string; message: string } };
```

Error codes: `AUTH_REQUIRED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR`,
`RATE_LIMITED`, `AI_UNAVAILABLE`, `AI_OUTPUT_INVALID`, `VECTOR_SEARCH_FAILED`,
`INTEGRATION_ERROR`.

## Security, threat modeling & guardrails

1. **Multi-tenant isolation.** Every query must explicitly filter by a `userId`
   derived from the server-side session. Never trust a client-provided user ID.
2. **Prompt injection defense.** Retrieved RAG chunks and user-uploaded text are
   untrusted data. Instructions inside retrieved notes/documents must never
   override system instructions or authorization policies.
3. **AI permissions model.** The agent operates via a strict permission boundary
   (`READ_NOTES`, `READ_TASKS`, `CREATE_TASK`, `CREATE_EVENT`, …) mediated entirely
   by server-side Zod validation and user ownership checks.
4. **Idempotency.** Mutations triggered by background jobs, webhooks, or AI tool
   calls must carry idempotency keys or transaction state checks.
5. **Human-in-the-loop.** High-consequence AI actions (multi-task creation,
   schedule overriding) emit a Proposed Action payload requiring explicit user
   confirmation, audited via `AuditEvent`.

## Stack decisions

Chosen to keep the project free to run — no paid API keys.

| Concern | Choice | Notes |
| --- | --- | --- |
| Database | Postgres 17 + pgvector 0.8.6 in Docker | `docker-compose.yml`, host port **5434** (5433 is taken by an unrelated `pfw_local_db` container) |
| ORM | Prisma 7 | Datasource URL lives in `prisma.config.ts`, **not** the schema. Client uses the `@prisma/adapter-pg` driver adapter and generates to `src/generated/prisma` |
| Embeddings | Ollama `nomic-embed-text` | **768 dimensions**, not the 1536 the original spec assumed. Requires task prefixes — see below |
| Chat / tool calling | Ollama `llama3.2:3b` | Swap via `OLLAMA_CHAT_MODEL` |
| Auth | NextAuth v5 (Auth.js) beta, Credentials + JWT | `trustHost: true`; route guards live in layouts, not middleware |
| Password hashing | `node:crypto` scrypt | No native build step and no extra dependency; format is `scrypt$N$r$p$salt$hash` |
| Dev port | **3100** (pinned in `package.json`) | Port 3000 is occupied by an unrelated `pfw` app on this machine |

Changing the embedding model to one with different output dimensions requires a
new migration — `EMBEDDING_DIMENSIONS` in `src/lib/config.ts` is pinned to the
`vector(768)` column for that reason.

The pgvector ANN index is HNSW with `vector_cosine_ops`, declared in a hand-written
migration because Prisma cannot express pgvector index types. Similarity queries use
`1 - (embedding <=> $vector)`.

**Always embed through `embedQuery()` or `embedDocuments()`, never `embedTexts()`
directly.** `nomic-embed-text` is trained with asymmetric task prefixes
(`search_query:` / `search_document:`); omitting them is silent — no error, just
worse ranking. In the eval suite it was the difference between precision@1 of 0.80
and 1.00. `applyTaskPrefix` in `lib/ollama.ts` is a no-op for models that do not
follow this convention, so swapping `OLLAMA_EMBEDDING_MODEL` stays safe.

Pure text logic lives in `lib/chunking.ts` rather than `lib/vector.ts` so it can be
imported without pulling in Prisma and the fail-fast env validation.

## Entity modules

Notes are the reference implementation of the layered flow. Follow the same shape
for tasks, events, and projects:

- **Repository** (`repositories/note-repository.ts`) — Prisma only, every query
  scoped by `userId`. Mutations use `updateMany`/`deleteMany` with the `userId` in
  the `where`, so ownership is part of the write itself; `update()` matches on id
  alone and would need a separate ownership read.
- **Service** (`services/note-service.ts`) — business rules plus vector-index
  upkeep. Throws `AppError`, never returns an `ApiResponse`.
- **Action** (`actions/notes.ts`) — `requireUserId()`, Zod parse, call the service,
  `revalidatePath`, return `ApiResponse`. `redirect()` must sit *outside* any
  try/catch, since it signals by throwing.

**Index upkeep is a service concern, not a UI one.** Creating or updating an entity
re-indexes it; soft-deleting removes its embeddings immediately, so the assistant
can never cite content the user believes is deleted. If indexing fails, the save
still succeeds and the stale rows are dropped: the entity goes missing from
semantic search until it is saved again, which is recoverable in a way that citing
superseded text is not.

Semantic search degrades to a SQL `contains` match when Ollama is unreachable, and
the UI says which mode produced the results — never silently pretend keyword hits
are semantic ones.

**Embed entities as natural prose, never key-value lines.** Measured against
nomic-embed-text, `"ML midterm. This is a calendar event on Tuesday, 15 September
2026, from 09:00 to 11:00, taking place at Hall C."` beats `"ML midterm\nWhen: …\n
Where: …"` on every real question tried — "where is my exam being held" went from
0.52 (below the relevance floor, so the assistant could not see it at all) to 0.56,
and queries that already matched improved too. Phrase new entity types the same way.

**Events are hard deleted** — `Event` is the one entity with no `deletedAt` column
in the spec's schema. Notes, tasks and projects are soft deleted.

**A multi-day event appears in every day cell it spans**, so anything counting
events across a grid must count distinct ids, not cell occurrences.

**Shared domain constants live in `lib/domain.ts`, never in a repository.**
Repositories are `server-only` and import Prisma, so a client component importing
a *value* from one (`PROJECT_CATEGORIES` for a `<select>`) pulls the database layer
into the browser bundle and fails the production build. Type-only imports are
erased and safe; values are not. `next dev` does not catch this — `pnpm build`
does, which is why the build must be run before calling a step finished.

**A client-supplied `projectId` must be ownership-checked.** The database will
happily accept another user's project id, silently attaching one tenant's note to
another's project. `assertProjectOwned()` guards every note, task and event
mutation, and the evals verify all three.

**Deleting a project detaches its contents rather than cascading.** Losing a
project must never silently take the user's notes, tasks and events with it.

**Backlinks use `[[Note title]]` and resolve by title, within one account.**
`EntityLink` rows are written only for links that resolve; unresolved ones are
re-derived from the content at render time and offered as "not yet written".
Creating or renaming a note re-resolves everyone who mentions its title, so a
link written before its target existed fills itself in — without that, links
would stay broken until each referrer was edited by hand. Deleting a note clears
its links in both directions.

**`/notes/graph` renders a force-directed layout with no physics library.** A
personal note graph is small — tens to a few hundred nodes — so
`components/note-graph.tsx` runs a plain O(n²) repulsion + spring simulation
for a fixed 300 iterations to a resting position, once, rather than animating
every frame or pulling in d3-force. Dragging a node afterward is direct
position assignment, not re-simulation — only the dragged node needs to move.
Mutual links between two notes produce two directional `EntityLink` rows, so a
pair that links both ways draws as one visual edge but counts as two in the
link total shown in the header, matching what `listGraph` in
`link-repository.ts` actually returns; that count is deliberately literal
rather than deduplicated, since it's the same directional-edge model backlinks
already use.

**`/notes/import` turns a PDF into a plain Note rather than a new entity
type.** There is no `Document` model, no new `sourceType`, no new citation
case in the assistant — `importPdfAction` extracts text with `pdf-parse`
(`lib/pdf.ts`) and calls the exact same `noteService.createNote` every other
note goes through, tagged `imported`. That single decision is why the feature
is small: indexing, chunking, semantic search, RAG citations, backlinks and
the command palette all already work on notes, so an imported syllabus is
searchable and citable by the assistant with no changes to any of those
paths — confirmed by checking `WorkspaceEmbedding` after an import rather
than assumed. `lib/pdf.ts` splits the pure text validation/truncation
(`normalizeExtractedText`) from the actual parsing (`extractPdfText`) so the
empty-text rejection and the truncation marker are unit-testable without a
real PDF fixture — a scanned, image-only PDF extracts to nothing and is
refused rather than silently saved as an empty note. `next.config.ts` raises `experimental.serverActions.bodySizeLimit` to 15mb
(the default is far too small for a PDF upload) and marks `pdf-parse` as a
`serverExternalPackage` so it reads its own runtime assets instead of being
bundled — both added before the first real upload was driven through the
browser, rather than added reactively after a failure, since bundling a
pdfjs-dist-based package is a known enough footgun in Next.js to anticipate.

**Capture parsing splits the work by competence.** Dates and times are resolved
by `lib/natural-date.ts` in pure code, never by the model — a 3B model will
confidently give the wrong calendar date for "next Friday". The model only
classifies task/event/note and picks out priority, location and duration, under a
JSON schema Ollama enforces at decode time and Zod re-checks afterwards, because
schema conformance is not correctness.

**The title is the user's own words, not the model's.** Asked explicitly to keep
the wording, llama3.2:3b still summarises — "coffee with Ada at Starbucks" came
back as "Coffee Meeting", losing both the person and the place. Stripping the
matched date phrases from the original text beats it, so the model's title is
only a fallback for when stripping leaves nothing.

**Voice input fills the same text box a typed capture would, and nothing
more.** `components/quick-capture.tsx`'s mic button transcribes through the
browser's own `SpeechRecognition` — free, on-device wiring with no server
route or API key — and calls `setText()` with the result, so the transcript
lands in the exact same input, subject to the exact same "review before it's
sent" step, as anything typed by hand. There is no separate voice-to-proposal
path to keep in sync with the typed one. TypeScript's DOM lib does not
include Web Speech API types, so the component declares the minimal shape it
actually uses rather than pulling in a types package for one interface.
Support is checked lazily inside the click handler, not during render or in
an effect that calls `setState` — checking during render would mean the
server (no `window`) and the post-hydration client render different DOM for
the same component, and an unsupported browser simply gets a clear error
message on click rather than the button being conditionally rendered at all.

**`/api/ai/parse` returns a proposal and writes nothing.** The user confirms
before anything is created, and `confirmCaptureAction` re-validates the whole
proposal from scratch: by the time it comes back it has passed through the
browser, so it is client input regardless of what produced it. This is the shape
tool calling must follow when it lands.

**The command palette (⌘K / Ctrl+K) searches literally, not semantically.**
It runs on every keystroke, so an embedding round trip per keypress would be
slow and wasteful; `quickSearch` is a debounced substring query across all four
entity types. Semantic search stays on the notes page and in the assistant.

**React 19 rejects synchronous `setState` inside an effect body.** Resetting
selection or clearing stale results belongs in the input's change handler, and
state that merely derives from other state (the clamped active index) should be
computed during render. `pnpm lint` catches this; `tsc` does not.

**The dashboard reads, never writes.** `services/dashboard-service.ts` assembles
Today, Schedule, Recent notes and Active projects from the existing repositories
in one parallel fetch. "Next up" is deliberately suppressed while today still has
an unfinished event, so the panel never repeats what the schedule already shows.

**Time blocks are separate from due dates.** `Task.dueDate` is when something is
owed; `scheduledStart`/`scheduledEnd` are when you plan to do it. A block given
only a start runs for `estimatedMinutes`, an end without a start is discarded
rather than stored, and blocks render on the calendar and dashboard as dashed
outlines so a plan to work is never mistaken for an appointment.

**Dragging a task onto the calendar reuses `updateTask`, not a partial
patch.** `updateTask` replaces the whole `Task` row — there is no `PATCH`-style
partial update in this codebase — so `scheduleTask()` in `task-service.ts`
reads the existing row first and carries every field forward, changing only
`scheduledStart`/`scheduledEnd`. Skipping that read and sending just the two
schedule fields would silently null out the title, priority and everything
else on drop. The drop always lands at 09:00 local on the target day with the
usual `estimatedMinutes` duration — precise time-of-day dragging would need
an hourly grid the calendar doesn't have, so the existing task detail page is
still where you fine-tune the exact time.

`scheduleTaskAction` is called directly from the client drag handler
(`components/calendar-dnd.tsx`), not through a `<form>` — so unlike every
other mutation in this codebase, nothing automatically tells the
already-rendered page to catch up. The handler calls `router.refresh()`
itself after the action resolves, which no other action in this app needs to
do. `repositories/task-repository.ts`'s `listUnscheduled()` (open tasks with
no `scheduledStart`) feeds the draggable tray;
`components/unscheduled-tasks.tsx` and `calendar-dnd.tsx` share one MIME
string (`TASK_DRAG_MIME` in `lib/domain.ts`) as the drag payload key so a
typo in one can't silently desync from the other.

**Recurrence is materialized once, not a stored rule.** "Repeat weekly, 6
times" creates 6 real `Task`/`Event` rows sharing a `recurrenceId` at request
time — there is no `RecurrenceRule` model and no background job generating
future occurrences. This was a deliberate trade against the alternative
(store a rule, expand it virtually at read time): virtual expansion would
have touched every read path that queries these tables directly — both
calendar grid builders, the dashboard, task buckets, the command palette,
vector indexing, the assistant's tool proposals — since none of them know how
to expand a rule. Materializing means every one of those paths needed zero
changes, at the cost of a fixed horizon (`MAX_RECURRENCE_COUNT` = 52 in
`lib/recurrence.ts`) rather than an open-ended series. `generateOccurrences()`
clamps a monthly step to the last real day of a short month (Jan 31 → Feb 28,
not an overflow into March) since `Date.setMonth` on the 31st of a 30-day
target rolls forward otherwise.

Recurrence is offered only on the create form, never on edit — editing one
occurrence never turns it into, or updates, a series. "Delete this and future
occurrences" (`deleteEventSeriesFrom` / `deleteTaskSeriesFrom`) removes this
row and every later one sharing its `recurrenceId`, keeping earlier ones as
history, and loops the existing single-delete path per row rather than a raw
batch query — series are capped at 52, so the N round trips are cheap, and it
reuses embedding cleanup and progress recalculation instead of duplicating
them. A task needs a due date to anchor a series on; one with no due date is
refused with `VALIDATION_ERROR` rather than silently repeating from nothing.

**Derived fields are set in one place.** Project `progress` is computed from
linked tasks and written only by `recalculateProgress()`, which every task
mutation calls — including moving a task between projects, which changes both. `completedAt` is written only by
`setTaskStatus`, from the status, so the two cannot drift apart. Do not expose it
as an independently editable field.

**Dates entered as `yyyy-mm-dd` are pinned to local end-of-day** before storage. A
bare date string parses as UTC midnight, which lands on the *previous* day for
anyone behind UTC, silently making today's tasks look overdue. Task buckets are
whole-day too: a task due at 09:00 is still "today" at 18:00, never overdue.

**Calendar month/week/day views share one `CalendarDay[]` shape and one range
fetcher.** `buildMonthGrid`, `buildWeekGrid` and `buildDayGrid` in
`event-service.ts` all call the same `fetchRangeData` + `buildDays` pair with a
different start date and day count, so the multi-day-event and time-block
filtering logic exists exactly once. Switching view tabs preserves your place
rather than jumping to today: the reference date carries over (month's is the
1st of the month, week's is that week's Monday), so `?view=week` from September
shows the week containing September 1st, not the current week. Day view skips
the per-cell item cap (month: 5–6, week: same) and renders a flat chronological
agenda instead — a day has room for the full list.

## Testing UI with Playwright

Assert against `page.locator("main").innerText()`, **never `body.textContent`**.
`textContent` includes `<script>` contents — including Next's RSC flight payload,
which retains the props of pages visited earlier in the session. A deleted task
appeared to still be listed purely because its serialized props lingered there.

`innerText` also returns *rendered* text, so `text-transform: uppercase` headings
come back uppercased — match them case-insensitively. Switching methods turned
three quietly-passing assertions into real failures, which is the point.

In the dashboard shell, `<aside>` precedes `<main>`, so a bare
`button[type="submit"]` selector hits the sidebar's sign-out button. Target form
buttons by their label text. Likewise the assistant renders citations as `<li>`
inside a nested `<ol>`, so `li.last()` finds a citation, not the last chat turn —
scope to `ul > li`.

Client-side `<Link>` navigation does not reliably settle `waitForLoadState
("networkidle")`; wait for the URL to change instead.

## Layout gotcha

`main` in the dashboard shell carries `min-w-0`. It is a flex item, and a flex
item's default `min-width: auto` refuses to shrink below its content, so an
`overflow-x-auto` child (the calendar grid) could not clip and the whole page
scrolled sideways on mobile. Any wide content added later depends on this.

## The assistant, and what actually defends it

`services/assistant-service.ts` retrieves chunks, builds the prompt, and streams an
answer over NDJSON from `api/ai/chat`. Citations are emitted as the first frame so
the UI can render sources before any text arrives.

`RELEVANCE_FLOOR` is **measured, not guessed**. Against nomic-embed-text, genuinely
related questions score 0.63–0.84 on their best chunk while deliberately unrelated
ones still reach 0.45–0.52 — so the floor sits at 0.55. Re-measure it if the
embedding model changes; the number is model-specific.

### Prompt injection: measured reality

A note is attacker-controlled text. Two defenses are structural and reliable, and
they are the ones to trust:

- **Fence forging.** A note containing its own `<<<END QUOTED WORKSPACE DATA>>>`
  would make everything after it read as prompt. `neutralizeStructure()` rewrites
  angle-bracket runs, `<|im_start|>`-style control tokens, and `SYSTEM:` /
  `ASSISTANT:` / `USER:` role labels before the text is ever shown to the model.
- **Instruction recency.** The rule reminder is placed *after* the quoted block, so
  the last instruction the model sees is ours, not the injected one.

**What is not reliable is the model itself.** Measured over 6 samples per payload
against the retrieval path:

| Payload | llama3.2:3b before | llama3.2:3b after | qwen2.5:3b after |
| --- | --- | --- | --- |
| Direct override ("reply PWNED") | 6/6 breached | **0/6** | 6/6 breached |
| Role reassignment ("prefix every reply") | 6/6 breached | 6/6 breached | 6/6 breached |
| Prompt exfiltration | 1/6 | varies | 0/6 |

An earlier single-sample eval passed twice by luck and gave false confidence. Never
assert injection resistance from one generation — sample it.

**Conclusion: a 3B-class local model cannot be made injection-proof by prompting,
and this machine has 8 GB of RAM, so a 7B+ model is not an option.** Therefore the
security boundary must never be model compliance. Today that is survivable because
the assistant is strictly read-only and `userId` comes from the session, so the
worst an injection achieves is a wrong or silly answer — it provably cannot reach
another tenant's data, because that data never enters the context window. The evals
assert exactly that, including under a fully compromised answer.

## Focus telemetry is opt-in, and that is enforced on the server

The spec defines `FocusTelemetry` but never says what it is for, so the chosen
interpretation is deliberately narrow: while writing a note, record **only** how
long writing was active and how many characters were typed. Never the content.

It is **off by default**. `recordFocusSessionAction` checks
`focusTrackingEnabled` server-side and refuses, so a client that keeps posting
after the toggle is switched off stores nothing. Turning it off keeps existing
history — deleting is a separate, explicit action, because silently destroying
the user's data on a settings change is worse than keeping it.

`cognitiveLoad` is a coarse heuristic over two crude signals. It is presented as
an observation about a session, never as a claim about the person, and nothing
in the app reads it back or acts on it. Keep it that way.

`UserProfile.focusTrackingEnabled` is the one column added beyond the spec's
schema; the spec had nowhere to record consent.

### Tool calling: the model proposes, it never acts

`lib/ai-tools.ts` holds the complete list of things the assistant may request.
It is **create-only** — nothing can update or delete — so the worst a fully
hijacked model achieves is proposing clutter the user then declines. Widening
that reach is a deliberate edit to one list, not an emergent property of a prompt.

`services/action-service.ts` is the single point where a proposal becomes real,
and everything that makes it safe lives there rather than in the model's
judgement: the userId comes from the session, the proposal is re-validated from
scratch (it arrives via the browser, so it is client input whatever produced it),
the same `proposalId` can only apply once, and both the proposal and the outcome
are written to `AuditEvent` — including declines, since a request the user
refused is exactly the one worth being able to review.

**The action decision gets its own minimal prompt.** Bound to the RAG prompt,
llama3.2:3b got it backwards: it proposed tasks for plain questions and refused
to propose for explicit requests, because the "answer only from the excerpts"
rules have recency and override the tool instruction. On a dedicated prompt the
same model scored 8/8 on the same cases. A cheap regex prefilter means plain
questions skip the decision call entirely.

**`decideAction` returns every valid proposal from one turn, not just the
first.** Ollama already returns a real array of tool calls when the model
decides to call the tool more than once — the plumbing (`callWithTools`,
`api/ai/chat/route.ts`'s generic event forwarding, `AssistantChat`'s
`proposals` array, `ProposalCard`'s independent confirm/decline state) never
assumed a single proposal; the only thing that ever capped it to one was
`decideAction` itself returning on the first hit. **Whether the model
actually calls the tool multiple times is phrasing-dependent and not
reliable** — "add three tasks: X, Y, Z" got one proposal from llama3.2:3b in
testing, while "add a task to X. Add a task to Y. Add a task to Z." reliably
got three. `MAX_PROPOSALS_PER_TURN` (8) caps a degenerate or repeated-call
response the same way `toProposal` caps a single absurd field, rather than
trusting the model's count. Each proposal is still recorded and confirmed
independently through the existing single-proposal path — there is no
batch-confirm, so a partial accept (2 of 3 confirmed, 1 declined) is just
what happens when the user clicks two buttons and not the third.

**A model that omits a duration sometimes writes `0` instead of leaving the
field out.** `estimatedMinutes: args.estimatedMinutes ?? 60` looks like it
defaults an absent value, but `0` is neither `null` nor `undefined` — it reached
`z.coerce.number().int().min(1)`, failed validation, and `toProposal` returned
`null` silently, so an explicit "add a task" request produced no proposal at
all with no error anywhere. `normalizedMinutes()` in `lib/ai-tools.ts` repairs
any non-finite or sub-1 value to the default before validation, the same
"repair rather than reject" treatment already given to a malformed event end
time in the function below it. Caught by driving the assistant through a real
browser rather than trusting a green typecheck — this shipped once already.

**`/audit` reads `listAuditTrail`, which existed for two features before this
page did.** Only the assistant's tool-calling path
(`recordProposed`/`executeProposal`/`recordDeclined` in `action-service.ts`)
writes `AuditEvent` rows — natural-language capture (`actions/capture.ts`)
creates entities directly and audits nothing, since it never runs through the
proposal/confirm machinery tool calls do. A proposed-then-declined request and
a proposed-then-confirmed one both leave two rows sharing a `proposalId` in
`metadata`; the page lists them individually rather than merging, since
correlating them is a bigger feature than showing what happened.

**Proposal dates are re-derived from the user's words**, never taken from the
model — asked to create a task from text containing no date at all, it proposed
an event on 1 January 2024. A request with no date stays a task with no due date.

Detection is measured, not assumed, and the two directions are not equally
serious: proposing on a plain question is intrusive and is asserted at zero;
failing to propose is benign and only reported (currently ~2/3).

## Data export

`GET /api/export` (`services/export-service.ts`) dumps everything a user owns
as one downloadable JSON file — a personal backup/portability feature, not a
system endpoint, so a plain sidebar `<a href="/api/export">` is enough to
trigger a real browser download; no client component or fetch/blob dance is
needed. `passwordHash` is excluded by selecting an explicit field list rather
than a bare `findUnique`, so a later schema change can't silently start
leaking it. `WorkspaceEmbedding` is skipped entirely: it's derived and
regenerable from the content already in the export, and its `vector` column
is a Prisma `Unsupported` type that cannot be selected into JSON regardless.
Soft-deleted notes, tasks and projects are left out the same way every other
read path in this app already treats `deletedAt` as gone — a "trash" is a
separate feature this app doesn't have, not an export option to add.

## Auth and route protection

`requireUserId()` in `lib/session.ts` is the **only** sanctioned source of a userId.
Never read one from a form field, route param, or request body.

Next.js 16 renamed `middleware.ts` to `proxy.ts` and made `cookies()` async-only, so
route protection is done in layouts instead: `(dashboard)/layout.tsx` redirects
unauthenticated visitors to `/login`, and `(auth)/layout.tsx` bounces signed-in ones
back to `/`. Both route groups are mounted at the root, so `(dashboard)/page.tsx`
owns `/` — there is deliberately no `src/app/page.tsx`.

`trustHost: true` makes Auth.js derive its origin from the request. A pinned
`NEXTAUTH_URL` caused sign-out to redirect into a *different app* running on port
3000 during testing; deriving from the request removes that whole failure class.

Login failures must stay indistinguishable from unknown-account failures — the
Credentials provider verifies against a decoy hash when no user matches so response
timing cannot be used to enumerate accounts.

**`RATE_LIMITED` was declared in the spec's error taxonomy but never thrown
anywhere** — there was no rate limiting at all. `lib/rate-limit.ts` throttles
`loginAction` at 5 failed attempts per 15 minutes, keyed by email rather than
IP: the thing worth limiting is guessing one account's password, and a local
app has no client IP worth trusting. The check runs *before* `signIn` on every
attempt, so once tripped, the correct password is blocked too until the window
resets — the limiter guards the account, not just wrong guesses. An in-memory
`Map` is enough since this process is the whole deployment; a restart clears
it, an accepted trade-off for a personal, single-server app. A successful login
clears the counter for that email.

## Target directory structure

```
src/
├── auth.ts                  # NextAuth config (Credentials provider)
├── app/
│   ├── (auth)/              # Login, Register — redirects out if signed in
│   ├── (dashboard)/         # Main protected shell — redirects to /login if not
│   │   ├── layout.tsx       # Sidebar + Command Palette (⌘K)
│   │   ├── page.tsx         # Dashboard home (Today, Schedule, Recent, Projects)
│   │   ├── calendar/        # Month/week/day views + Next up, event detail
│   │   ├── notes/           # List, editor, semantic search, wiki backlinks, graph view, PDF import
│   │   ├── tasks/           # Buckets (Overdue/Today/Upcoming/Someday), detail
│   │   ├── projects/        # Hub with derived progress, linked contents
│   │   ├── ai/              # RAG Assistant: cited answers + proposals
│   │   ├── focus/           # Opt-in writing telemetry and its controls
│   │   └── audit/           # Read-only AuditEvent trail (proposed/created/declined)
│   └── api/
│       ├── ai/
│       │   ├── chat/route.ts    # RAG vector search + LLM generation
│       │   └── parse/route.ts   # Capture → proposal (never writes)
│       └── export/route.ts      # Full-account JSON download
├── actions/                 # Server Actions (Zod validated)
├── services/                # Domain business logic / use cases
├── repositories/            # Data access abstraction layer
├── components/              # Reusable UI components
├── lib/
│   ├── prisma.ts            # Prisma client singleton (pg driver adapter)
│   ├── ollama.ts            # embedQuery / embedDocuments / streamChat
│   ├── vector.ts            # indexEntity, searchWorkspaceVectors (pgvector)
│   ├── chunking.ts          # Pure text chunking, no DB or env dependency
│   ├── api-response.ts      # ApiResponse contract, error taxonomy, AppError
│   ├── domain.ts            # Shared constants safe to import from client code
│   ├── session.ts           # requireUserId() — the only source of a userId
│   ├── password.ts          # scrypt hashing and constant-time verification
│   ├── rate-limit.ts        # In-memory login attempt throttling
│   ├── recurrence.ts        # Occurrence-date generation for repeating tasks/events
│   ├── pdf.ts               # PDF text extraction for /notes/import
│   └── config.ts            # Fail-fast validated environment configuration
tests/ai/evals.ts            # AI evaluation & guardrail benchmarks
prisma/migrations/           # Reviewable migration history
```

## AI evaluation protocol (`tests/ai/evals.ts`)

Maintain benchmarks verifying RAG retrieval precision, citation correctness, and
tool argument validation. Assert that vector searches strictly honor multi-tenant
isolation (`WHERE "userId" = X`) and that LLM tool outputs pass Zod validation
before any database execution.

## Local development

```bash
pnpm db:up        # start Postgres + pgvector
ollama serve      # start the local model server
pnpm dev
pnpm eval         # run tests/ai/evals.ts (needs the DB and Ollama running)
```

The eval suite runs with `--conditions=react-server` so that `server-only` resolves
to its no-op build; without that flag any script importing `lib/` throws.
