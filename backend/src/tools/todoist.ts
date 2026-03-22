/**
 * Todoist tools — REST API (api/v1). Supports personal (patrick@shiel.io) and work (patrick@xwave.ie).
 * Use TODOIST_API_TOKEN_PERSONAL and TODOIST_API_TOKEN_WORK, or a single TODOIST_API_TOKEN for one account.
 */

import * as todoistApi from "../lib/todoist-api.js";
import { z } from "zod";
import type { Context } from "../config/contexts.js";

const TODOIST_410_MESSAGE =
  "Todoist returned 410 (Gone): the REST API base has moved. This app now uses /api/v1/. If you still see 410, use a personal API token from https://app.todoist.com/app/settings/integrations and run: npm run todoist-test";

function formatTodoistError(e: unknown): string {
  const err = e as { httpStatusCode?: number };
  if (err?.httpStatusCode === 410 || String(e).includes("410")) return TODOIST_410_MESSAGE;
  return String(e);
}

const contextSchema = z.enum(["personal", "work"]).nullable().optional().describe("personal = patrick@shiel.io, work = patrick@xwave.ie");

const NOT_CONFIGURED_MESSAGE = "Todoist not configured. Set TODOIST_API_TOKEN (or TODOIST_API_TOKEN_PERSONAL).";

function getToken(context?: Context): string | null {
  return context === "work"
    ? process.env.TODOIST_API_TOKEN_WORK ?? null
    : context === "personal"
      ? process.env.TODOIST_API_TOKEN_PERSONAL ?? process.env.TODOIST_API_TOKEN ?? null
      : process.env.TODOIST_API_TOKEN_PERSONAL ?? process.env.TODOIST_API_TOKEN ?? process.env.TODOIST_API_TOKEN_WORK ?? null;
}

/** Single account: first available token. Use for one-organisation setup. */
export function getDefaultToken(): string | null {
  return (
    process.env.TODOIST_API_TOKEN ??
    process.env.TODOIST_API_TOKEN_PERSONAL ??
    process.env.TODOIST_API_TOKEN_WORK ??
    null
  );
}

/** Returns which contexts have a token configured. With one token, returns a single context. */
export function getConfiguredContexts(): ("personal" | "work")[] {
  const contexts: ("personal" | "work")[] = [];
  if (getToken("personal")) contexts.push("personal");
  if (getToken("work")) contexts.push("work");
  return contexts;
}

export const listProjectsSchema = z.object({
  context: contextSchema,
});

export const listTasksSchema = z.object({
  context: contextSchema,
  projectId: z.string().nullable().optional(),
  sectionId: z.string().nullable().optional(),
  labelId: z.string().nullable().optional(),
  filter: z.string().nullable().optional().describe("Todoist filter string e.g. 'today' or 'overdue'"),
});

export const addTaskSchema = z.object({
  context: contextSchema,
  content: z.string(),
  projectId: z.string().nullable().optional(),
  dueString: z.string().nullable().optional().describe("Due date and optionally time. Use specific datetime for prep tasks, e.g. '2025-11-12 09:00' or 'Nov 12 2025 9:00 AM'. Natural: 'today', 'tomorrow'."),
  priority: z.number().min(1).max(4).nullable().optional(),
  description: z.string().nullable().optional().describe("Task description. For prep tasks include meeting name, meeting date/time, and what the prep is for."),
});

export const updateTaskSchema = z.object({
  context: contextSchema,
  taskId: z.string(),
  content: z.string().nullable().optional(),
  dueString: z.string().nullable().optional(),
  priority: z.number().min(1).max(4).nullable().optional(),
  description: z.string().max(10000).nullable().optional().describe("Task description (markdown supported)."),
});

export const closeTaskSchema = z.object({
  context: contextSchema,
  taskId: z.string(),
});

export type ListProjectsInput = z.infer<typeof listProjectsSchema>;
export type ListTasksInput = z.infer<typeof listTasksSchema>;
export type AddTaskInput = z.infer<typeof addTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CloseTaskInput = z.infer<typeof closeTaskSchema>;

function getContext(input: { context?: Context | null }): Context | undefined {
  return input.context ?? undefined;
}

export async function listProjects(input: ListProjectsInput): Promise<string> {
  const token = getContext(input) != null ? getToken(getContext(input) ?? "personal") : getDefaultToken();
  if (!token) return JSON.stringify({ error: NOT_CONFIGURED_MESSAGE });
  try {
    const projects = await todoistApi.getProjects(token);
    return JSON.stringify({ context: getContext(input) ?? "personal", projects });
  } catch (e) {
    return JSON.stringify({ error: formatTodoistError(e) });
  }
}

export async function listTasks(input: ListTasksInput): Promise<string> {
  const ctx = getContext(input) ?? "personal";
  const token = getContext(input) != null ? getToken(ctx) : getDefaultToken();
  if (!token) return JSON.stringify({ error: NOT_CONFIGURED_MESSAGE });
  try {
    const params: { project_id?: string; section_id?: string; label_id?: string; filter?: string } = {};
    if (input.projectId != null) params.project_id = input.projectId;
    if (input.sectionId != null) params.section_id = input.sectionId;
    if (input.labelId != null) params.label_id = input.labelId;
    if (input.filter != null) params.filter = input.filter;
    const tasks = await todoistApi.getTasks(token, Object.keys(params).length ? params : undefined);
    return JSON.stringify({ context: ctx, tasks });
  } catch (e) {
    return JSON.stringify({ error: formatTodoistError(e) });
  }
}

export async function addTask(input: AddTaskInput): Promise<string> {
  const ctx = getContext(input) ?? "personal";
  const token = getContext(input) != null ? getToken(ctx) : getDefaultToken();
  if (!token) return JSON.stringify({ error: NOT_CONFIGURED_MESSAGE });
  try {
    const content = input.content.trim();
    const task = await todoistApi.addTask(token, {
      content,
      project_id: input.projectId ?? undefined,
      due_string: input.dueString ?? undefined,
      priority: input.priority ?? undefined,
      description: input.description ?? undefined,
    });
    return JSON.stringify({ context: ctx, ...(task as object) });
  } catch (e) {
    return JSON.stringify({ error: formatTodoistError(e) });
  }
}

export async function updateTask(input: UpdateTaskInput): Promise<string> {
  const ctx = getContext(input) ?? "personal";
  const token = getContext(input) != null ? getToken(ctx) : getDefaultToken();
  if (!token) return JSON.stringify({ error: NOT_CONFIGURED_MESSAGE });
  try {
    const content = input.content != null ? input.content.trim() : undefined;
    const description =
      input.description === undefined
        ? undefined
        : input.description === null
          ? ""
          : input.description.trim();
    await todoistApi.updateTask(token, input.taskId, {
      content,
      due_string: input.dueString ?? undefined,
      priority: input.priority ?? undefined,
      description,
    });
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ error: formatTodoistError(e) });
  }
}

export async function closeTask(input: CloseTaskInput): Promise<string> {
  const token = getContext(input) != null ? getToken(getContext(input) ?? "personal") : getDefaultToken();
  if (!token) return JSON.stringify({ error: NOT_CONFIGURED_MESSAGE });
  try {
    await todoistApi.closeTask(token, input.taskId);
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ error: formatTodoistError(e) });
  }
}
