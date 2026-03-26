/**
 * Tasks API: fetch tasks grouped by overdue / due today / upcoming.
 * Uses a single Todoist account (one API key).
 */

import * as todoist from "../tools/todoist.js";

export type TaskContext = "personal" | "work";

export interface TaskItem {
  id: string;
  content: string;
  due_string?: string;
  due?: { date: string; datetime?: string; [k: string]: unknown };
  duration?: { amount: number; unit: "minute" | "day" };
  priority: number;
  context: TaskContext;
  description?: string;
}

export interface TasksResponse {
  overdue: TaskItem[];
  dueToday: TaskItem[];
  upcoming: TaskItem[];
  error?: string;
}

function parseListResult(raw: string): { tasks?: unknown[]; context?: TaskContext; error?: string } {
  try {
    return JSON.parse(raw) as { tasks?: unknown[]; context?: TaskContext; error?: string };
  } catch {
    return { error: "Invalid response" };
  }
}

function toTaskItem(raw: unknown, context: TaskContext): TaskItem | null {
  if (!raw || (raw as any).id === undefined) return null;
  const t = raw as {
    id: string | number;
    content?: string;
    due_string?: string;
    due?: { date: string; datetime?: string };
    duration?: { amount?: number; unit?: string };
    priority?: number;
    description?: string;
  };
  const id = typeof t.id === "number" ? String(t.id) : t.id;
  if (typeof id !== "string") return null;
  const durationUnit = t.duration?.unit;
  const duration =
    t.duration &&
    typeof t.duration.amount === "number" &&
    (durationUnit === "minute" || durationUnit === "day")
      ? { amount: t.duration.amount, unit: durationUnit as "minute" | "day" }
      : undefined;
  return {
    id,
    content: typeof t.content === "string" ? t.content : "",
    due_string: t.due_string,
    due: t.due,
    duration,
    priority: typeof t.priority === "number" ? t.priority : 1,
    context,
    description: t.description,
  };
}

/** Normalise due to YYYY-MM-DD for comparison; returns "" if no due. */
function dueDateOnly(task: TaskItem): string {
  const d = task.due?.date ?? task.due_string ?? "";
  if (!d) return "";
  // API can return "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ssZ" etc
  return d.slice(0, 10);
}

export async function getTasksGrouped(): Promise<TasksResponse> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const overdue: TaskItem[] = [];
  const dueToday: TaskItem[] = [];
  const upcoming: TaskItem[] = [];

  const token = todoist.getDefaultToken();
  if (!token) {
    return {
      overdue,
      dueToday,
      upcoming,
      error: "Todoist not configured. Set TODOIST_API_TOKEN (or TODOIST_API_TOKEN_PERSONAL).",
    };
  }

  const raw = await todoist.listTasks({});
  const parsed = parseListResult(raw);
  if (parsed.error) {
    return { overdue, dueToday, upcoming, error: parsed.error };
  }

  const defaultContext: TaskContext = (parsed.context as TaskContext) ?? "personal";
  const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  const list = rawTasks.map((t) => toTaskItem(t, defaultContext)).filter((t): t is TaskItem => t != null);

  for (const task of list) {
    const due = dueDateOnly(task);
    if (!due) {
      upcoming.push(task);
      continue;
    }
    if (due < todayStr) overdue.push(task);
    else if (due === todayStr) dueToday.push(task);
    else upcoming.push(task);
  }

  const byDue = (a: TaskItem, b: TaskItem) => {
    const da = dueDateOnly(a);
    const db = dueDateOnly(b);
    return da.localeCompare(db);
  };
  overdue.sort(byDue);
  upcoming.sort(byDue);

  return { overdue, dueToday, upcoming };
}
