# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Start server (production)
npm run dev        # Start with auto-restart on file changes (node --watch)
npm stop           # Kill the running server process
npm run restart    # Stop then start
```

No test suite or linter is configured.

## Architecture

The entire backend is a **single file**: [server.js](server.js). There are no modules, no controllers, no services — all routes, helpers, AI calls, and the ICS generator live there.

**Frontend** is three standalone HTML pages in [public/](public/) with inline `<script>` and `<style>` tags. Dependencies are loaded from CDN (Tailwind CSS, marked.js for markdown rendering). There is no build step — editing the HTML files is the full frontend workflow.

**Storage** is flat JSON files in [data/](data/) (`current-plan.json`, `logs.json`, `profile.json`). Files are read/written synchronously with `fs.readFileSync`/`writeFileSync` on every request.

### AI Provider Abstraction

The app supports two providers, selected by `LLM_PROVIDER` env var:
- **`claude`** (default): Anthropic SDK with prompt caching — system prompts use `cache_control: { type: 'ephemeral' }` on every streaming call.
- **`lmstudio`**: OpenAI-compatible client pointed at a local LM Studio server.

All AI routes branch on the `PROVIDER` constant with a `if (PROVIDER === 'lmstudio') { ... } else { ... }` pattern. When adding a new AI call, replicate this same dual-path pattern.

### Streaming (SSE)

`/api/generate` and `/api/chat` return Server-Sent Events. The wire format is `data: ${JSON.stringify({ text })}\n\n` for content chunks and `data: [DONE]\n\n` as the terminal event. Frontend pages read these with `EventSource` or `fetch` + `ReadableStream`.

### Plan Parsing

`parseGoals()` and `parseWeeklyMilestones()` extract structured data from the AI-generated markdown plan text using regex on section headers and pipe-delimited table rows. The **Daily Habit Tracker** table in the plan becomes the habit goals stored in `current-plan.json`; those goals power the tracker page. If the AI output format changes (section names, table columns), these parsers break silently.

### Chat Personas

`/api/chat` accepts a `chatType` field. `chatType === 'nutrition'` routes to the Nori (nutrition coach) system prompt; everything else uses Sage (mental health). Both personas use the same streaming code path.
