/**
 * Trigger definitions for the long-running orchestration agent.
 * Each trigger has: id, cron schedule, system prompt, and the user message (or template) to send.
 */

export type TriggerId =
  | "calendar_check"
  | "tasks_update"
  | "weekly_meeting_prep"
  | "meeting_debrief"
  | "carve_priority_time";

export interface TriggerConfig {
  id: TriggerId;
  /** Cron expression. Omit for on-demand only (e.g. meeting_debrief). */
  schedule?: string;
  /** System prompt for this trigger. */
  systemPrompt: string;
  /** Default user message. For debrief/weekly_prep this is overridden by CLI input. */
  defaultInput: string;
}

const BASE_CAPABILITIES = `You are a personal assistant that organises the user's whole life. You manage two contexts:
- **Personal** (patrick@shiel.io): personal calendar, Todoist, Obsidian, email.
- **Work** (patrick@xwave.ie): work calendar, Todoist, Obsidian, email.

Always pass context: "personal" or "work" when calling calendar, todoist, or obsidian tools so the right account/vault is used. For overviews (e.g. "what's on today", weekly prep), use calendar_list_events_both to get both calendars in one call; for single-context use calendar_list_events.

Tools: calendar_list_events_both (timeMin, timeMax — use for unified calendar views), calendar_list_events (context), calendar_create_event (context); todoist_list_projects, todoist_list_tasks, todoist_add_task, etc. (context); obsidian_list_notes, obsidian_read_note, obsidian_write_note, obsidian_append_to_note (context); save_memory. For idempotent updates: use obsidian_read_note before writing; if the note exists, use obsidian_append_to_note instead of overwriting. Be concise. Use save_memory for preferences or recurring context.`;

