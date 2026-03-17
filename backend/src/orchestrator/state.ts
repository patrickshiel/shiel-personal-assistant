/**
 * File-based orchestrator state and long-term memory.
 * Persists across restarts so the daemon knows when triggers last ran and can give the agent context.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getStateDir } from "../lib/paths.js";

const STATE_DIR = getStateDir();
const ORCHESTRATOR_STATE_FILE = path.join(STATE_DIR, "orchestrator-state.json");
const MEMORY_FILE = path.join(STATE_DIR, "memory.json");

export interface TriggerState {
  lastRunAt: string; // ISO
  lastOutput?: string;
}

export interface OrchestratorState {
  triggers: Record<string, TriggerState>;
  updatedAt: string;
}

export interface MemoryEntry {
  id: string;
  at: string; // ISO
  content: string;
  type: "observation" | "preference" | "fact" | "summary";
}

export interface MemoryStore {
  entries: MemoryEntry[];
  updatedAt: string;
}

const defaultOrchestratorState: OrchestratorState = {
  triggers: {},
  updatedAt: new Date().toISOString(),
};

const defaultMemoryStore: MemoryStore = {
  entries: [],
  updatedAt: new Date().toISOString(),
};

async function ensureStateDir() {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

export async function loadOrchestratorState(): Promise<OrchestratorState> {
  await ensureStateDir();
  try {
    const raw = await fs.readFile(ORCHESTRATOR_STATE_FILE, "utf-8");
    const data = JSON.parse(raw) as OrchestratorState;
    return { ...defaultOrchestratorState, ...data, triggers: { ...defaultOrchestratorState.triggers, ...data.triggers } };
  } catch {
    return { ...defaultOrchestratorState };
  }
}

export async function saveOrchestratorState(state: OrchestratorState): Promise<void> {
  await ensureStateDir();
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(ORCHESTRATOR_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export async function recordTriggerRun(triggerId: string, output?: string): Promise<void> {
  const state = await loadOrchestratorState();
  state.triggers[triggerId] = {
    lastRunAt: new Date().toISOString(),
    lastOutput: output != null ? output.slice(0, 2000) : undefined,
      };
  await saveOrchestratorState(state);
}

export async function getTriggerState(triggerId: string): Promise<TriggerState | null> {
  const state = await loadOrchestratorState();
  return state.triggers[triggerId] ?? null;
}

// --- Long-term memory ---

export async function loadMemory(): Promise<MemoryStore> {
  await ensureStateDir();
  try {
    const raw = await fs.readFile(MEMORY_FILE, "utf-8");
    const data = JSON.parse(raw) as MemoryStore;
    return { ...defaultMemoryStore, ...data, entries: data.entries ?? [] };
  } catch {
    return { ...defaultMemoryStore };
  }
}

export async function appendMemory(entry: Omit<MemoryEntry, "id" | "at">): Promise<MemoryEntry> {
  const store = await loadMemory();
  const full: MemoryEntry = {
    ...entry,
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    at: new Date().toISOString(),
  };
  store.entries.push(full);
  store.updatedAt = new Date().toISOString();
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(MEMORY_FILE, JSON.stringify(store, null, 2), "utf-8");
  return full;
}

/** Get recent memory entries for injection into the agent prompt (e.g. last 50 or last 7 days). */
export async function getMemoryForPrompt(options?: { limit?: number; sinceDays?: number }): Promise<MemoryEntry[]> {
  const store = await loadMemory();
  let entries = [...store.entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (options?.sinceDays != null) {
    const since = Date.now() - options.sinceDays * 24 * 60 * 60 * 1000;
    entries = entries.filter((e) => new Date(e.at).getTime() >= since);
  }
  if (options?.limit != null) {
    entries = entries.slice(0, options.limit);
  }
  return entries;
}

/** Format memory entries as a string block for the system or user message. */
export function formatMemoryForPrompt(entries: MemoryEntry[]): string {
  if (entries.length === 0) return "";
  const lines = entries.map((e) => `- [${e.at.slice(0, 10)}] (${e.type}) ${e.content.slice(0, 500)}`);
  return `## Long-term memory (for context)\n${lines.join("\n")}\n`;
}
