# Personal Assistant AI Agent — Research & Architecture

**See also:** [docs/deep-research-report.md](./docs/deep-research-report.md) — a detailed threat model, connector strategies, phased roadmap, and macOS-specific design (LaunchAgent, Keychain, local canonical store, on-device vs cloud models). The sections below align with that report and focus on how this repo implements it.

## Goal

Build a **local-first** personal assistant that runs on your Mac and manages:

- **Calendar** (personal + work): view, create, move, decline events
- **Todoist**: tasks, projects, due dates, priorities
- **Email**: read, triage, draft replies (personal + work)
- **Obsidian**: read/write notes in your vault (markdown files)

The agent should operate **independently** (like a secretary) with appropriate **safeguards** so you stay in control.

---

## Why LangGraph + Node

### LangGraph (JavaScript/TypeScript)

- **Official JS/TS support**: `@langchain/langgraph` is the same framework as the Python version — low-level orchestration, stateful graphs, human-in-the-loop, checkpointing.
- **Node-native**: Fits a Mac-only, local process; no Python runtime. You can use any LLM provider (OpenAI, Anthropic, Google, etc.) via LangChain adapters.
- **Control flow**: You define the graph (nodes = agent, tools, approval steps). Good for “tool → optional human approval → continue” patterns.
- **Durable execution**: Checkpointing lets the agent survive restarts and long runs (e.g. overnight scheduling).

### Why not OpenClaw (and how to stay safer)

OpenClaw-style agents often get broad system access (browser, desktop, shell) to “do anything.” That creates real security and safety concerns:

- Unconstrained tool set (e.g. run arbitrary commands, access any file).
- Hard to reason about what the agent can change.
- One prompt injection or bad tool call can have wide impact.

**Safer approach:**

1. **Narrow, explicit tools**  
   Only expose: Calendar API, Todoist API, Gmail/IMAP, and a **single Obsidian vault path**. No generic “run script” or “read any file” unless you add them deliberately with tight scoping.

2. **Scoped credentials**  
   Use OAuth or API tokens with minimal scopes (e.g. Calendar read/write, Gmail read/send, Todoist). No need for full Google “see everything” if you can avoid it.

3. **Human-in-the-loop for high-impact actions**  
   LangGraph supports **interrupts**: the graph can pause and ask for approval before:
   - Sending an email
   - Creating/moving/deleting calendar events
   - Deleting or archiving Todoist tasks  
   You can auto-approve low-risk reads and only require approval for writes/destructive actions.

4. **Local execution only**  
   Run the agent on your laptop; credentials and data stay on your machine. LLM calls go to the provider (OpenAI/Anthropic/Google); no need to send calendar/email/task content to third parties beyond the LLM provider you choose.

5. **Audit log**  
   Log every tool call (and optionally approvals) to a local file or SQLite so you can review what the agent did.

---

## Data Sources & Integrations

| Domain    | Option 1 (recommended)     | Option 2              | Notes |
|----------|----------------------------|------------------------|-------|
| Calendar | Google Calendar API        | Microsoft Graph (O365)  | OAuth2; separate tokens for personal vs work if different accounts. |
| Email    | Gmail API                  | IMAP + SMTP (e.g. Nodemailer) | Gmail: OAuth2, labels, search. IMAP: any provider, local-only. |
| Tasks    | Todoist REST API v2        | —                      | `@doist/todoist-api-typescript`; token from Todoist Integrations. |
| Notes    | Obsidian vault (filesystem)| —                      | Vault = folder of `.md` files; read/write with `fs`; optional frontmatter/YAML. |

### Obsidian

Obsidian is just markdown in a folder. Your agent can:

- **Read**: list notes, read file contents, search by filename or content.
- **Write**: create/append to notes, update frontmatter, create daily notes.
- **Scope**: pass one vault path (e.g. `~/Documents/ObsidianVault`) and only allow access under that path to avoid touching other files.

No special Obsidian API required — use Node `fs`/`path` and optionally a markdown/frontmatter parser.

---

## Recommended Architecture (LangGraph + Node)

### High-level

```
┌─────────────────────────────────────────────────────────────────┐
│  Scheduler / Trigger (cron or manual or both)                    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  LangGraph agent                                                  │
│  - State: messages, context (calendar snapshot, tasks, etc.)     │
│  - Nodes: planner → tools → (optional) approval → continue       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Calendar tools│     │ Todoist tools    │     │ Email tools      │
│ (Google/M365) │     │ (REST API)      │     │ (Gmail/IMAP)     │
└───────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
                                ▼
                      ┌─────────────────┐
                      │ Obsidian tools  │
                      │ (vault path)    │
                      └─────────────────┘
```

