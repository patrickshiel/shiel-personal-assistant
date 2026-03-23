/**
 * Calendar tools — Google Calendar for personal (patrick@shiel.io) and work (patrick@xwave.ie).
 * Use context to target the right account.
 */

import { z } from "zod";
import { getCalendarClient } from "../lib/google-auth.js";
import type { Context } from "../config/contexts.js";

const contextSchema = z.enum(["personal", "work"]).nullable().optional().describe("personal = patrick@shiel.io, work = patrick@xwave.ie");

export const listEventsSchema = z.object({
  context: contextSchema,
  calendarId: z.string().nullable().optional().describe("Calendar ID (default primary for that context)"),
  timeMin: z.string().nullable().optional().describe("ISO datetime lower bound"),
  timeMax: z.string().nullable().optional().describe("ISO datetime upper bound"),
  maxResults: z.number().nullable().optional().default(20),
});

/** Schema for listing both calendars in one call (no context — always fetches personal + work). */
export const listEventsBothSchema = z.object({
  timeMin: z.string().nullable().optional().describe("ISO datetime lower bound (e.g. 2026-03-09T00:00:00Z)"),
  timeMax: z.string().nullable().optional().describe("ISO datetime upper bound (e.g. 2026-03-16T23:59:59Z)"),
  maxResults: z.number().nullable().optional().default(50),
});

export const createEventSchema = z.object({
  context: contextSchema,
  calendarId: z.string().nullable().optional(),
  summary: z.string(),
  description: z.string().nullable().optional(),
  start: z.string().describe("ISO datetime"),
  end: z.string().describe("ISO datetime"),
  attendees: z.array(z.string().email()).nullable().optional(),
});

export const updateEventSchema = z.object({
  context: contextSchema,
  calendarId: z.string().nullable().optional().describe('Usually "primary" for the main calendar'),
  eventId: z.string().describe("Google event id, or composite personal:id / work:id from app listings"),
  summary: z.string().nullable().optional(),
  start: z.string().nullable().optional(),
  end: z.string().nullable().optional(),
});

export const deleteEventSchema = z.object({
  context: contextSchema,
  calendarId: z.string().nullable().optional(),
  eventId: z.string(),
});

export type ListEventsInput = z.infer<typeof listEventsSchema>;
export type ListEventsBothInput = z.infer<typeof listEventsBothSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type DeleteEventInput = z.infer<typeof deleteEventSchema>;

function getContext(input: { context?: Context | null }): Context | undefined {
  return input.context ?? undefined;
}

/** App/API event ids are often `personal:googleEventId` or `work:googleEventId`; Google expects the bare id + matching OAuth context. */
function parseCompositeEventId(
  eventId: string,
  contextFromInput: Context | undefined
): { eventId: string; context: Context | undefined } {
  const m = eventId.match(/^(personal|work):(.+)$/);
  if (m) {
    const prefixCtx = m[1] as Context;
    return { eventId: m[2]!, context: prefixCtx };
  }
  return { eventId, context: contextFromInput };
}

