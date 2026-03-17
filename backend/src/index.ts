#!/usr/bin/env node
/**
 * Entrypoint for the personal assistant agent.
 * Run: npm run dev   (or npm start after build)
 * Example: npm run dev -- "What's on my calendar today and what tasks are overdue?"
 */

import "./lib/load-env.js";
import { runAssistant } from "./agent/graph.js";

const userInput = process.argv.slice(2).join(" ").trim();

if (!userInput) {
  console.log(`
Usage: npm run dev -- "<your request>"
Example: npm run dev -- "List my Todoist tasks due today and my calendar events for this week"

Set in .env:
  OPENAI_API_KEY (or ANTHROPIC_API_KEY if you switch the model)
  TODOIST_API_TOKEN
  OBSIDIAN_VAULT_PATH
  (Optional) Google credentials for calendar/email
`);
  process.exit(0);
}

async function main() {
  console.log("Running assistant...\n");
  const result = await runAssistant(userInput);
  const output = result?.output ?? result?.output_text;
  if (typeof output === "string") {
    console.log("Assistant:", output);
  } else {
    console.log("Result:", JSON.stringify(result, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