### Components

1. **Graph**
   - **State**: messages (chat), plus optional “context” (e.g. today’s calendar, overdue tasks, unread count).
   - **Nodes**:  
     - **Planner/Agent**: LLM that decides what to do and calls tools.  
     - **Tools**: calendar, todoist, email, obsidian (each tool is a function with a clear schema).  
     - **Approval** (optional): interrupt before send/delete; resume after you approve/reject.
   - **Edges**: START → agent → (tool calls) → agent … → END; optionally agent → approval → agent.

2. **Tools (narrow and typed)**
   - Calendar: `list_events`, `create_event`, `update_event`, `delete_event` (with calendar id for personal vs work).
   - Todoist: `list_tasks`, `add_task`, `update_task`, `close_task`, `list_projects`.
   - Email: `list_messages`, `get_message`, `draft_reply` (and optionally `send_email` behind approval).
   - Obsidian: `list_notes`, `read_note`, `write_note`, `append_to_note`, `search_notes` (all scoped to vault path).

3. **Security**
   - All secrets in env (e.g. `.env`); never commit. Use separate tokens for personal vs work where possible.
   - Approval step for: send email, delete event, delete/archive task (configurable).
   - Single vault path for Obsidian; resolve to absolute path and reject paths outside it.
   - Optional: rate limits and “max actions per run” to avoid runaway loops.

4. **Execution**
   - **Interactive**: run once, chat with the agent, it uses tools and optionally asks for approval.
   - **Scheduled**: cron (e.g. every 15 min) runs the graph with a system prompt like “Review calendar and tasks; suggest moves and priorities; create/update tasks from email if needed.”
   - **Persistence**: Use LangGraph checkpoints (e.g. SQLite) so you can resume and inspect state.

---

## Tech Stack Summary

| Layer        | Choice |
|-------------|--------|
| Runtime     | Node.js (LTS) |
| Language    | TypeScript |
| Orchestration | `@langchain/langgraph` |
| LLM / chains | `@langchain/core`, `langchain` (for chat models and tool binding) |
| Calendar    | `googleapis` (Google) or `@microsoft/microsoft-graph-client` (Microsoft) |
| Todoist     | `@doist/todoist-api-typescript` |
| Email       | `googleapis` (Gmail) or `imap` + `nodemailer` |
| Obsidian    | Node `fs`/`path` + markdown parser (e.g. `gray-matter`) |
| Secrets     | `.env` (e.g. `dotenv`); consider macOS Keychain for tokens later |
| Scheduling  | `node-cron` or system cron calling a CLI script |

---

## Alignment with deep research report

The [deep research report](./docs/deep-research-report.md) recommends:

| Recommendation | This repo |
|----------------|-----------|
| **Read-only first, then write with approval** | Current tools allow reads and writes; add a LangGraph interrupt/approval node before send email, create event, delete task. |
| **Local canonical store** | Not yet: agent calls APIs directly. Future: connectors sync into a local DB; agent proposes actions against that store; approval gate then calls APIs. |
| **Keychain for secrets** | `.env` for now; document or implement Keychain-backed tokens for production. |
| **Audit log** | Not yet; add append-only log of tool calls, approvals, and outcomes. |
| **Phased roadmap** | MVP = observe/summarise/propose (read-only + drafts); Assistant = Todoist/email/calendar writes with allowlists; Autonomy = conditional auto-actions in narrow domains. |
| **On-device LLM option** | Currently cloud (OpenAI); can add Ollama/llama.cpp/MLX endpoint and swap model in `graph.ts`. |
| **LaunchAgent for scheduling** | Use `node-cron` or a LaunchAgent plist that runs the Node process on a schedule. |

Implementing the report’s MVP phase first (read-only + proposals + approval for any write) is the safest path.

---

## Next Steps

1. **Scaffold** a Node + TypeScript project with LangGraph, one “hello world” graph, and placeholder tools for calendar, Todoist, email, Obsidian.
2. **Implement** one integration at a time (e.g. Todoist first — simplest API).
3. **Add** an approval node for destructive/write actions and wire it to a simple CLI or script.
4. **Add** a scheduler and a “daily briefing” system prompt.
5. **Harden**: scoped tokens, vault path validation, audit log, and optional rate limits.

This gives you a **LangGraph-based, Node.js personal assistant** that stays local, uses narrow tools, and can be tuned for security and control (including human-in-the-loop) without the broad attack surface of an OpenClaw-style agent.
