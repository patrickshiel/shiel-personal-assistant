#!/usr/bin/env node
/**
 * Meeting debrief: prompt for Spark summary/transcript, then synthesize to Obsidian + Todoist + calendar blocks.
 *
 *   npm run debrief
 *   npm run debrief -- --summary ./summary.md --transcript ./transcript.txt
 *   npm run debrief -- --paste
 */

import "./lib/load-env.js";
import { runDebrief } from "./cli/debrief.js";

const args = process.argv.slice(2);
const summaryIdx = args.indexOf("--summary");
const transcriptIdx = args.indexOf("--transcript");
const paste = args.includes("--paste");

runDebrief({
  summaryPath: summaryIdx >= 0 ? args[summaryIdx + 1] : undefined,
  transcriptPath: transcriptIdx >= 0 ? args[transcriptIdx + 1] : undefined,
  paste: paste || (summaryIdx < 0 && transcriptIdx < 0),
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
