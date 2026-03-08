/**
 * Minimal Todoist REST client. Default base is /api/v1/ (rest/v2 can return 410 in some regions).
 * Override with TODOIST_API_BASE in .env if needed (e.g. https://api.todoist.com/rest/v2).
 */

const DEFAULT_BASE = "https://api.todoist.com/api/v1";
const TODOIST_API_BASE = (process.env.TODOIST_API_BASE ?? DEFAULT_BASE).replace(/\/$/, "");

export class TodoistRequestError extends Error {
  constructor(
    message: string,
    public httpStatusCode?: number,
    public responseData?: unknown
  ) {
    super(message);
    this.name = "TodoistRequestError";
  }
}

async function request<T>(
  method: string,
  path: string,
  token: string,
  options?: { params?: Record<string, string>; body?: Record<string, unknown> }
): Promise<T> {
  const url = new URL(path, TODOIST_API_BASE + "/");
  if (options?.params) {
    Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  let body: string | undefined;
  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const res = await fetch(url.toString(), { method, headers, body });
  if (!res.ok) {
    const text = await res.text();
    throw new TodoistRequestError(
      `Request failed with status ${res.status}: ${text.slice(0, 200)}`,
      res.status,
      text
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** GET /projects */
export async function getProjects(token: string): Promise<unknown[]> {
  return request<unknown[]>("GET", "projects", token);
}

/** GET /tasks with optional project_id, section_id, label_id, filter */
export async function getTasks(
  token: string,
  params?: { project_id?: string; section_id?: string; label_id?: string; filter?: string }
): Promise<unknown[]> {
  const q: Record<string, string> = {};
  if (params?.project_id) q.project_id = params.project_id;
  if (params?.section_id) q.section_id = params.section_id;
  if (params?.label_id) q.label_id = params.label_id;
  if (params?.filter) q.filter = params.filter;
  return request<unknown[]>("GET", "tasks", token, { params: Object.keys(q).length ? q : undefined });
}

/** POST /tasks */
export async function addTask(
  token: string,
  args: { content: string; project_id?: string; due_string?: string; priority?: number; description?: string }
): Promise<unknown> {
  const body: Record<string, unknown> = { content: args.content };
  if (args.project_id != null) body.project_id = args.project_id;
  if (args.due_string != null) body.due_string = args.due_string;
  if (args.priority != null) body.priority = args.priority;
  if (args.description != null) body.description = args.description;
  return request<unknown>("POST", "tasks", token, { body });
}

/** POST /tasks/:id */
export async function updateTask(
  token: string,
  taskId: string,
  args: { content?: string; due_string?: string; priority?: number }
): Promise<unknown> {
  const body: Record<string, unknown> = {};
  if (args.content != null) body.content = args.content;
  if (args.due_string != null) body.due_string = args.due_string;
  if (args.priority != null) body.priority = args.priority;
  if (Object.keys(body).length === 0) return undefined;
  return request<unknown>("POST", `tasks/${taskId}`, token, { body });
}

/** POST /tasks/:id/close */
export async function closeTask(token: string, taskId: string): Promise<void> {
  await request<void>("POST", `tasks/${taskId}/close`, token);
}