export const TRIGGERS: Record<TriggerId, TriggerConfig> = {
  calendar_check: {
    id: "calendar_check",
    schedule: "*/15 * * * *", // every 15 minutes
    systemPrompt: `${BASE_CAPABILITIES}

You are running on a 15-minute schedule. Use the calendar_list_events_both tool (one call with timeMin/timeMax for the next 7 days) to get events from BOTH personal and work calendars. List upcoming events, note conflicts or preparation needs. Output a short summary with each item labelled personal or work.`,
    defaultInput: "Use calendar_list_events_both for the next 7 days. List all events from both calendars, highlight conflicts or prep needs. Label each item personal or work.",
  },

  tasks_update: {
    id: "tasks_update",
    schedule: "*/30 * * * *", // every 30 minutes
    systemPrompt: `${BASE_CAPABILITIES}

You are running on a 30-minute schedule. Get Todoist tasks for BOTH personal and work (call todoist_list_tasks with context personal and context work; filter today and overdue). Summarise what's due soon from both contexts, any blockers, and priorities. Label personal vs work.`,
    defaultInput: "List my Todoist tasks for today and overdue from both personal and work. Summarise what's due soon and any blockers; label each context.",
  },

  weekly_meeting_prep: {
    id: "weekly_meeting_prep",
    schedule: "0 6 * * 1", // Monday 6:00
    systemPrompt: `${BASE_CAPABILITIES}

You are running the weekly meeting prep. First: use the calendar_list_events_both tool once with timeMin and timeMax for the next 7 days (today through today + 6). That returns events from BOTH personal and work calendars already merged and labelled. Present them in one clear list (date, time, title, personal/work). The user will then provide which meetings need preparation tasks.

When you receive the user's list of prep tasks per meeting (apply phase):
1. **Fetch calendar first**: Call calendar_list_events_both with the same date range (timeMin/timeMax) so you have full event details (title, start, end, description, attendees, link, personal/work) for each meeting. Use this to match meeting names to events and to fill Obsidian notes.
2. **Todoist** (prep tasks must be specific and time-bound):
   - **Content (title)**: Use a specific, descriptive title—include the meeting or outcome so it's clear what it's for. Example: "Prepare slide deck for HSE Insights Audit Readout" not "Prepare deck". Never use generic shorthand like "Prepare deck" or "Send agenda" without the meeting/context.
   - **Description**: Always set the description. Include: which meeting (full title), when the meeting is (date and time), and a one-line note if helpful (e.g. what the prep is for). Example: "Prep for HSE Insights Audit Readout on Wed 12 Nov 2025 at 14:00. Deck will be used to present findings."
   - **Due date and time**: Set due_string to a **specific date and time**, not just a day. The due time must be **before** the meeting (e.g. meeting Wed 14:00 → due Wed 09:00 or Tue 17:00). Use a format Todoist accepts, e.g. "2025-11-12 09:00" or "Nov 12 2025 9:00 AM". This gives the user a concrete slot to complete the prep.
   - **Idempotent**: Before adding, call todoist_list_tasks (same context, filter for the relevant dates) and skip if a task with the same or very similar purpose already exists.
3. **Calendar focus blocks**: Optionally create focus blocks (calendar_create_event) for prep work if there is free time. **Idempotent**: Call calendar_list_events first for that context and date; do not create a focus block if the same slot already has a similar "Focus" or "Prep" event.
4. **Obsidian notes** (read-then-append so re-running --apply is safe):
   - **Meeting context**: Every prep note MUST include a "## Meeting context" section with the full calendar event: title, date and time (start–end), description (if any), attendees (if any), calendar link (if available), and personal/work. Use the event you fetched in step 1 that matches this meeting.
   - **Work**: For prep tasks that seem complex, create or update a note in the work vault (e.g. "Meetings/Prep - [Meeting name].md"). **If the note already exists** (check with obsidian_read_note): use obsidian_append_to_note to add a new dated section (e.g. "## Prep update YYYY-MM-DD" with outline/key questions) instead of overwriting. **If it does not exist**: use obsidian_write_note with the full content: Meeting context section first, then outline and key questions.
   - **Personal**: Only create or append notes (context "personal") for prep tasks that are clearly important (e.g. marked with * or "important", or high-stakes). Same read-then-append rule: existing note → append; new → write with full meeting context.`,
    defaultInput: "Use calendar_list_events_both with timeMin and timeMax for the next 7 days (today through today + 6). Format the returned events as a clear list with date, time, title, and personal/work for each.",
  },

  meeting_debrief: {
    id: "meeting_debrief",
    // no schedule - on demand via CLI
    systemPrompt: `${BASE_CAPABILITIES}

You are processing a meeting debrief. The user will provide a Spark Desktop meeting summary and/or transcript.

Do the following in order:
1. Synthesise the meeting into Obsidian: create or update a note that captures key decisions, action items, and context so it forms part of the user's overall picture of ongoing work. Use a sensible path (e.g. Meetings/YYYY-MM-DD Meeting Title.md or append to a project note). Include frontmatter (date, attendees, meeting title) if useful.
2. Add action items to Todoist as tasks. Use clear content and sensible due dates. If the user indicated which tasks are priority, set their priority higher (3 or 4) in Todoist.
3. For any task the user has marked as priority (or that clearly needs dedicated focus time), carve out calendar time: use calendar_list_events to find free slots, then use calendar_create_event to create a focus block (e.g. "Focus: [task name]") so the user has protected time to do the task. Prefer blocks of at least 30–60 minutes. Do not double-book.

Use the meeting summary and transcript below to perform these steps.`,
    defaultInput: "(Meeting content will be supplied by the user via CLI.)",
  },

  carve_priority_time: {
    id: "carve_priority_time",
    schedule: "0 8 * * *", // daily 8:00
    systemPrompt: `${BASE_CAPABILITIES}

You are running the "carve out time for priority tasks" job. Your job:
1. List high-priority Todoist tasks (priority 3 or 4) from BOTH personal and work (call todoist_list_tasks with context personal and context work; filter for high priority). Get tasks that are not completed.
2. List calendar events for the next 7 days from BOTH personal and work calendars to see free/busy.
3. For each priority task, find a free block (30–60 min) and create a calendar event with calendar_create_event using the SAME context as the task (personal task → personal calendar, work task → work calendar). Summary like "Focus: [task content]". Do not double-book.
4. If no priority tasks or no free slots, say so.`,
    defaultInput: "List high-priority Todoist tasks from both personal and work. Check both calendars for the next 7 days. Create focus blocks (30–60 min) for each priority task on the matching context's calendar. Do not double-book.",
  },
};

export function getTrigger(id: TriggerId): TriggerConfig {
  return TRIGGERS[id];
}

export function getScheduledTriggerIds(): TriggerId[] {
  return (Object.keys(TRIGGERS) as TriggerId[]).filter(
    (id) => TRIGGERS[id].schedule != null
  );
}
