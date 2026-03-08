# Building a secure local first personal assistant agent for macOS

## Executive summary

A "full time secretary" agent that autonomously manages email, calendars, tasks, and notes on a Mac is feasible today, but it is also a high risk application class because it combines three ingredients that enable serious data exfiltration incidents: exposure to untrusted content (emails and invites), access to private data (mailboxes, calendars, notes), and the ability to communicate externally (sending email, creating invites, calling APIs). The architecture needs defence in depth, strict tool scoping, strong authentication and token hygiene, auditable action logs, and a deliberate autonomy ramp up rather than "always on autopilot" from day one.

A practical, macOS specific, local first reference design is:

A local control plane daemon (LaunchAgent) owns scheduling, state, and policy; it talks to a local model runtime (on device LLM via MLX or llama.cpp, with optional cloud escalation), a connector layer (Gmail API, Microsoft Graph, Todoist APIs, EventKit for Apple Calendar, file based Obsidian vault access), and a secure storage layer (encrypted local database plus Keychain backed secrets).

Key implementation strategy:

Start with a read only triage and planning assistant (classify, summarise, propose) and only later grant write permissions (send email, move messages, accept invites, edit tasks) via explicit, logged approvals. OpenAI's agent safety guidance explicitly recommends keeping tool approvals on, including for reads and writes, as a guardrail for tool using agents.

Model strategy:

Use an on device small to mid model for routine classification, extraction, and drafting, and optionally a cloud model for complex reasoning only when you explicitly allow it, with strict redaction and provider data controls.

## Problem framing and requirements

A macOS assistant that "runs on my laptop, has local access to data, and acts autonomously" implies four hard constraints:

Privacy by default, meaning most processing (indexing, retrieval, summarisation, planning) occurs locally, and any cloud call is intentional and policy governed. This aligns with the general principle of minimising sensitive data disclosures highlighted across LLM security guidance and the OWASP LLM Top 10 risk categories.

Broad integration coverage across both "native" macOS apps and third party services. For email and calendars, a single method rarely covers all accounts, so the connector layer needs pluggable backends (Apple Mail automation, Gmail API, Microsoft Graph, generic IMAP/SMTP, CalDAV or provider APIs).

True secretary behaviour, meaning the system must maintain a local notion of commitments, priorities, time budgets, and current context, then continuously reconcile conflicts between calendars and task lists.

Operational reliability, because "full time assistant" means long running background operation, crash recovery, and deterministic replay of actions. A durable execution and persistent state design is explicitly called out as a core capability in modern agent workflow frameworks such as LangGraph.

Because your hardware is unspecified, model choice and concurrency targets must be adaptable, especially on Macs with limited unified memory.

## Threat model and security first design

### Primary assets and adversaries

The assets include personal and work email content, calendars and invite metadata, task content, note content, and most critically the credentials and refresh tokens that allow acting on your behalf. OAuth tokens and API tokens are effectively "keys to the kingdom" for Gmail and Exchange access.

The most realistic adversary is not a sophisticated local attacker, it is untrusted content arriving through email or calendar invites and steering the agent into unsafe tool calls, which is the core prompt injection threat.

### Key threat categories for this project

Prompt injection and indirect prompt injection  
Emails, calendar descriptions, and even note content can contain instructions that attempt to override the system's policy or manipulate tool arguments. OWASP lists prompt injection as a top risk, and OWASP's prompt injection guidance and cheat sheet emphasise that tool using agents are uniquely exposed (tool manipulation, context poisoning, forged observations).

Data exfiltration via "lethal trifecta" conditions  
If your assistant can read private email and also send outbound email or web requests, a maliciously crafted email can potentially induce it to send sensitive data externally. This "lethal trifecta" framing is widely cited in modern agent security discussions.

Insecure tool design and excessive agency  
OWASP highlights insecure plugin design and excessive agency as major risks, which map directly to agent systems that expose powerful tools like "send email", "run shell", or "edit files" without strong friction.

