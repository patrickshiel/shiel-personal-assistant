import { groupCalendarEventsByDateKey, type CalendarEventDto } from "@/lib/calendar-events";
import { collectTimedItemsForDay } from "@/lib/schedule-time-grid";
import type { TaskDataItem } from "@/lib/tasks-week";

const MAX_MARKDOWN_CHARS = 100_000;

function formatLocalRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  return `${start.toLocaleString(undefined, opts)} – ${end.toLocaleString(undefined, opts)}`;
}

/**
 * One markdown blob for the Schedule (single-day) assistant: tasks + timed calendar segments + all-day events.
 */
export function buildScheduleDayContextMarkdown(
  dateKey: string,
  dayDate: Date,
  tasksFull: TaskDataItem[],
  calendarEvents: CalendarEventDto[]
): string {
  const humanDate = dayDate.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let md = `# Schedule snapshot\n\n**Date:** ${humanDate} (\`${dateKey}\`)\n\n`;

  md += `## Todoist (tasks due this day)\n\n`;
  if (tasksFull.length === 0) {
    md += `_No tasks due this day._\n\n`;
  } else {
    for (const t of tasksFull) {
      md += `### ${t.content.replace(/\n/g, " ")}\n`;
      md += `- **id:** \`${t.id}\`\n`;
      md += `- **priority:** ${t.priority}\n`;
      md += `- **context:** ${t.context}\n`;
      const dueLine =
        t.due?.datetime ?? t.due?.date ?? t.due_string ?? "—";
      md += `- **due / due_string:** ${dueLine}\n`;
      if (t.duration) {
        md += `- **duration:** ${t.duration.amount} ${t.duration.unit}\n`;
      }
      if (t.description?.trim()) {
        md += `- **description:**\n\n${t.description}\n\n`;
      } else {
        md += `\n`;
      }
    }
  }

  md += `## Calendar — timed (grid segments, local)\n\n`;
  const timedItems = collectTimedItemsForDay(dateKey, dayDate, tasksFull, calendarEvents).filter(
    (it) => it.kind === "calendar" && it.event
  );
  if (timedItems.length === 0) {
    md += `_No timed calendar blocks on this day (or calendar not loaded)._\n\n`;
  } else {
    timedItems.sort((a, b) => a.start.getTime() - b.start.getTime());
    for (const it of timedItems) {
      const ev = it.event!;
      md += `### ${ev.title.replace(/\n/g, " ")}\n`;
      md += `- **id:** \`${ev.id}\`\n`;
      md += `- **context:** ${ev.context}\n`;
      md += `- **local segment:** ${formatLocalRange(it.start, it.end)}\n`;
      md += `- **allDay:** ${ev.allDay}\n`;
      if (ev.responseStatus) md += `- **responseStatus:** ${ev.responseStatus}\n`;
      if (ev.htmlLink) md += `- **htmlLink:** ${ev.htmlLink}\n`;
      md += `\n`;
    }
  }

  md += `## Calendar — all-day\n\n`;
  const byDay = groupCalendarEventsByDateKey(calendarEvents);
  const allDayForKey = (byDay.get(dateKey) ?? []).filter((e) => e.allDay);
  if (allDayForKey.length === 0) {
    md += `_No all-day events on this day._\n\n`;
  } else {
    for (const ev of allDayForKey) {
      md += `### ${ev.title.replace(/\n/g, " ")}\n`;
      md += `- **id:** \`${ev.id}\`\n`;
      md += `- **context:** ${ev.context}\n`;
      md += `- **start / end (API):** ${ev.start} → ${ev.end}\n`;
      if (ev.responseStatus) md += `- **responseStatus:** ${ev.responseStatus}\n`;
      if (ev.htmlLink) md += `- **htmlLink:** ${ev.htmlLink}\n`;
      md += `\n`;
    }
  }

  if (md.length > MAX_MARKDOWN_CHARS) {
    const head = md.slice(0, MAX_MARKDOWN_CHARS - 400);
    return `${head}\n\n---\n\n_…truncated: snapshot exceeded ${MAX_MARKDOWN_CHARS} characters._\n`;
  }

  return md;
}
