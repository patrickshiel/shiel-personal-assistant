import { google } from "googleapis";

export type CalendarContext = "personal" | "work";

export type NormalizedCalendarEvent = {
  id: string;
  title: string;
  context: CalendarContext;
  allDay: boolean;
  /** ISO datetime or YYYY-MM-DD for all-day start */
  start: string;
  /** ISO datetime or YYYY-MM-DD (exclusive end date for all-day per Google) */
  end: string;
  htmlLink?: string;
};

function getOAuthClient(context: CalendarContext) {
  const clientId =
    context === "work"
      ? (process.env.GOOGLE_CLIENT_ID_WORK ?? process.env.GOOGLE_CLIENT_ID)
      : process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    context === "work"
      ? (process.env.GOOGLE_CLIENT_SECRET_WORK ?? process.env.GOOGLE_CLIENT_SECRET)
      : process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken =
    context === "work" ? process.env.GOOGLE_REFRESH_TOKEN_WORK : process.env.GOOGLE_REFRESH_TOKEN_PERSONAL;

  if (!clientId || !clientSecret || !refreshToken) return null;

  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth2callback";
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

export function isCalendarConfigured(context: CalendarContext): boolean {
  return getOAuthClient(context) != null;
}

/**
 * List events from the user's primary calendar in [timeMin, timeMax].
 */
export async function listPrimaryCalendarEvents(
  context: CalendarContext,
  timeMin: Date,
  timeMax: Date
): Promise<NormalizedCalendarEvent[]> {
  const auth = getOAuthClient(context);
  if (!auth) return [];

  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  const items = res.data.items ?? [];
  const out: NormalizedCalendarEvent[] = [];

  for (const ev of items) {
    if (!ev.id) continue;
    const title = ev.summary?.trim() || "(No title)";
    const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
    if (allDay) {
      const startDate = ev.start?.date;
      const endDate = ev.end?.date;
      if (!startDate || !endDate) continue;
      out.push({
        id: `${context}:${ev.id}`,
        title,
        context,
        allDay: true,
        start: startDate,
        end: endDate,
        htmlLink: ev.htmlLink ?? undefined,
      });
      continue;
    }
    const start = ev.start?.dateTime;
    const end = ev.end?.dateTime;
    if (!start || !end) continue;
    out.push({
      id: `${context}:${ev.id}`,
      title,
      context,
      allDay: false,
      start,
      end,
      htmlLink: ev.htmlLink ?? undefined,
    });
  }

  return out;
}
