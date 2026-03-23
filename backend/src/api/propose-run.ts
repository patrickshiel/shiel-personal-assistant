import type { TriggerId } from "../orchestrator/triggers.js";
import { DEFAULT_SYSTEM_PROMPT, runWithPrompt, type ChatHistoryEntry } from "../agent/graph.js";
import { getTrigger } from "../orchestrator/triggers.js";

import type { Proposal } from "./job-store.js";
import { createProposalCollector } from "../agent/tools.js";
import type { TaskItem } from "./tasks-api.js";

const TASK_REFINEMENT_SYSTEM_PROMPT = `You are helping the user refine a single Todoist task so it is completable and fully tracked.

You will be given the currently selected task (id, content, due date, description, context).

**Context (work / personal):** These are just organizational labels in a single Todoist account, not separate integrations or orgs. When calling todoist_update_task, pass the task's current context and taskId so the update is applied. Do not tell the user you "had to submit against the task's current stored context" or suggest "recreating" or "moving" the task to work/personal as if they were different systems. If the user says a task should be work (or personal), treat it as a label preference; you can still propose updates to content, due date, priority, and description. Do not imply the task is "in the wrong place" or that it needs to be "moved" between contexts.

**Due date and time:** Prefer tasks to have a due datetime (date and time). When the task has only a date and no time, suggest adding a time (e.g. propose due_string like "2025-03-20 14:00" or "tomorrow 9:00"). When proposing due_string, include a time when possible so the task has a clear due datetime.

**Description:** The task description is stored separately from the title (Todoist "description" field; markdown supported). When you add or revise notes, acceptance criteria, links, or context that belong in the body—not the title—use the \`description\` argument on \`todoist_update_task\` (not only \`content\`). If the user asks to put details in the description, always include \`description\` in your update proposal with the full text you want stored.

**First message (no prior chat history):** When the user sends their first message in this conversation, you MUST start your reply by:
1. **Analyzing** the task for missing or vague details (e.g. unclear or missing due date/time, no description, vague title, no acceptance criteria, ambiguous scope).
2. **Listing each gap** and proposing a concrete improvement (e.g. "Add due date and time: suggest tomorrow 9:00", "Clarify content: rephrase as actionable", "Add description: what does done look like?").
3. **Asking one or two clear clarifying questions** so the user can confirm or fill in details.
You may use the todoist_update_task tool to propose specific changes (content, due_string, priority, description) for the user to Apply. Always pass context equal to the task's context ("personal" or "work") and taskId equal to the task's id.

**Later turns:** Use the user's answers to apply or refine updates (via todoist_update_task when appropriate), ask follow-up questions if needed, and keep the task completable and fully tracked until it is in good shape.

Do not create unrelated tasks unless the user explicitly asks. Focus on refining this one task.`;

export interface ProposeAssistantResult {
  outputText: string;
  proposals: Proposal[];
}

export async function proposeAssistant(message: string): Promise<ProposeAssistantResult> {
  const collector = createProposalCollector();
  const result = await runWithPrompt(DEFAULT_SYSTEM_PROMPT, message, {
    mode: "propose",
    proposalCollector: collector,
  });
  const outputText = (result?.output ?? result?.output_text ?? "").toString();
  return { outputText, proposals: collector.proposals };
}

export interface ProposeTriggerResult {
  outputText: string;
  proposals: Proposal[];
}

export async function proposeTrigger(
  triggerId: TriggerId,
  inputOverride?: string
): Promise<ProposeTriggerResult> {
  const trigger = getTrigger(triggerId);
  const input = inputOverride ?? trigger.defaultInput;
  const collector = createProposalCollector();
  const result = await runWithPrompt(trigger.systemPrompt, input, {
    mode: "propose",
    proposalCollector: collector,
  });
  const outputText = (result?.output ?? result?.output_text ?? "").toString();
  return { outputText, proposals: collector.proposals };
}

export interface ProposeTaskRefinementResult {
  outputText: string;
  proposals: Proposal[];
}

function formatTaskForPrompt(task: TaskItem): string {
  const due = task.due as { date?: string; datetime?: string } | undefined;
  const dateStr = due?.date ?? task.due_string ?? "—";
  const dueLine = due?.datetime
    ? `Due: ${dateStr} (datetime: ${due.datetime})`
    : `Due: ${dateStr} (date only; suggest adding a time when proposing due_string)`;
  const desc = task.description ? `\nDescription: ${task.description}` : "";
  return `Task id: ${task.id}\nContent: ${task.content}\n${dueLine}\nPriority: ${task.priority}\nContext: ${task.context}${desc}`;
}

export async function proposeTaskRefinement(
  selectedTask: TaskItem,
  message: string,
  history?: ChatHistoryEntry[]
): Promise<ProposeTaskRefinementResult> {
  const collector = createProposalCollector();
  const taskBlock = `Current task:\n${formatTaskForPrompt(selectedTask)}`;
  const firstTurnHint =
    !history?.length ?
      "\n\nThe next message is the user's first in this conversation. Start your reply by analyzing the task as described above (missing/vague details, proposed updates, clarifying questions)."
    : "";
  const systemPrompt = `${TASK_REFINEMENT_SYSTEM_PROMPT}\n\n${taskBlock}${firstTurnHint}`;
  const result = await runWithPrompt(systemPrompt, message, {
    mode: "propose",
    proposalCollector: collector,
    chatHistory: history,
  });
  const outputText = (result?.output ?? result?.output_text ?? "").toString();
  return { outputText, proposals: collector.proposals };
}

function scheduleDayMemoryContext(dateKey: string, scheduleMarkdown: string): string {
  return `The user is on the Schedule screen. The selected day is **${dateKey}** (local calendar).

Below is the **complete** snapshot for that day. Use it to answer questions about that day. You may still use tools to **mutate** tasks or calendar, **save content to Obsidian**, or to fetch other days when needed.

**Obsidian daily briefing:** When the user asks to save, brief, export, or put the rundown into a **daily note** (or similar), use **obsidian_write_note** or **obsidian_append_to_note** with markdown \`content\`. Prefer a path tied to this day: e.g. \`Daily/${dateKey}.md\` (relative to the vault; personal vault paths are auto-prefixed with \`Personal/\` by the tool). Use **context** \`personal\` or \`work\` to pick the vault. If the file may already exist, call **obsidian_read_note** first; if it exists and the user did not ask to replace it, use **obsidian_append_to_note** (e.g. a \`## Briefing\` section with a short timestamp) instead of overwriting.

**Google Calendar:** To add or change events on this day, use **calendar_create_event** or **calendar_update_event**. Use **context** \`personal\` or \`work\` and **calendarId** \`primary\` for the main calendar. Event **id** values in the snapshot may be composite (\`personal:…\` or \`work:…\`); pass them as **eventId** for updates. Provide at least one of summary, start, or end when updating.

--- Schedule snapshot ---

${scheduleMarkdown}`;
}

export async function proposeScheduleDayAssistant(
  message: string,
  dateKey: string,
  scheduleMarkdown: string,
  history?: ChatHistoryEntry[]
): Promise<ProposeAssistantResult> {
  const collector = createProposalCollector();
  const memoryContext = scheduleDayMemoryContext(dateKey, scheduleMarkdown);
  const result = await runWithPrompt(DEFAULT_SYSTEM_PROMPT, message, {
    mode: "propose",
    proposalCollector: collector,
    memoryContext,
    chatHistory: history,
  });
  const outputText = (result?.output ?? result?.output_text ?? "").toString();
  return { outputText, proposals: collector.proposals };
}

