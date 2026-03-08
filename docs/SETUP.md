# First-run setup: Google Calendar, Todoist, Obsidian

Configure each integration once; the orchestrator and agent will use them on every run.

---

## Personal vs Work (patrick@shiel.io / patrick@xwave.ie)

The assistant manages **two contexts** so it can organise your whole life:

- **Personal** — patrick@shiel.io: personal calendar, Todoist, Obsidian, email.
- **Work** — patrick@xwave.ie: work calendar, Todoist, Obsidian, email.

Set in `.env` (optional; these are the defaults):

```bash
PERSONAL_EMAIL=patrick@shiel.io
WORK_EMAIL=patrick@xwave.ie
```

For **Calendar** and **Todoist** you use **separate tokens per account** (see below). For **Obsidian** you can use one vault with folders (e.g. `Personal/`, `Work/`) or set a second vault path for work. The agent will label everything as personal or work and, when giving overviews, show both together.

---

## 1. Copy environment file

```bash
cp .env.example .env
```

Edit `.env` and fill in the values below. **Never commit `.env`** (it’s in `.gitignore`).

---

## 2. LLM (required)

You need at least one provider for the agent to run. The app uses OpenAI by default.

- **OpenAI**: [API keys](https://platform.openai.com/api-keys) → set `OPENAI_API_KEY=sk-...`
- Or **Anthropic**: set `ANTHROPIC_API_KEY=...` and change the model in `src/agent/graph.ts` to use `@langchain/anthropic`.

---

## 2b. LangSmith (optional)

To see agent runs and tool calls in [LangSmith Studio](https://smith.langchain.com):

1. Create an API key at [LangSmith → Settings → API Keys](https://smith.langchain.com/settings).
2. In `.env` set:
   ```bash
   LANGCHAIN_API_KEY=your_langsmith_api_key
   ```
   Tracing is turned on automatically when this key is set. Optionally set `LANGCHAIN_PROJECT=shiel-personal-assistant` (or another project name) to group runs.

   **If you get a 403 "org-scoped and requires workspace specification"**: your key is tied to an organization. Add your workspace ID from [LangSmith → Settings](https://smith.langchain.com/settings) (or the URL when viewing a project):
   ```bash
   LANGSMITH_WORKSPACE_ID=your_workspace_uuid
   ```

---

## 3. Todoist

**Time: ~2 minutes for two accounts.**

You can use one Todoist account (set one token) or **two** (personal + work):

1. Open [Todoist → Settings → Integrations](https://app.todoist.com/app/settings/integrations) for **each** account (personal and work).
2. Copy the **API token** for each.
3. In `.env` set:
   ```bash
   TODOIST_API_TOKEN_PERSONAL=your_personal_token
   TODOIST_API_TOKEN_WORK=your_work_token
   ```
   If you only have one account, set `TODOIST_API_TOKEN_PERSONAL=` (or the legacy `TODOIST_API_TOKEN=`) and leave the other empty.

The agent will list/add/update tasks in the correct context (personal vs work) when you or the triggers ask.

**If you get `410 Gone`:** The REST API needs a **personal API token**, not a Developer Console client ID/secret. In [Todoist → Settings → Integrations](https://app.todoist.com/app/settings/integrations), find **API token** and copy it into `.env`. Then run `npm run todoist-test` to verify (optionally `npm run todoist-test -- work` for the work token).

---

## 4. Obsidian

**Time: ~1–2 minutes.**

1. Your vault(s) are **folders** on disk (e.g. `~/Documents/Obsidian`).
2. In `.env` set at least the personal vault:
   ```bash
   OBSIDIAN_VAULT_PATH=/Users/you/Documents/ObsidianPersonal
   ```
   If you have a **separate work vault**:
   ```bash
   OBSIDIAN_VAULT_PATH_WORK=/Users/you/Documents/ObsidianWork
   ```
   If you use **one vault** for both, leave `OBSIDIAN_VAULT_PATH_WORK` empty and use subfolders (e.g. `Personal/`, `Work/`) in your note paths; the agent will still use the `context` parameter to organise.

The agent can list, read, write, and search notes; paths are scoped to the chosen vault (personal or work).

---

## 5. Google Calendar (optional but recommended)

Calendar is used for listing events, creating focus blocks, and weekly prep. You need a **Google Cloud project** and **OAuth 2.0 credentials**, then a one-time sign-in to get a refresh token.

### 5.1 Create a Google Cloud project and enable Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (e.g. “Personal assistant”) or pick an existing one.
3. **APIs & Services → Library** → search for **Google Calendar API** → **Enable**.
4. **APIs & Services → Credentials** → **Create credentials** → **OAuth client ID**.
5. If prompted, set the **OAuth consent screen**:
   - User type: **External** (or Internal for Workspace).
   - App name: e.g. “Shiel Assistant”.
   - Add your email as a test user if External.
6. For the OAuth client:
   - Application type: **Desktop app**.
   - Name: e.g. “Shiel Assistant”.
7. After creation, copy the **Client ID** and **Client secret** into `.env`:
   ```bash
   GOOGLE_CLIENT_ID=....apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   ```

### 5.2 One or two OAuth clients

- **Same organisation**: You can use **one** OAuth client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) for both accounts. Get two refresh tokens by signing in once as patrick@shiel.io and once as patrick@xwave.ie (run the auth script twice).

- **Different Google organisations** (e.g. personal in one org, work in a separate Google Workspace): Use a **separate OAuth client for work**. Create a second Google Cloud project under the work organisation, create OAuth credentials there, and set in `.env`:
  ```bash
  GOOGLE_CLIENT_ID_WORK=...   # from work org's GCP project
  GOOGLE_CLIENT_SECRET_WORK=...
  ```
  Then run `npm run auth-google -- --work` (it will use the _WORK client and print `GOOGLE_REFRESH_TOKEN_WORK`). Personal continues to use `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### 5.3 One-time sign-in per account (personal + work)

Run the auth helper **twice**: once for personal, once for work. Each run starts a local server, opens a browser, and prints a refresh token.

```bash
# Personal calendar (patrick@shiel.io)
npm run auth-google -- --personal
# Add the printed GOOGLE_REFRESH_TOKEN_PERSONAL=... to .env

# Work calendar (patrick@xwave.ie)
npm run auth-google -- --work
# Add the printed GOOGLE_REFRESH_TOKEN_WORK=... to .env
```

1. For each run, a browser opens (or copy the URL). Sign in with the **correct** Google account (personal or work).
2. Approve the Calendar scopes.
3. Add the printed line to your `.env` file.

After both are set, the agent can list/create events on both calendars. For a single view of both calendars (e.g. weekly prep), it uses one tool call that fetches both; for creating events it uses the context (personal vs work) you specify.

---

## 6. Verify

```bash
# One-off agent run (uses Todoist + Obsidian + Calendar if configured)
npm run dev -- "List my Todoist projects and any events in the next 7 days"
```

If something isn’t configured, the agent will report it (e.g. “TODOIST_API_TOKEN not set” or “Calendar not implemented”). Fix the corresponding section above and try again.

---

## Summary: minimum for first run

| Integration     | Required? | What to set in `.env` |
|-----------------|-----------|------------------------|
| Identity        | Optional  | `PERSONAL_EMAIL`, `WORK_EMAIL` (defaults: patrick@shiel.io, patrick@xwave.ie) |
| LLM (OpenAI)    | Yes       | `OPENAI_API_KEY` |
| Todoist         | Yes*      | `TODOIST_API_TOKEN_PERSONAL`, `TODOIST_API_TOKEN_WORK` (or one token for single account) |
| Obsidian        | Yes*      | `OBSIDIAN_VAULT_PATH`; optionally `OBSIDIAN_VAULT_PATH_WORK` |
| Google Calendar | No        | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, then `GOOGLE_REFRESH_TOKEN_PERSONAL` and `GOOGLE_REFRESH_TOKEN_WORK` after `npm run auth-google -- --personal` and `--work` |

\* Required for the scheduled triggers. The agent will manage both personal and work when both tokens/vaults are set.
