import type { Proposal } from "./job-store.js";
import * as calendar from "../tools/calendar.js";
import * as todoist from "../tools/todoist.js";
import * as obsidian from "../tools/obsidian.js";
import { appendMemory } from "../orchestrator/state.js";

export interface ExecuteProposalsResult {
  ok: boolean;
  results: { proposalId: Proposal["id"]; ok: boolean; output: unknown; error?: string }[];
}

export async function executeProposals(_proposals: Proposal[]): Promise<ExecuteProposalsResult> {
  const proposals = _proposals;
  const results: ExecuteProposalsResult["results"] = [];

  for (const p of proposals) {
    try {
      let output: unknown;
      switch (p.toolName) {
        case "calendar_create_event": {
          output = await calendar.createEvent(p.args as Parameters<typeof calendar.createEvent>[0]);
          break;
        }
        case "todoist_add_task": {
          output = await todoist.addTask(p.args as Parameters<typeof todoist.addTask>[0]);
          break;
        }
        case "todoist_update_task": {
          output = await todoist.updateTask(p.args as Parameters<typeof todoist.updateTask>[0]);
          break;
        }
        case "todoist_close_task": {
          output = await todoist.closeTask(p.args as Parameters<typeof todoist.closeTask>[0]);
          break;
        }
        case "obsidian_write_note": {
          output = await obsidian.writeNote(p.args as Parameters<typeof obsidian.writeNote>[0]);
          break;
        }
        case "obsidian_append_to_note": {
          output = await obsidian.appendToNote(p.args as Parameters<typeof obsidian.appendToNote>[0]);
          break;
        }
        case "save_memory": {
          const input = p.args as Parameters<typeof appendMemory>[0];
          const entry = await appendMemory(input);
          output = JSON.stringify({ success: true, id: entry.id, at: entry.at });
          break;
        }
        default:
          throw new Error(`Unknown toolName: ${p.toolName}`);
      }

      results.push({ proposalId: p.id, ok: true, output });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ proposalId: p.id, ok: false, output: undefined, error: message });
    }
  }

  const ok = results.every((r) => r.ok);
  return { ok, results };
}