Supply chain and extension risk  
If you adopt third party skills, plug ins, or marketplaces, you inherit their security posture. This has been a visible issue for fast growing agent ecosystems, including widely reported security concerns and user misconfiguration risks around OpenClaw's extension model.

Credential theft and billing abuse  
API keys and tokens can be abused for both data theft and expensive usage. Recent incidents around stolen AI API keys highlight the need for quotas, anomaly detection, and rapid revocation.

### Security principles that should shape the architecture

Least privilege by construction  
Separate "read" scopes from "write" scopes at the connector level, and default to read only until a workflow is proven safe. EventKit itself has evolved toward differentiated access levels (no access, write only, full access) to reduce privacy risk.

Policy gated tool execution  
Treat the LLM as a proposer, not an authority. The execution layer should enforce a deterministic policy: which tools exist, what arguments are allowed, what destinations are allowed, and when human approval is required. OpenAI's agent safety guidance explicitly recommends keeping approvals on so users can review and confirm operations.

Strong secret storage and entitlement awareness  
On Apple platforms, Keychain access is mediated by the securityd daemon and entitlements such as keychain access groups, and the platform security documentation describes the Keychain implementation and entitlement based access decisions.

Comprehensive auditability  
Autonomous actions must be explainable after the fact. This is both a security requirement and an operational sanity requirement for a "secretary" role.

## Model layer choices on device and cloud

### On device inference runtimes that fit macOS

Three on device runtimes are particularly relevant on Macs:

llama.cpp with Metal backend  
The llama.cpp project explicitly supports Metal on Apple Silicon, making it a common base for local GGUF model inference.

MLX and mlx lm  
Apple's MLX research and the mlx lm repository position MLX as an Apple silicon tuned framework for training and inference, including large language models, and mlx lm provides a focused LLM interface.

vLLM on Metal and macOS via Docker contributions  
Docker's 2026 announcement of a vllm metal backend highlights that higher throughput serving style runtimes are becoming viable on Apple Silicon with Metal acceleration.

A practical approach is to standardise on one local runtime interface (for example an HTTP local inference server), then swap backends (llama.cpp server, Ollama style service, MLX based service) as hardware allows.

### Cloud APIs and privacy trade offs

Cloud models are useful when you want higher reasoning quality, long context, or better tool planning, but they require sending data off device. If you do this, you must explicitly treat the cloud call as a data disclosure event.

Key current data control highlights from primary provider documentation:

OpenAI states that, as of March 1 2023, data sent to the OpenAI API is not used to train or improve its models unless you explicitly opt in.

Anthropic states that for API users it automatically deletes inputs and outputs within 30 days, with exceptions such as longer retention services, legal obligations, and usage policy enforcement, and it provides guidance for zero data retention agreements and what is eligible.

Google documents that Gemini Developer API paid services have a training restriction, meaning prompts and responses are not used to improve products, and it publishes a "zero data retention" option and terms restricting use in the EEA, Switzerland, and the UK to paid services.

Mistral AI discloses retention practices in its privacy policy and help centre articles, including retention of fine tuning data until deletion, and references that detailed retention times are laid out in its privacy policy.

If you are handling work email and calendars, the safest default is to keep work content entirely local, and only allow cloud calls with aggressive redaction, per domain allowlists, and clear disclosure in the UI.

### Comparison table of candidate LLMs for macOS local first agents

| Model family | Parameter sizes and notes | Typical macOS fit considerations | Why it is relevant to a secretary agent |
|---|---|---|---|
| Meta Llama 3.1 | 8B, 70B, 405B are the published sizes. | 8B is the realistic local baseline for many laptops. 70B often demands high unified memory and careful quantisation. runtimes include llama.cpp Metal. | Strong general purpose assistant capabilities in open weight form, good for local classification and drafting. |
| Mistral 7B and Mixtral | Mistral highlights Mistral 7B, Mixtral 8x7B, and Mixtral 8x22B as a family of efficient open models. | Mixtral variants can be heavy, but MoE can offer strong quality per active parameter in some setups. | Often strong at concise reasoning and instruction following, suitable for triage and summarisation. |
| Qwen2.5 | Published sizes include 0.5B, 1.5B, 3B, 7B, 14B, 32B, 72B. | 7B and 14B are plausible on higher memory Macs. 32B can be feasible with quantisation on high memory Apple Silicon. | Wide size range makes it useful for tuning quality vs resource budget. |
| Gemma and Gemma 3 | Gemma releases include multiple generations, with Gemma 3 described as ranging up to 27B parameters. | Small variants are plausible for laptops; larger ones require more memory. | Designed as open weight models, potentially useful for on device assistant behaviour and multimodal extensions depending on variant. |
| Phi family | Phi 3 includes small and medium variants, and Phi 4 is positioned as 14B parameters. | Smaller models are attractive for always on background classification tasks. | Lightweight models can power routing, extraction, and intent classification locally with low latency. |

