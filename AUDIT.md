# Wellness App — Repository Audit

*Audit date: 2026-06-12 · Auditor: Claude Code (Fable 5) · Scope: full repo at commit `eb6dc34`*

## 1. Executive Summary

**Overall health: B− (good prototype, with a few real correctness risks).** This is a single-user, localhost AI demo app — ~470 lines of Express + four static HTML pages — and at that maturity it's in decent shape: 36 passing unit tests around the fragile parsing logic, clean ESLint, secrets correctly gitignored, and a consistent dual-provider AI pattern. **Top 3 risks:** (1) a silent data-loss path — a corrupted JSON file is swallowed and overwritten on the next write, erasing all history; (2) both docs (README and CLAUDE.md) materially contradict the code, which is unusually costly here because CLAUDE.md drives AI-assisted development; (3) all AI endpoints are unauthenticated and unmetered, which is fine on localhost but becomes an open API-budget faucet the day this is deployed. **Top 3 opportunities:** a CI workflow is a 30-minute add that makes the existing tests actually enforce anything; atomic file writes plus parse-failure quarantine removes the data-loss class entirely; fixing the swallowed SSE error events would stop AI failures from manifesting as "typing dots forever."

## 2. Repo Map

**Purpose:** AI-powered corporate wellness demo — generates challenge plans via Claude (or local LM Studio), parses them into trackable habit goals, tracks daily logs, matches users to canned programs, and offers two chat personas (Sage/mental health, Nori/nutrition).

**Stack:** Node 18+ ESM, Express 4, Anthropic SDK (with prompt caching) + OpenAI SDK (LM Studio compat only), vanilla HTML/JS + Tailwind CDN + marked CDN, flat-JSON storage. No build step, no CI, no deployment config — runs on localhost.

| Path | What it is |
|---|---|
| [server.js](server.js) | Entire backend: 16 routes, AI calls, SSE streaming, file I/O (469 lines) |
| [helpers.js](helpers.js) | Pure functions: plan parsers, log totals, goal matching, ICS generator |
| [test/helpers.test.js](test/helpers.test.js) | 36 unit tests over helpers (all passing) |
| [public/index.html](public/index.html) | "/" — Daily Tracker + both chat widgets + Zendesk (1084 lines, largest file) |
| [public/challenge-builder.html](public/challenge-builder.html) | Plan generator with streaming render |
| [public/challenges.html](public/challenges.html) | Saved-challenge history / re-activation |
| [public/advisor.html](public/advisor.html) | Program advisor (AI match + hardcoded chip presets) |
| `data/` | Gitignored flat JSON files, auto-created at startup |

