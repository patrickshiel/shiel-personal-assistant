#!/usr/bin/env node
/**
 * Long-running orchestration agent.
 *
 *   npm run orchestrate              # Start scheduler (calendar every 15m, tasks every 30m, weekly Monday 6am, carve daily 8am)
 *   npm run orchestrate -- --once calendar_check   # Run one trigger once and exit
 *   npm run resync-day [today|tomorrow|YYYY-MM-DD]   # Resync that day (default: today)
 */

import "./lib/load-env.js";
import { startScheduler } from "./orchestrator/scheduler.js";
import { runTrigger } from "./orchestrator/scheduler.js";
import { getAllTriggerIds, type TriggerId } from "./orchestrator/triggers.js";

const args = process.argv.slice(2);
const onceFlag = args.indexOf("--once");
const triggerId = onceFlag >= 0 ? args[onceFlag + 1] : null;

if (triggerId && onceFlag >= 0) {
  const validIds = getAllTriggerIds();
  if (!validIds.includes(triggerId as TriggerId)) {
    console.error("Invalid trigger. Use one of:", validIds.join(", "));
    process.exit(1);
  }
  const dateArg = args[onceFlag + 2];
  const inputOverride =
    dateArg && (triggerId as string) === "resync_day"
      ? `Resync ${dateArg}. Use calendar_list_events_both for ${dateArg} (timeMin ${dateArg}T00:00:00Z, timeMax ${dateArg}T23:59:59Z). Then for each event: update or create Todoist prep task and Obsidian prep note. Close any Todoist prep tasks for meetings that are no longer on the calendar. Update any Obsidian notes with new details.`
      : undefined;
  runTrigger(triggerId as TriggerId, inputOverride).then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
} else {
  startScheduler();
}