### Practical resource estimates

- **Entry envelope**: On Apple Silicon with about 16 GB unified memory, plan for a small model, approximately 3B to 8B parameters with quantisation, plus a local store and embeddings. Metal acceleration via llama.cpp is available on Apple Silicon.
- **Comfort envelope**: On Apple Silicon with 32 GB or more unified memory, you can run a stronger on device model, track larger contexts, and support multiple concurrent agent loops, for example one loop per inbox plus a scheduler loop.
- **High end envelope**: On Apple Silicon with 64 GB to 128 GB unified memory, large models, higher context, and more concurrency become practical, especially if you adopt MLX tuned formats and serving runtimes like vllm metal.
- **Storage**: Expect several GB for model weights, plus an index for email and note embeddings, plus logs. This increases rapidly if you retain long term snapshots of mail content for local search.

## Data connectors and synchronisation strategies

A robust local first assistant needs a connector layer that is both least privilege and sync aware. The key design is a **local canonical store** that absorbs events from each system and produces proposed actions, rather than letting the model directly "poke" third party systems.

### Email and calendar integration options

- **Email via macOS Mail**: AppleScript rule actions for ingestion; MailKit extensions for in-app actions. AppleScript can be brittle; MailKit is the future of extending Mail.
- **Email via Gmail API**: Push watch plus history-based incremental sync (history.list) for a local cache of headers, threads, and bodies.
- **Email via Microsoft Graph**: Delta query and change notifications; strategic path for Exchange Online (EWS deprecated).
- **Calendar via EventKit**: No access, write only, or full access — align with least privilege.
- **Calendar via Google Calendar API and Graph**: Incremental sync and delta query for events.

### Todoist and Obsidian integration

- **Todoist**: REST API v2 for targeted actions; **Sync API** recommended for local-first full account state with incremental sync via sync tokens.
- **Obsidian**: Vault = folder on disk (notes, attachments, `.obsidian` config). Direct file read/write; natural fit for local-first. Be conservative about writing and handle sync conflicts if using third party sync.

### Sync strategy recommendations

1. **Local canonical store with source-specific adapters** — unified schema: messages, threads, people, events, commitments, tasks, projects, notes.
2. **Incremental by default** — Gmail history partial sync, Graph delta query, Todoist Sync API sync tokens.
3. **Two phase action application** — apply proposed changes first to local store as "pending plan"; only call external APIs after approval, with logged payload and post-condition checks.

## Agent orchestration, memory, and scheduling logic

### Core agent components

- **Planning module**: Proposed plan and candidate actions in structured format.
- **Policy and tool router**: Validates every tool call (allowlists, argument schemas, time windows, safety policies).
- **Memory module**: Short term (conversation, day agenda) + long term (preferences, recurring commitments, templates).
- **Scheduler and conflict resolver**: Deterministic availability, collision detection, alternatives.
- **Durable execution and crash recovery**: Persisted graph/workflow; LangGraph supports this natively.

### Handling scheduling and conflict resolution

- Maintain an internal free/busy grid from all calendars + inferred blocks from tasks and focus time.
- Use explicit constraints: working hours, minimum notice, buffer time, location, priority tiers.
- **Prefer propose rather than commit** for meetings with others: candidate time slots, draft email, send only after explicit approval.

### Tool invocation safety patterns

