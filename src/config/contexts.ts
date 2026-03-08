/**
 * Personal vs Work context for the assistant.
 * patrick@shiel.io = personal, patrick@xwave.ie = work.
 * Used across calendar, Todoist, email, and Obsidian so the agent can manage both lives.
 */

export type Context = "personal" | "work";

export const PERSONAL_EMAIL = process.env.PERSONAL_EMAIL || "patrick@shiel.io";
export const WORK_EMAIL = process.env.WORK_EMAIL || "patrick@xwave.ie";

export const CONTEXT_LABELS: Record<Context, string> = {
  personal: PERSONAL_EMAIL,
  work: WORK_EMAIL,
};

/** All contexts the assistant manages (for unified views). */
export const ALL_CONTEXTS: Context[] = ["personal", "work"];

export function getContextLabel(context: Context): string {
  return CONTEXT_LABELS[context];
}
