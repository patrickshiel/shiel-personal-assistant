#!/usr/bin/env node
/**
 * Resync day: re-read calendar for a date and sync Todoist + Obsidian.
 *
 *   npm run resync-day              # Today
 *   npm run resync-day -- tomorrow
 *   npm run resync-day -- 2025-03-15
 */

import "./lib/load-env.js";
import { runTrigger } from "./orchestrator/scheduler.js";
import type { TriggerId } from "./orchestrator/triggers.js";

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateArg(arg: string | undefined): string {
  const now = new Date();
  if (!arg || arg.toLowerCase() === "today") {
    return toYYYYMMDD(now);
  }
  if (arg.toLowerCase() === "tomorrow") {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    return toYYYYMMDD(t);
  }
  if (arg.toLowerCase() === "yesterday") {
    const t = new Date(now);
    t.setDate(t.getDate() - 1);
    return toYYYYMMDD(t);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    return arg;
  }
  console.error("Invalid date. Use: today | tomorrow | yesterday | YYYY-MM-DD");
  process.exit(1);
}

const dateArg = process.argv[2];
const date = parseDateArg(dateArg);

const input = `Resync ${date}. Use calendar_list_events_both for ${date} (timeMin ${date}T00:00:00Z, timeMax ${date}T23:59:59Z). Then for each event: update or create Todoist prep task and Obsidian prep note. Close any Todoist prep tasks for meetings that are no longer on the calendar. Update any Obsidian notes with new details.`;

runTrigger("resync_day" as TriggerId, input)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