**Surprises found during discovery:** the README's page table describes a routing layout that doesn't exist (`/tracker.html` is referenced; `/` is described as the Plan Builder when it's actually the Tracker); CLAUDE.md claims "no test suite or linter is configured" while both exist and pass; `.claude/comands/` is a misspelled directory (should be `commands`), so `ship.md` there is likely dead config; and `.env` contains a plaintext third-party account password in its comments (not committed — verified via `git ls-files` — but worth moving to a password manager).

## 3. Audit Report

### Correctness & code quality

**C1 — Corrupt data file ⇒ silent total data loss. HIGH (fact).**
`readLogs()` catches any parse error and returns `[]` ([server.js:86-89](server.js#L86-L89)); the next `POST /api/log` then writes `[] + one entry` back ([server.js:300-302](server.js#L300-L302)), permanently erasing all history. Same pattern for challenges ([server.js:95-98](server.js#L95-L98)). Combined with non-atomic `writeFileSync` (a crash mid-write leaves truncated JSON), one bad write destroys the dataset whose preservation is the app's whole job. The catch should distinguish "file missing" from "file corrupt" and quarantine, not default to empty.

**C2 — UTC date bucketing puts evening logs on the wrong day. MEDIUM (fact).**
Log dates are stamped with `new Date().toISOString().slice(0, 10)` ([server.js:297](server.js#L297)) and "today" is filtered the same way ([server.js:311-314](server.js#L311-L314)). The git author works in UTC−4: anything logged after 8 p.m. local gets tomorrow's date and vanishes from the tracker until the next UTC day. The same idiom is used ~8 more times across server and pages.

**C3 — SSE error events are swallowed by the partial-chunk catch. MEDIUM (fact).**
The server reports mid-stream AI failures as `data: {"error": ...}` ([server.js:175](server.js#L175), [server.js:458](server.js#L458)). On the client, `if (error) throw new Error(error)` sits inside the same `try` whose catch is `catch { /* partial chunk */ }` ([index.html:974-987](public/index.html#L974-L987), [challenge-builder.html:560-569](public/challenge-builder.html#L560-L569)). Net effect: a chat error leaves the typing indicator up forever and pushes an empty assistant turn into history ([index.html:990](public/index.html#L990)); a generation error leaves a blinking cursor and no action footer.

**C4 — SSE frames split across network chunks are dropped. MEDIUM-LOW (fact).**
Both stream readers call `decoder.decode(value)` without `{stream: true}` and split on `\n` with no carry-over buffer ([index.html:965-969](public/index.html#L965-L969), [challenge-builder.html:534-552](public/challenge-builder.html#L534-L552)). A `data:` line straddling two reads fails `JSON.parse` and is silently discarded; a multi-byte emoji split across chunks garbles. Intermittent, invisible text loss.

**C5 — Triplicated logic across server and pages. MEDIUM (fact + judgment).**
`computeLogTotals` and the goal-matching regex chain exist twice ([helpers.js:44-65](helpers.js#L44-L65) vs [index.html:781-790](public/index.html#L781-L790), [index.html:857-867](public/index.html#L857-L867)), and the MARKETPLACE catalog exists twice ([server.js:61-72](server.js#L61-L72) vs [advisor.html:92-103](public/advisor.html#L92-L103) — the comment admits "mirrors server.js"). The matching logic is the app's most-likely-to-be-tweaked code; copies will drift.

**C6 — `durationToDays` knows only three durations. LOW (fact).**
[helpers.js:38-42](helpers.js#L38-L42) maps everything except "3 day"/"2 week" to 7. Consistent with the builder's three options ([challenge-builder.html:251-253](public/challenge-builder.html#L251-L253)), but a "30 days" duration silently becomes a 7-day challenge — and [helpers.test.js:89](test/helpers.test.js#L89) enshrines that as intended. Fragile if marketplace programs ever become activatable.

**C7 — Minor:** `submitLog` doesn't check `res.ok`, so a 400 pushes `undefined` into `todayLogs` and `renderFeed` throws ([index.html:740-744](public/index.html#L740-L744)). Deleting a challenge doesn't deactivate it if it's the current plan ([server.js:344-347](server.js#L344-L347)). `Date.now().toString()` IDs can collide in theory ([server.js:198](server.js#L198)).

### Security

Calibrated to "localhost prototype" — most of these only become serious if deployed.

**S1 — No auth or rate limiting on AI-spend endpoints. HIGH if ever deployed, LOW today (fact).**
`/api/generate`, `/api/chat`, `/api/marketplace-match` ([server.js:110](server.js#L110), [server.js:383](server.js#L383), [server.js:425](server.js#L425)) are open; `/api/chat` forwards an arbitrary client-supplied `messages` array of unbounded length straight to the Anthropic API ([server.js:444-448](server.js#L444-L448)). Anyone who can reach the port can spend the API budget. Don't fix with auth now — fix by making the deployment decision explicit (Open Question 1) and capping history length server-side regardless.

**S2 — Unsanitized HTML sinks. MEDIUM (fact).**
`marked.parse()` output (marked does not sanitize) goes straight into `innerHTML` ([challenge-builder.html:564](public/challenge-builder.html#L564), [challenges.html:248](public/challenges.html#L248)); AI-supplied `intro`/`reason` strings are interpolated raw ([advisor.html:244](public/advisor.html#L244), [advisor.html:257](public/advisor.html#L257)); user-typed log labels and parsed challenge names too ([index.html:882](public/index.html#L882), [challenges.html:218](public/challenges.html#L218)). Today this is self-XSS against the sole user; it becomes stored XSS the day a second user exists. One DOMPurify CDN script closes the markdown sinks.

**S3 — Secrets hygiene: mostly good, two notes. LOW (fact).**
`.env` is gitignored and was never committed (verified). But (a) two retired Zendesk *widget* keys live in git history (commits `0e9d8bd`, `eb6dc34`) — widget keys are public by design, so this is informational; (b) `.env` comments contain a plaintext Zendesk account password — move it to a password manager; dotenv files get copied around.

**S4 — Dependency vulnerabilities. LOW (fact).**
`npm audit`: 2 moderate (`qs` DoS via express 4.22.1, GHSA-q8mj-m7cp-5q26); `npm audit fix` resolves it. Also notably outdated: `@anthropic-ai/sdk` 0.54 vs 0.104, `openai` 4.x vs 6.x — both currently work, low urgency.

**S5 — Unpinned CDN scripts, no SRI. LOW (fact).**
`cdn.tailwindcss.com` (explicitly "not for production" per Tailwind) and unversioned `marked` ([index.html:10](public/index.html#L10), [challenge-builder.html:10-11](public/challenge-builder.html#L10-L11)). Acceptable for a prototype; pin versions when convenient.

### Testing

**T1 — Helper coverage is genuinely good (strength).** 36 tests, all asserting behavior (parsing edge cases, fallback chains, ICS date math), not mere execution. This is exactly the right code to have tested — CLAUDE.md itself notes the parsers "break silently."

**T2 — Zero route coverage; the hairiest untested logic is the progress math. MEDIUM (fact).**
The day-by-day points loop and elapsed/remaining calculations in [server.js:230-290](server.js#L230-L290), and the endDate arithmetic in [server.js:185-189](server.js#L185-L189), have no tests. They're also where C2's timezone fix will land — a fix with no regression net. Blocker: `app` and `app.listen` are fused, so the server can't be imported by a test ([server.js:463-469](server.js#L463-L469)).

**T3 — No CI. MEDIUM (fact).** Tests and lint exist but nothing runs them; no `.github` directory. The safety net is currently voluntary.

### Performance

Healthy for the actual workload — one user, small files. Sync `readFileSync` on every request, full-file rewrites, O(days×logs) progress recompute, and unbounded `logs.json` growth are all real ([server.js:86-102](server.js#L86-L102)) and all fine at this scale. **Recommendation: don't fix.** A database migration would be the classic over-engineering trap here; atomic writes (C1) are the only storage change worth making.

### Dependencies

Lean and appropriate (4 runtime deps); lockfile committed. The `openai` package exists solely for LM Studio compatibility — a judgment call worth revisiting (Open Question 3). Audit/outdated findings covered in S4.

### DevEx & Documentation

**D1 — README contradicts the code. MEDIUM (fact).**
The pages table ([README.md:67-71](README.md#L67-L71)) says `/` is the Plan Builder and lists `/tracker.html`, which doesn't exist; in reality `/` is the Tracker and the builder is `/challenge-builder.html`; `/challenges.html` is absent. The API table omits the five `/api/challenges*` routes and `/api/challenge-progress`; the data-files table omits `challenges.json`.

**D2 — CLAUDE.md contradicts the code. MEDIUM (fact, disproportionately costly).**
"No test suite or linter is configured" — both exist since commit `1525f5c` and pass. "Three standalone HTML pages" — there are four. Storage list omits `challenges.json`. Since CLAUDE.md is injected into every AI coding session, these errors actively steer future work wrong (e.g., an agent might re-add a test framework or skip running the suite).

**D3 — Misc:** `.claude/comands/` is misspelled, so `ship.md` there is likely never loaded (fact: directory listing). `npm stop` uses `pkill -f 'node server.js'`, which kills any matching process machine-wide (low). The advisor's "Start →" buttons have no click handler — dead UI ([advisor.html:272-274](public/advisor.html#L272-L274)) (fact; product intent unclear).

### Strengths (preserve these)

- **Pure-helper extraction + real tests** — the riskiest code (regex parsers over LLM output) is isolated and tested. Keep new parsing logic in [helpers.js](helpers.js).
- **Consistent AI dual-provider pattern** with correct prompt caching (`cache_control: ephemeral` on system blocks, [server.js:163](server.js#L163), [server.js:446](server.js#L446)).
- **Defensive parsing fallbacks** — `parseChallengeName`'s three-tier fallback ([helpers.js:23-36](helpers.js#L23-L36)) is the right posture for LLM output.
- **Secrets discipline** — `.env` and `data/` gitignored from early on; widget key moved out of source.
- **No-build-step simplicity** — appropriate for the project's size; don't add a bundler.

## 4. Improvement Strategy

**Theme 1 — Make the dev contract true again (D1, D2, D3).**
Target: README and CLAUDE.md describe the code as it is; `.claude/commands` spelled correctly. Principle: stale docs are worse than no docs, and here they feed AI tooling directly. Done signal: every route in the README table resolves; CLAUDE.md's claims are verifiable against the repo.

**Theme 2 — Data durability for the flat-file store (C1).**
Target: a `kill -9` or corrupt file loses at most the in-flight write, never history. Principle: a tracker's one job is not losing the log. Trade-off: stay on flat files — no SQLite, no async refactor; just temp-file+rename writes and quarantine-on-parse-failure. Done signal: a test that corrupts `logs.json`, POSTs a log, and asserts the old file was preserved as `logs.json.corrupt-<ts>`.

**Theme 3 — Honest streaming (C3, C4).**
Target: AI errors surface as a visible message; no silent text loss. Principle: a failure the user can see beats a hang they can't diagnose. Done signal: killing the API key mid-session produces an error bubble in chat and an error state in the builder, not eternal typing dots.

**Theme 4 — Safety net before further development (T2, T3).**
Target: CI runs lint + tests on every push; the progress/date math has regression tests before the timezone fix touches it. Done signal: CI badge green; a deliberately broken `durationToDays` fails CI.

**Theme 5 — Calibrated hardening (S1, S2, S4).**
Target: `npm audit` clean; markdown sinks sanitized; chat history capped server-side. Explicitly **not** fixing: auth, rate limiting, CORS, HTTPS — premature until a deployment decision exists; sync I/O and JSON storage — right-sized for one user; SDK major-version upgrades — working code, low payoff.

## 5. Task Plan

### Milestones & tasks

| # | Task | Effort | Risk | Deps | Milestone |
|---|---|---|---|---|---|
| 1 | GitHub Actions CI: `npm ci && npm run lint && npm test` | S | none | — | **M0** |
| 2 | Extract `app` from `server.js` listen call; add route tests for `/api/challenge-progress` + `/api/save-plan` date math | M | low | 1 | **M0** |
| 3 | Atomic writes + corrupt-file quarantine in the four read/write helpers | S | low | 2 | **M1** |
| 4 | `npm audit fix` (express/qs) | S | low | 1 | **M1** |
| 5 | Local-date helper replacing all `toISOString().slice(0,10)` date-bucketing (server + pages) | M | medium (changes "today" semantics; needs task 2's tests first) | 2 | **M1** |
| 6 | Fix SSE clients: buffered line parsing + surface error events (both pages) | M | low | — | **M1** |
| 7 | DOMPurify around `marked.parse()`; escape text interpolations in log feed / challenge list / advisor cards | S | low | — | **M2** |
| 8 | Rewrite README pages/API/data tables; correct CLAUDE.md (tests exist, four pages, challenges.json); rename `.claude/comands` → `commands` | S | none | — | **M2** |
| 9 | De-duplicate: serve `helpers.js` to the browser as an ES module; advisor fetches `/api/marketplace` instead of mirroring the catalog | M | medium (touches all pages) | 2 | **M2** |
| 10 | Cap `/api/chat` history length and validate message shape server-side | S | low | — | **M2** |
| 11 | Pin CDN versions; guard `submitLog` on `res.ok`; deactivate current plan when its challenge is deleted | S | low | — | **M3** |
| 12 | Wire up or remove advisor "Start →" buttons (needs product decision, OQ4) | S–M | low | OQ4 | **M3** |

**Quick wins (high impact, S effort):** Task 1 (CI), Task 3 (atomic writes), Task 4 (audit fix), Task 8 (docs truth). Roughly half a day total, and they retire the two top risks.

### Implementation sketches — top 3

**Task 3 — Atomic writes + quarantine.**
Add two helpers in [server.js](server.js): `writeJsonAtomic(file, data)` → write to `${file}.tmp` then `renameSync` (atomic on same filesystem); `readJsonSafe(file, fallback)` → on `ENOENT` return fallback; on parse error, `renameSync(file, file + '.corrupt-' + Date.now())`, log loudly, return fallback. Replace the four readers/writers ([server.js:86-102](server.js#L86-L102)) and the direct `writeFileSync(PLAN_FILE, ...)` calls ([server.js:191](server.js#L191), [server.js:356](server.js#L356)). Gotcha: the startup initializers ([server.js:33-37](server.js#L33-L37)) write `'null'` into `current-plan.json` — `JSON.parse('null')` succeeds and returns `null`; the existing routes rely on the subsequent property access throwing, so preserve that behavior or make the fallback explicit.

**Task 6 — SSE client fix.**
In both readers, keep a `buffer` string: `buffer += decoder.decode(value, { stream: true })`; split on `\n`, keep the last partial element back in `buffer`. Then separate the two failure modes that are currently conflated: parse the JSON inside try/catch (partial-frame tolerance), but handle `payload.error` *outside* it — remove the typing bubble / cursor and render an error bubble. In chat, also skip the `chatHistory.push({role:'assistant', content: ''})` when `aiText` is empty ([index.html:990](public/index.html#L990)) — an empty assistant turn will make the Anthropic API reject the *next* request. Since there's no build step, either duplicate the ~20-line reader in both pages (acceptable) or add `public/js/sse.js` with a plain `<script src>` tag.

**Task 2 — Route tests.**
Split [server.js](server.js): export `app` and guard `app.listen` behind `if (process.argv[1] === fileURLToPath(import.meta.url))` so importing doesn't bind the port. Tests use Node's built-in `node:test` + `fetch` against `app.listen(0)` (no supertest dependency needed). Point `DATA_DIR` at a temp dir via env var (currently hardcoded at [server.js:27](server.js#L27) — make it `process.env.DATA_DIR || join(__dirname, 'data')`). Priority cases: `save-plan` endDate for each of the three durations; `challenge-progress` on day 1, mid-challenge, post-end; the C1 corruption scenario once Task 3 lands. Gotcha: tests that touch "today" need injectable or frozen time — pass a test-only `?now=` override or accept date-relative fixtures.

## 6. Open Questions

1. **Deployment intent.** Is this permanently localhost/single-user, or headed for a deploy? This single answer flips the severity of S1 (auth/rate limiting) and S2 (XSS) from "noted" to "critical" and determines whether M2 should include an auth layer.
2. **Multi-user future.** If teammates will ever share an instance, flat-file storage and the global `current-plan.json` (one active challenge per *server*, not per user) need rethinking — currently activating a challenge overwrites everyone's.
3. **Is LM Studio support still used?** The `openai` dependency and every `if (PROVIDER === 'lmstudio')` branch exist for it. If it's vestigial, deleting it removes a dependency and halves the AI code paths.
4. **Advisor "Start →" buttons** ([advisor.html:272](public/advisor.html#L272)) do nothing, and marketplace durations ("30 days", "6 weeks") aren't supported by `durationToDays` — is program activation a planned feature or should the buttons go?
5. **Zendesk password in `.env` comments** — confirm it can be moved to a password manager and rotated; it's not in git, but plaintext credentials in dotfiles tend to travel.
