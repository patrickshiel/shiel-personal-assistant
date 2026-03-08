/**
 * Weekly meeting prep: two-step flow.
 * Step 1: Run agent to list week's calendar → write to state file and print.
 * Step 2: User edits state file with prep tasks per meeting, then run --apply to add to Todoist and optionally create calendar blocks.
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { runWithPrompt } from "../agent/graph.js";
import { getTrigger } from "./triggers.js";

const STATE_DIR = path.resolve(process.cwd(), "state");
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

## Your prep tasks (edit below)

For each meeting that needs preparation, add a line in this format:
- **Meeting title or date/time**: Prep task 1, Prep task 2, ...

Example:
- **Standup Mon 9am**: Review sprint board, note blockers
- **Client call Wed 2pm**: Prepare deck, send agenda

When you apply, the assistant will add Todoist tasks and optionally calendar blocks. For **work** meetings, it will create Obsidian notes for complex prep (outlines/key questions). For **personal** meetings, it only creates notes for items you mark as important (e.g. add * or "important" in the task).

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
  const entries = parsePrepTasks(content);
  if (entries.length === 0) {
    console.log("No prep tasks found in the file. Use the format under 'Your prep tasks'.");
    return;
  }

  const trigger = getTrigger("weekly_meeting_prep");
  const { start, end } = nextSevenDaysRange(new Date());
  const input = `Apply the following prep tasks. Date range for this week: ${start} to ${end} (use timeMin ${start}T00:00:00Z and timeMax ${end}T23:59:59Z).

First, call calendar_list_events_both with that timeMin/timeMax so you have full event details (title, start, end, description, attendees, link) for each meeting. Then:

1. **Todoist**: For each prep task create a task with: (a) **Descriptive title**—include the meeting name or outcome (e.g. "Prepare slide deck for HSE Insights Audit Readout", not "Prepare deck"). (b) **Description**—always set it: meeting title, meeting date/time, and a short note on what the prep is for. (c) **Due date and time**—use a specific datetime before the meeting (e.g. "2025-11-12 09:00" for a meeting at 14:00), not just the day. Before adding, list existing tasks and do not create duplicates.
2. **Calendar**: Optionally create focus blocks for prep; list events first and do not duplicate existing focus blocks.
3. **Obsidian**: For each meeting that needs a prep note, include a "## Meeting context" section with the full calendar event (title, date/time, description, attendees, link). If the note already exists (check with obsidian_read_note), use obsidian_append_to_note to add a "## Prep update YYYY-MM-DD" section. If it does not exist, use obsidian_write_note with Meeting context first, then outline and key questions.

Prep entries (meeting → tasks):
${entries.map((e) => `- ${e.meeting}: ${e.tasks.join("; ")}`).join("\n")}

Synthesise and create Todoist tasks, calendar blocks where useful, and Obsidian notes with full meeting context. Re-running apply should update existing notes by appending and avoid duplicate tasks or events.`;
  const result = await runWithPrompt(trigger.systemPrompt, input);
  const output = result?.output ?? result?.output_text ?? "";
  console.log(output);
}
