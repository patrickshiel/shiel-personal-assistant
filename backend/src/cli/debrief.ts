/**
 * Meeting debrief CLI: prompt for Spark Desktop summary/transcript, then synthesize
 * into Obsidian notes, Todoist tasks, and calendar blocks for priority items.
 *
 * Usage:
 *   npm run debrief
 *   npm run debrief -- --summary path/to/summary.md --transcript path/to/transcript.txt
 *   npm run debrief -- --paste   (read from stdin after prompt)
 */

import "../lib/load-env.js";
import fs from "node:fs/promises";
import readline from "node:readline";
import { runWithPrompt } from "../agent/graph.js";
import { getTrigger } from "../orchestrator/triggers.js";
import type { AgentMode, ProposalCollector } from "../agent/tools.js";

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve((answer ?? "").trim()));
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8").trim();
}

export async function runDebrief(options: {
  summaryPath?: string;
  transcriptPath?: string;
  paste?: boolean;
}): Promise<void> {
  let summary = "";
  let transcript = "";

  if (options.summaryPath) {
    summary = await fs.readFile(options.summaryPath, "utf-8");
  }
  if (options.transcriptPath) {
    transcript = await fs.readFile(options.transcriptPath, "utf-8");
  }

  if (options.paste || (!summary && !transcript)) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!summary) {
      console.log("Paste the Spark Desktop meeting summary (or path to file). End with a blank line or Ctrl+D.");
      summary = await ask(rl, "Summary (or path): ");
      if (summary && summary.length < 260 && !summary.includes("\n")) {
        try {
          summary = await fs.readFile(summary, "utf-8");
        } catch {
          // treat as inline summary
        }
      }
    }
    if (!transcript) {
      console.log("Paste the transcript (or path to file). End with a blank line or Ctrl+D.");
      transcript = await ask(rl, "Transcript (or path): ");
      if (transcript && transcript.length < 260 && !transcript.includes("\n")) {
        try {
          transcript = await fs.readFile(transcript, "utf-8");
        } catch {
          // treat as inline
        }
      }
    }
    rl.close();
  }

  const combined = [summary, transcript].filter(Boolean).join("\n\n---\n\n");
  if (!combined) {
    console.log("No summary or transcript provided. Use --summary, --transcript, or --paste.");
    process.exit(1);
  }

  const output = await runDebriefSynthesis(combined);
  console.log(output);
}

export function buildDebriefUserMessage(combined: string): string {
  return `Process this meeting summary and/or transcript. Synthesise into Obsidian notes, add action items to Todoist (mark priority items as high priority), and carve out calendar focus blocks for priority tasks.\n\n## Meeting summary and/or transcript\n\n${combined}`;
}

export async function runDebriefSynthesis(
  combined: string,
  options?: { mode?: AgentMode; proposalCollector?: ProposalCollector }
): Promise<string> {
  const trigger = getTrigger("meeting_debrief");
  const userMessage = buildDebriefUserMessage(combined);

  console.log("Synthesising into Obsidian, Todoist, and calendar blocks...\n");
  const result = await runWithPrompt(trigger.systemPrompt, userMessage, {
    mode: options?.mode,
    proposalCollector: options?.proposalCollector,
  });
  return (result?.output ?? result?.output_text ?? "").toString();
}