- **Strict schemas and allowlists** — avoid generic "run shell" in early phases.
- **Network egress control** — destination allowlists (e.g. email only to known contacts/domains initially).
- **Content isolation** — keep untrusted email in delimited context; never let it modify tool descriptions or policies.
- **Security testing** — prompt injection test suite (OWASP, incident patterns); treat failures as high severity.

### Orchestration frameworks (summary)

| Framework | Strengths for local first | Security cautions |
|---|---|---|
| **LangGraph** | Graph workflows, persistence, durable execution, human-in-the-loop; good for long-running local processes. | Careful tool scoping and injection defence; not solved by prompts alone. |
| OpenClaw | Features map to secretary scenario (cron, sessions). | Reported ecosystem security issues and misconfiguration risks; skill marketplace = supply chain risk. |
| Custom state machine + policy engine | Maximum control, easiest to audit; best for incremental autonomy. | More engineering; you implement persistence, scheduling, tool schemas. |

## Reference architecture, deployment, and roadmap

### Recommended architecture (summary)

- **UI**: Menu bar app, CLI, local web UI, macOS notifications.
- **Core (local control plane)**: Workflow orchestrator/scheduler, policy engine and approvals, append-only audit log, encrypted local canonical store.
- **Models**: On-device LLM runtime, local embeddings, optional cloud LLM gateway (policy gated).
- **Connectors**: Mail ingestion, calendar, tasks, notes → each talks to external services (Gmail API, Graph, Todoist, Obsidian vault on disk).
- Run the control plane as a **per-user LaunchAgent** (not root).

### Data flow and trust boundaries

Untrusted inputs (emails, invites, note content) → deterministic parsing → local store and index → LLM-assisted planning → proposed actions (structured tool calls) → **policy gate** (allowlists, approvals) → connector execution → post-condition checks → back to store. Gate and execution both feed the **audit log**.

### Authentication, encryption, token management, logging

- **Secrets**: macOS Keychain for API tokens, OAuth refresh tokens, encryption keys. Keychain items from third-party apps do not sync by default (strict local-only if desired).
- **Local data**: Encrypt assistant DB and caches (e.g. CryptoKit).
- **OAuth**: Use ASWebAuthenticationSession on macOS for Gmail and Microsoft Graph.
- **Audit log**: Append-only; record input event IDs, model prompts/responses, tool call proposals, approval decisions, executed API calls, post-condition results.

### UI and user control patterns

- **Inbox-zero queue view**: Proposed operations grouped by impact.
- **Approvals mode**: Default to approve-per-action for any write.
- **Emergency stop**: Revoke tokens, disable background execution, read-only mode.

### Phased implementation roadmap

**MVP phase**  
Goal: trusted assistant that observes, summarises, and proposes.  
Capabilities: local ingestion, daily briefings, meeting agenda summarisation, task extraction proposals, draft replies without sending, assistant-suggested calendar blocks without writing events.  
Security: read-only connectors, explicit approvals for any write, full audit logging from day one.

**Assistant phase**  
Goal: semi-autonomous execution with strong oversight.  
Capabilities: create Todoist tasks, draft and send email to restricted allowlist, propose meeting times, accept invites with simple rules, Obsidian daily log, weekly review note.  
Security: per-connector scopes, per-tool argument validation, outbound destination allowlists, anomaly detection.

**Autonomy phase**  
Goal: conditional full autonomy in narrow domains (calendar conflict resolution, task triage).  
Capabilities: auto-reschedule low-priority meetings, auto-file/label emails, keep tasks and calendar blocks aligned.  
Security: strict guardrails, regression testing for prompt injection and exfiltration, continuous monitoring of tool outcomes.

### Risk mitigations summary

1. Minimise the lethal trifecta: default to read-only; require approvals for external communications.
2. Treat untrusted content as data, never as instructions; policy enforcement outside the model.
3. Store credentials in Keychain; narrow token scopes; use incremental sync APIs to reduce exposure.
4. Prefer deterministic workflows with durable execution (resilient and auditable).
5. Avoid third-party skill/extension marketplaces; prefer self-reviewed local connectors.
