/**
 * Weekly meeting prep: two-step flow.
 * Step 1: Run agent to list week's calendar → write to state file and print.
 * Step 2: User edits state file with prep tasks per meeting, then run --apply to add to Todoist and optionally create calendar blocks.
 */

import "../lib/load-env.js";
import fs from "node:fs/promises";
import path from "node:path";
import { runWithPrompt } from "../agent/graph.js";
import type { AgentMode, ProposalCollector } from "../agent/tools.js";
import { getTrigger } from "./triggers.js";
import { getStateDir } from "../lib/paths.js";

const STATE_DIR = getStateDir();
const WEEKLY_PREP_PREFIX = "weekly-prep";

/** Range from today through today + 6 (7 days total). */
function nextSevenDaysRange(now: Date): { start: string; end: string } {
  const startD = new Date(now);
  startD.setHours(0, 0, 0, 0);
  const endD = new Date(startD);
  endD.setDate(endD.getDate() + 6);
  const start = startD.toISOString().slice(0, 10);
  const end = endD.toISOString().slice(0, 10);
  return { start, end };
}

export async function runWeeklyPrepList(): Promise<string> {
  const trigger = getTrigger("weekly_meeting_prep");
  const { start, end } = nextSevenDaysRange(new Date());
  const input = `Use the calendar_list_events_both tool with timeMin ${start}T00:00:00Z and timeMax ${end}T23:59:59Z. Format the returned events as a clear list with date, time, title, and personal/work for each.`;
  const result = await runWithPrompt(trigger.systemPrompt, input);
  const output = (result?.output ?? result?.output_text ?? "").toString();

  await fs.mkdir(STATE_DIR, { recursive: true });
  const filename = `${WEEKLY_PREP_PREFIX}-${start}.md`;
  const filepath = path.join(STATE_DIR, filename);
  const prepRequest = `# Weekly meeting prep – next 7 days (${start} to ${end})

## Calendar (from agent)

${output}

---

## Your prep tasks (edit below, optional)

**One prep task per meeting**: When you apply, the assistant creates **one** Todoist task per meeting. All prep items for that meeting go inside that single task as a checklist in the description. The task is due at a time that gives you enough time before the meeting to complete the list.

**Work meetings**: Every work meeting gets one prep task (with default checklist if you don't add a line). To customize the checklist for a meeting, add a line below.

Format: **Meeting title or date/time**: Checklist item 1, Checklist item 2, ...

Example:
- **Standup Mon 9am**: Review sprint board, note blockers
- **Client call Wed 2pm**: Prepare slide deck for readout, send agenda to attendees

**Personal meetings**: Add a line only for personal meetings you want one prep task for (e.g. interview, medical).

Save this file, then run: npm run weekly-prep -- --apply ${filename}
`;
  await fs.writeFile(filepath, prepRequest, "utf-8");
  console.log("Wrote:", filepath);
  console.log("\nEdit the file to add prep tasks per meeting, then run:");
  console.log(`  npm run weekly-prep -- --apply ${filename}`);
  return output;
}

export interface PrepEntry {
  meeting: string;
  tasks: string[];
}

/** Parse the "Your prep tasks" section of the weekly prep file. */
export function parsePrepTasks(content: string): PrepEntry[] {
  const entries: PrepEntry[] = [];
  const section = content.split("## Your prep tasks")[1] ?? "";
  const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
  let currentMeeting: string | null = null;
  let currentTasks: string[] = [];

  for (const line of lines) {
    if (line.startsWith("- **") && line.includes("**:")) {
      if (currentMeeting) {
        entries.push({ meeting: currentMeeting, tasks: currentTasks });
      }
      const match = line.match(/^-\s*\*\*(.+?)\*\*:\s*(.*)$/);
      currentMeeting = match?.[1] ?? null;
      currentTasks = match?.[2] ? match[2].split(",").map((t) => t.trim()).filter(Boolean) : [];
    } else if (currentMeeting && line.startsWith("- ")) {
      currentTasks.push(line.replace(/^-\s*/, "").trim());
    }
  }
  if (currentMeeting) {
    entries.push({ meeting: currentMeeting, tasks: currentTasks });
  }
  return entries;
}

export async function runWeeklyPrepApply(prepFilePath: string): Promise<void> {
  const fullPath = path.isAbsolute(prepFilePath)
    ? prepFilePath
    : path.join(STATE_DIR, prepFilePath);
  const content = await fs.readFile(fullPath, "utf-8");
  const output = await runWeeklyPrepApplyFromMarkdown(content);
  console.log(output);
}

export async function runWeeklyPrepApplyFromMarkdown(
  prepMarkdown: string,
  options?: { mode?: AgentMode; proposalCollector?: ProposalCollector }
): Promise<string> {
  const entries = parsePrepTasks(prepMarkdown);

  const trigger = getTrigger("weekly_meeting_prep");
  const { start, end } = nextSevenDaysRange(new Date());
  const prepList =
    entries.length > 0
      ? `\nUser's custom prep entries (use these as the checklist items for the one prep task per meeting; for other work meetings use default checklist):\n${entries.map((e) => `- ${e.meeting}: ${e.tasks.join("; ")}`).join("\n")}`
      : "\nUser listed no custom prep. Create one prep task per work meeting with a default checklist (e.g. Review agenda and materials, Prepare notes) in the task description. For personal meetings do not create tasks unless the user added them (in this run they did not).";

  const input = `Apply weekly meeting prep. Date range: ${start} to ${end} (use timeMin ${start}T00:00:00Z and timeMax ${end}T23:59:59Z).

First, call calendar_list_events_both to get all meetings (the list includes every event on work and personal calendars, including ones the user has not yet accepted—do not skip any). Then:
- **One prep task per meeting**: Create exactly **one** Todoist task per meeting. Put all prep items (checklist) in that task's **description**—do not create separate tasks per item. If the user listed items for a meeting below, use those as the checklist; otherwise use a default (Review agenda and materials, Prepare notes).
- **Due time**: Set the task's due date and time so the user has **enough time before the meeting** to complete all prep—e.g. 60–90 minutes or 2 hours before the meeting start, depending on how many checklist items there are.
- **Personal meetings**: Only create one prep task per meeting if the user listed that meeting below.
1. **Todoist**: One task per meeting. Title format: "YYYY-MM-DD HH:MM - Prep for [Meeting title]" (datetime = due time). Description: meeting name and time, then "Prep checklist:" with each item on its own line (detailed and specific). due_string = start of the prep block (enough time before the meeting). List existing tasks first and avoid duplicates.
2. **Obsidian**: Create **one prep note per meeting**—for every meeting that gets a Todoist prep task, also create or update the corresponding Obsidian note (work vault for work meetings, personal vault for personal). Do not skip: Todoist task and Obsidian note go together. Note title: meeting's start date/time at the start, e.g. "Meetings/2025-03-12 14:00 - Prep - Client call.md". Include "## Meeting context" and "## Prep checklist" (same items as in the Todoist task). When appending, keep the existing note path; add a "## Prep update YYYY-MM-DD HH:MM" section.
3. **Calendar**: Optionally create focus blocks; list events first and do not duplicate.
${prepList}

Synthesise and create Todoist tasks, calendar blocks where useful, and Obsidian notes. Re-running apply should be idempotent (append notes, no duplicate tasks or events).`;

  const result = await runWithPrompt(trigger.systemPrompt, input, {
    mode: options?.mode,
    proposalCollector: options?.proposalCollector,
  });
  return (result?.output ?? result?.output_text ?? "").toString();
}
