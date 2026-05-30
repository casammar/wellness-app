# Wellness Challenge Builder

An AI-powered corporate wellness platform that generates custom challenge plans, tracks daily habits, and provides personalized program recommendations.

## Features

- **Plan Builder** — Generate full wellness challenge plans (weekly milestones, habit trackers, rewards, HR tips) via streaming AI
- **Daily Tracker** — Log activities, meals, and habits; track progress against challenge goals
- **Program Advisor** — Describe your goals in plain language; AI matches you to curated wellness programs
- **AI Chat** — Two built-in companions: Sage (mental health/wellness) and Nori (nutrition coaching)
- **Calendar Export** — Download weekly milestones as an `.ics` file for Google/Apple Calendar

## Tech Stack

- **Backend:** Node.js + Express (ESM)
- **AI:** Anthropic Claude (`claude-opus-4-5`) with prompt caching; OpenAI-compatible client for LM Studio (local model support)
- **Frontend:** Vanilla HTML/JS + Tailwind CSS (CDN)
- **Storage:** JSON flat-files (`data/`)

## Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic API key (or a running LM Studio instance)

### Install

```bash
npm install
```

### Configure

Create a `.env` file in the project root:

```env
# Required for Claude (default provider)
ANTHROPIC_API_KEY=your_api_key_here

# Optional: switch to a local LM Studio model
# LLM_PROVIDER=lmstudio
# LM_STUDIO_BASE_URL=http://localhost:1234/v1
# LM_STUDIO_MODEL=your-local-model-name

# Optional: override the Claude model
# CLAUDE_MODEL=claude-opus-4-5

# Optional: change the port (default: 3000)
# PORT=3000
```

### Run

```bash
# Production
npm start

# Development (auto-restart on file changes)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Pages

| Route | Description |
|---|---|
| `/` | Plan Builder — generate and save a wellness challenge |
| `/tracker.html` | Daily Tracker — log habits and view today's progress |
| `/advisor.html` | Program Advisor — AI-matched program recommendations |

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/config` | Returns active provider and model |
| `POST` | `/api/generate` | Stream a generated challenge plan (SSE) |
| `POST` | `/api/save-plan` | Persist a plan and extract habit goals |
| `GET` | `/api/challenge-goals` | Retrieve goals from the saved plan |
| `POST` | `/api/log` | Add a daily activity/habit log entry |
| `DELETE` | `/api/log/:id` | Remove a log entry |
| `GET` | `/api/logs/today` | Get today's log entries |
| `GET` | `/api/logs/yesterday` | Get yesterday's log entries |
| `GET` | `/api/profile` | Get user profile |
| `POST` | `/api/profile` | Save user profile |
| `POST` | `/api/export-calendar` | Download weekly milestones as `.ics` |
| `GET` | `/api/marketplace` | List all available wellness programs |
| `POST` | `/api/marketplace-match` | AI-match a user goal to programs |
| `POST` | `/api/chat` | Stream a Sage or Nori chat response (SSE) |

## Data Files

All data is stored as JSON in the `data/` directory (auto-created on first run):

| File | Contents |
|---|---|
| `profile.json` | User name, age, height, weight |
| `current-plan.json` | Last generated plan text + parsed habit goals |
| `logs.json` | All daily activity log entries |

## Wellness Program Marketplace

10 built-in programs available for AI-powered matching:

- Weight Loss Challenge (30 days)
- Stress Relief & Recovery (3 weeks)
- Sleep Optimization Program (2 weeks)
- Strength & Endurance Builder (6 weeks)
- Mindfulness & Mental Clarity (30 days)
- Nutrition Reset (4 weeks)
- 10K Steps Daily Challenge (30 days)
- Team Connection Challenge (2 weeks)
- All-Day Energy Program (3 weeks)
- Heart Health Challenge (4 weeks)

## Scripts

```bash
npm start      # Start the server
npm run dev    # Start with auto-restart (node --watch)
npm run stop   # Kill the running server process
npm run restart # Stop then start
```
