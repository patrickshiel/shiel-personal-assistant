#!/usr/bin/env node
/**
 * Weekly meeting prep.
 *
 *   npm run weekly-prep                    # List week's calendar, write state/weekly-prep-YYYY-MM-DD.md
 *   npm run weekly-prep -- --apply <file>  # Apply user's prep tasks from file to Todoist + calendar blocks
 */

import "dotenv/config";
import { runWeeklyPrepList, runWeeklyPrepApply } from "./orchestrator/weekly-prep.js";

const args = process.argv.slice(2);
const applyIdx = args.indexOf("--apply");
const applyFile = applyIdx >= 0 ? args[applyIdx + 1] : null;

if (applyFile) {
  runWeeklyPrepApply(applyFile).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  runWeeklyPrepList().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
