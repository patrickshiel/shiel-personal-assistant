# Shiel Personal Assistant

A **local-first** personal assistant AI agent that runs on your Mac and manages calendar, Todoist, email, and Obsidian notes. Built with **LangGraph** (via LangChain.js) and **Node.js/TypeScript**.

## Features

- **Calendar** (Google): list and create events (personal/work)
- **Todoist**: list projects and tasks, add/update/complete tasks
- **Email** (Gmail): list, read, draft/send replies
- **Obsidian**: list, read, write, search notes in your vault

The agent uses a **narrow set of tools** (no shell or broad file access) and can be extended with **human-in-the-loop** approval for sensitive actions (see [RESEARCH.md](./RESEARCH.md)).

## Prerequisites

- Node.js 20+
- API keys: at least one LLM provider (OpenAI, Anthropic, or Google) and Todoist token. Optional: Google OAuth for calendar/email, Obsidian vault path.

## Setup

**First-run configuration:** see **[docs/SETUP.md](./docs/SETUP.md)** for step-by-step setup of Google Calendar, Todoist, and Obsidian.

```bash
cp .env.example .env
# Edit .env: OPENAI_API_KEY, TODOIST_API_TOKEN, OBSIDIAN_VAULT_PATH (see docs/SETUP.md)
npm install
# Optional: npm run auth-google  # then add GOOGLE_REFRESH_TOKEN to .env
```

## Run

### One-off chat

```bash
npm run dev -- "What's on my Todoist today and what calendar events do I have this week?"
```

### Long-running orchestration (background daemon)

The orchestrator is a **single long-running process** with its own **in-process task manager**. It does not use system cron; it wakes every 15 seconds, checks which triggers are due, runs them, and persists state so it knows when each trigger last ran and when to run next. You can leave it running in the background (terminal, `nohup`, or a LaunchAgent).

```bash
npm run orchestrate
```

- **State** is stored in `state/orchestrator-state.json` (last run time and last output per trigger). Survives restarts.
- **Long-term memory** is stored in `state/memory.json`. The agent receives recent memory (last 30 entries or 14 days) on every run and can **save new facts** with the `save_memory` tool (preferences, patterns, context) so future runs stay consistent.

| Trigger | Schedule | What it does |
|--------|----------|--------------|
| **calendar_check** | Every 15 min | Check for new calendar items, summarise next 7 days and conflicts |
| **tasks_update** | Every 30 min | Get Todoist update (today + overdue), summarise priorities |
| **weekly_meeting_prep** | Monday 6:00 | List week’s calendar → you add prep tasks → apply to Todoist + calendar blocks |
| **carve_priority_time** | Daily 8:00 | Find high-priority Todoist tasks and create focus blocks on the calendar |

Run a single trigger once and exit:

```bash
npm run orchestrate -- --once calendar_check
npm run carve-time   # same as --once carve_priority_time
```

**Run in background (e.g. on a Mac):**

```bash
nohup npm run orchestrate >> state/orchestrator.log 2>&1 &
# Or install as a LaunchAgent (see docs/deep-research-report.md).
```

### Meeting debrief (Spark summary + transcript)

After a meeting, feed the Spark Desktop summary and/or transcript. The agent will:

1. **Synthesise into Obsidian** — meeting note(s) that tie into your ongoing work
2. **Add action items to Todoist** — with priority where you indicate
3. **Carve calendar time** — for priority tasks (focus blocks)

```bash
npm run debrief
# Prompts for summary and transcript (paste or file path)

npm run debrief -- --summary ./path/to/summary.md --transcript ./path/to/transcript.txt
```

### Weekly meeting prep (two steps)

1. **List week’s calendar** and get a file to edit:

   ```bash
   npm run weekly-prep
   ```

   This writes `state/weekly-prep-YYYY-MM-DD.md` with the week’s events and a section for you to add prep tasks per meeting.

2. **Edit the file** under “Your prep tasks” in the format:
   - **Meeting title or date/time**: Prep task 1, Prep task 2, ...

3. **Apply** to Todoist and optional calendar blocks:

   ```bash
   npm run weekly-prep -- --apply weekly-prep-YYYY-MM-DD.md
   ```

## Project structure

- `RESEARCH.md` — Architecture, security, and integration notes (short)
- **`docs/SETUP.md`** — **First-run: Google Calendar, Todoist, Obsidian**
- `docs/deep-research-report.md` — Full threat model, connectors, phased roadmap, and macOS-specific design
- `src/agent/` — LangGraph agent and tool definitions
- `src/orchestrator/` — Trigger configs, in-process task manager, file-based state and long-term memory
- `src/cli/` — Debrief CLI
- `src/tools/` — Calendar, Todoist, email, Obsidian (Todoist and Obsidian wired; calendar/email stubs)

## Security

- Credentials live in `.env` (never committed).
- Obsidian access is limited to a single vault path.
- For production, add approval steps for send email / delete event / etc. (see RESEARCH.md).

## License

MIT
