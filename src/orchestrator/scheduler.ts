/**
 * In-process task manager: runs the orchestration agent on a built-in timer.
 * No external cron — one long-running process that knows when each trigger is due,
 * persists state to disk, and injects long-term memory into the agent.
 *
 * Start with: npm run orchestrate
 */

import "dotenv/config";
import { runWithPrompt } from "../agent/graph.js";
import { getTrigger, getScheduledTriggerIds, type TriggerId } from "./triggers.js";
import { getNextRun } from "./next-run.js";
import {
  loadOrchestratorState,
  recordTriggerRun,
  getTriggerState,
  getMemoryForPrompt,
  formatMemoryForPrompt,
  type OrchestratorState,
} from "./state.js";

const TICK_MS = 15 * 1000; // check every 15 seconds for due triggers

function log(triggerId: string, message: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${triggerId}] ${message}`);
}

function logScheduler(message: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [scheduler] ${message}`);
}

/** Compute next run time for a trigger (from cron); if never run, use now. */
function getNextRunForTrigger(triggerId: TriggerId, state: OrchestratorState): Date {
  const trigger = getTrigger(triggerId);
  if (!trigger.schedule) return new Date(0);
  const last = state.triggers[triggerId]?.lastRunAt;
  const after = last ? new Date(last) : new Date(0);
  return getNextRun(trigger.schedule, after);
}

export async function runTrigger(triggerId: TriggerId): Promise<string | undefined> {
  const trigger = getTrigger(triggerId);
  log(triggerId, "Starting");

  const [memoryEntries] = await Promise.all([getMemoryForPrompt({ limit: 30, sinceDays: 14 })]);
  const memoryContext = formatMemoryForPrompt(memoryEntries);
  const triggerState = await getTriggerState(triggerId);
  const lastRunContext = triggerState?.lastOutput
    ? `Last run (${triggerState.lastRunAt}): ${triggerState.lastOutput.slice(0, 800)}`
    : undefined;

  try {
    const result = await runWithPrompt(trigger.systemPrompt, trigger.defaultInput, {
      memoryContext: memoryContext || undefined,
      lastRunContext,
    });
    const output = (result?.output ?? result?.output_text ?? "(no output)").toString();
    log(triggerId, "Done");
    if (output.length > 0) {
      console.log(output.slice(0, 500) + (output.length > 500 ? "…" : ""));
    }
    await recordTriggerRun(triggerId, output);
    return output;
  } catch (err) {
    log(triggerId, `Error: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
    await recordTriggerRun(triggerId, undefined);
    return undefined;
  }
}

/** Main loop: wake periodically, find which triggers are due, run them, then sleep until next due time. */
async function runLoop() {
  const triggerIds = getScheduledTriggerIds();
  if (triggerIds.length === 0) {
    logScheduler("No scheduled triggers; exiting.");
    return;
  }

  logScheduler(`Task manager started. Triggers: ${triggerIds.join(", ")}. Tick every ${TICK_MS / 1000}s.`);

  const runDueTriggers = async () => {
    const state = await loadOrchestratorState();
    const now = Date.now();

    for (const id of triggerIds) {
      const next = getNextRunForTrigger(id, state);
      if (next.getTime() <= now) {
        await runTrigger(id);
      }
    }
  };

  await runDueTriggers();

  const scheduleNextWake = () => {
    loadOrchestratorState().then((state) => {
      let nextAt = Infinity;
      for (const id of triggerIds) {
        const t = getNextRunForTrigger(id, state);
        if (t.getTime() > Date.now() && t.getTime() < nextAt) {
          nextAt = t.getTime();
        }
      }
      const delay = nextAt === Infinity ? TICK_MS : Math.min(TICK_MS, Math.max(1000, nextAt - Date.now()));
      setTimeout(async () => {
        await runDueTriggers();
        scheduleNextWake();
      }, delay);
    });
  };

  scheduleNextWake();
}

export function startScheduler() {
  logScheduler("Orchestrator running in background. State: state/orchestrator-state.json. Memory: state/memory.json.");
  runLoop().catch((err) => {
    console.error("Scheduler loop error:", err);
    process.exit(1);
  });
}