export async function listEvents(input: ListEventsInput): Promise<string> {
  const ctx = getContext(input);
  const calendar = getCalendarClient(ctx);
  if (!calendar) {
    return JSON.stringify({
      events: [],
      error: ctx
        ? `Google Calendar not configured for ${ctx}. Set GOOGLE_REFRESH_TOKEN_${ctx.toUpperCase()} and run: npm run auth-google -- --${ctx}`
        : "Google Calendar not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, then run: npm run auth-google",
    });
  }
  try {
    const res = await calendar.events.list({
      calendarId: input.calendarId ?? "primary",
      timeMin: input.timeMin ?? undefined,
      timeMax: input.timeMax ?? undefined,
      maxResults: input.maxResults ?? 20,
      singleEvents: true,
      orderBy: "startTime",
      showHiddenInvitations: true, // include events not yet accepted (tentative, needsAction) so prep isn't missed
    });
    const events = (res.data.items ?? []).map((e) => ({
      context: ctx ?? "personal",
      id: e.id,
      summary: e.summary,
      description: e.description ?? undefined,
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
      htmlLink: e.htmlLink,
      attendees: (e.attendees ?? []).map((a) => a.email ?? a.responseStatus ?? "").filter(Boolean),
    }));
    return JSON.stringify({ context: ctx ?? "personal", events });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

/** List events from BOTH personal and work calendars in one call. Returns merged events sorted by start, each labelled with context. Use for overviews and weekly prep. */
export async function listEventsBoth(input: ListEventsBothInput): Promise<string> {
  const timeMin = input.timeMin ?? undefined;
  const timeMax = input.timeMax ?? undefined;
  const maxPer = Math.min(input.maxResults ?? 50, 50);
  const personal = await listEvents({ context: "personal", timeMin, timeMax, maxResults: maxPer });
  const work = await listEvents({ context: "work", timeMin, timeMax, maxResults: maxPer });
  const parse = (raw: string): { events?: unknown[]; error?: string } => {
    try {
      return JSON.parse(raw) as { events?: unknown[]; error?: string };
    } catch {
      return { error: raw.slice(0, 200) };
    }
  };
  const personalData = parse(personal);
  const workData = parse(work);
  const personalEvents = (personalData.events ?? []).map((e) => ({ ...(typeof e === "object" && e ? e : {}), context: "personal" as const }));
  const workEvents = (workData.events ?? []).map((e) => ({ ...(typeof e === "object" && e ? e : {}), context: "work" as const }));
  const all = [...personalEvents, ...workEvents].sort((a, b) => {
    const sa = (a as { start?: string }).start ?? "";
    const sb = (b as { start?: string }).start ?? "";
    return sa.localeCompare(sb);
  });
  return JSON.stringify({
    personalError: personalData.error ?? null,
    workError: workData.error ?? null,
    events: all,
  });
}

export async function createEvent(input: CreateEventInput): Promise<string> {
  const calendar = getCalendarClient(getContext(input));
  if (!calendar) {
    return JSON.stringify({
      success: false,
      error: "Google Calendar not configured. Run: npm run auth-google and set GOOGLE_REFRESH_TOKEN in .env",
    });
  }
  try {
    const res = await calendar.events.insert({
      calendarId: input.calendarId ?? "primary",
      requestBody: {
        summary: input.summary,
        description: input.description ?? undefined,
        start: { dateTime: input.start, timeZone: "UTC" },
        end: { dateTime: input.end, timeZone: "UTC" },
        attendees: (input.attendees ?? undefined)?.map((email) => ({ email })),
      },
    });
    return JSON.stringify({
      success: true,
      id: res.data.id,
      htmlLink: res.data.htmlLink,
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function updateEvent(input: UpdateEventInput): Promise<string> {
  const ctxFromInput = getContext(input);
  const { eventId: googleEventId, context: fromComposite } = parseCompositeEventId(input.eventId, ctxFromInput);
  const effectiveContext = fromComposite ?? ctxFromInput;
  const calendar = getCalendarClient(effectiveContext);
  if (!calendar) {
    return JSON.stringify({ success: false, error: "Google Calendar not configured." });
  }
  try {
    const body: { summary?: string; start?: { dateTime: string }; end?: { dateTime: string } } = {};
    if (input.summary) body.summary = input.summary;
    if (input.start) body.start = { dateTime: input.start };
    if (input.end) body.end = { dateTime: input.end };
    if (Object.keys(body).length === 0) {
      return JSON.stringify({ success: false, error: "At least one of summary, start, or end must be provided." });
    }
    await calendar.events.patch({
      calendarId: input.calendarId || "primary",
      eventId: googleEventId,
      requestBody: body,
    });
    return JSON.stringify({ success: true });
  } catch (err) {
    return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function deleteEvent(input: DeleteEventInput): Promise<string> {
  const ctxFromInput = getContext(input);
  const { eventId: googleEventId, context: fromComposite } = parseCompositeEventId(input.eventId, ctxFromInput);
  const effectiveContext = fromComposite ?? ctxFromInput;
  const calendar = getCalendarClient(effectiveContext);
  if (!calendar) {
    return JSON.stringify({ success: false, error: "Google Calendar not configured." });
  }
  try {
    await calendar.events.delete({
      calendarId: input.calendarId || "primary",
      eventId: googleEventId,
    });
    return JSON.stringify({ success: true });
  } catch (err) {
    return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}
