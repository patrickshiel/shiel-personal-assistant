#!/usr/bin/env node
/**
 * Long-running orchestration agent.
 *
 *   npm run orchestrate              # Start scheduler (calendar every 15m, tasks every 30m, weekly Monday 6am, carve daily 8am)
 *   npm run orchestrate -- --once calendar_check   # Run one trigger once and exit
 */

import "dotenv/config";
import { startScheduler } from "./orchestrator/scheduler.js";
import { runTrigger } from "./orchestrator/scheduler.js";
import { getScheduledTriggerIds, type TriggerId } from "./orchestrator/triggers.js";

const args = process.argv.slice(2);
const onceFlag = args.indexOf("--once");
const triggerId = onceFlag >= 0 ? args[onceFlag + 1] : null;

if (triggerId && onceFlag >= 0) {
  const validIds = getScheduledTriggerIds();
  if (!validIds.includes(triggerId as TriggerId)) {
    console.error("Invalid trigger. Use one of:", validIds.join(", "));
    process.exit(1);
  }
  runTrigger(triggerId as TriggerId).then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
} else {
  startScheduler();
}
