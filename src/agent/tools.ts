/**
 * LangChain tool definitions for the personal assistant.
 * Each tool is a narrow, typed function the LLM can call.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as calendar from "../tools/calendar.js";
import * as todoist from "../tools/todoist.js";
import * as email from "../tools/email.js";
import * as obsidian from "../tools/obsidian.js";
import { appendMemory } from "../orchestrator/state.js";

export const calendarListEvents = tool(
  async (input: z.infer<typeof calendar.listEventsSchema>) => calendar.listEvents(input),
  {
    name: "calendar_list_events",
    description: "List calendar events in a time range for one context (personal or work).",
    schema: calendar.listEventsSchema,
  }
);

export const calendarListEventsBoth = tool(
  async (input: z.infer<typeof calendar.listEventsBothSchema>) => calendar.listEventsBoth(input),
  {
    name: "calendar_list_events_both",
    description: "List events from BOTH personal and work calendars in one call. Returns merged events with each labelled personal or work. Use this for overviews, weekly prep, or whenever you need a unified view of both calendars. Pass timeMin and timeMax as ISO datetimes.",
    schema: calendar.listEventsBothSchema,
  }
);

export const calendarCreateEvent = tool(
  async (input: z.infer<typeof calendar.createEventSchema>) => calendar.createEvent(input),
  {
    name: "calendar_create_event",
    description: "Create a new calendar event. Prefer approval for high-stakes meetings.",
    schema: calendar.createEventSchema,
  }
);

export const todoistListProjects = tool(
  async () => todoist.listProjects({}),
  {
    name: "todoist_list_projects",
    description: "List all Todoist projects.",
    schema: z.object({}),
  }
);

export const todoistListTasks = tool(
  async (input: z.infer<typeof todoist.listTasksSchema>) => todoist.listTasks(input),
  {
    name: "todoist_list_tasks",
    description: "List tasks. Optional: projectId, filter (e.g. 'today', 'overdue').",
    schema: todoist.listTasksSchema,
  }
);

export const todoistAddTask = tool(
  async (input: z.infer<typeof todoist.addTaskSchema>) => todoist.addTask(input),
  {
    name: "todoist_add_task",
    description: "Add a task to Todoist. For prep/meeting tasks: start content with the task's due date and time (same as dueString), e.g. '2025-03-12 09:00 - Prepare slide deck for...', so titles sort by when to do the task; always set description and dueString. Optional: projectId, priority 1-4.",
    schema: todoist.addTaskSchema,
  }
);

export const todoistUpdateTask = tool(
  async (input: z.infer<typeof todoist.updateTaskSchema>) => todoist.updateTask(input),
  {
    name: "todoist_update_task",
    description: "Update a task (content, due date, priority).",
    schema: todoist.updateTaskSchema,
  }
);

export const todoistCloseTask = tool(
  async (input: z.infer<typeof todoist.closeTaskSchema>) => todoist.closeTask(input),
  {
    name: "todoist_close_task",
    description: "Mark a task as complete.",
    schema: todoist.closeTaskSchema,
  }
);

export const emailListMessages = tool(
  async (input: z.infer<typeof email.listMessagesSchema>) => email.listMessages(input),
  {
    name: "email_list_messages",
    description: "List recent emails. Optional: q (Gmail search), maxResults.",
    schema: email.listMessagesSchema,
  }
);

export const emailGetMessage = tool(
  async (input: z.infer<typeof email.getMessageSchema>) => email.getMessage(input),
  {
    name: "email_get_message",
    description: "Get full content of one email by ID.",
    schema: email.getMessageSchema,
  }
);

export const emailDraftReply = tool(
  async (input: z.infer<typeof email.draftReplySchema>) => email.draftReply(input),
  {
    name: "email_draft_reply",
    description: "Draft or send a reply. Use send: true to send; consider approval for send.",
    schema: email.draftReplySchema,
  }
);

export const obsidianListNotes = tool(
  async (input: z.infer<typeof obsidian.listNotesSchema>) => obsidian.listNotes(input),
  {
    name: "obsidian_list_notes",
    description: "List markdown notes in the vault, optionally in a subfolder.",
    schema: obsidian.listNotesSchema,
  }
);

export const obsidianReadNote = tool(
  async (input: z.infer<typeof obsidian.readNoteSchema>) => obsidian.readNote(input),
  {
    name: "obsidian_read_note",
    description: "Read a note's content and frontmatter by path relative to vault.",
    schema: obsidian.readNoteSchema,
  }
);

export const obsidianWriteNote = tool(
  async (input: z.infer<typeof obsidian.writeNoteSchema>) => obsidian.writeNote(input),
  {
    name: "obsidian_write_note",
    description: "Create or overwrite a note. Optional frontmatter.",
    schema: obsidian.writeNoteSchema,
  }
);

export const obsidianAppendToNote = tool(
  async (input: z.infer<typeof obsidian.appendToNoteSchema>) => obsidian.appendToNote(input),
  {
    name: "obsidian_append_to_note",
    description: "Append content to an existing note.",
    schema: obsidian.appendToNoteSchema,
  }
);

export const obsidianSearchNotes = tool(
  async (input: z.infer<typeof obsidian.searchNotesSchema>) => obsidian.searchNotes(input),
  {
    name: "obsidian_search_notes",
    description: "Search note contents for a query string.",
    schema: obsidian.searchNotesSchema,
  }
);

const saveMemorySchema = z.object({
  content: z.string().describe("The fact, observation, or preference to remember"),
  type: z.enum(["observation", "preference", "fact", "summary"]).describe("Kind of memory"),
});

export const saveMemory = tool(
  async (input: z.infer<typeof saveMemorySchema>) => {
    const entry = await appendMemory({ content: input.content, type: input.type });
    return JSON.stringify({ success: true, id: entry.id, at: entry.at });
  },
  {
    name: "save_memory",
    description: "Save a fact, observation, or preference to long-term memory so future runs can use it. Use for: user preferences, recurring patterns, or important context.",
    schema: saveMemorySchema,
  }
);

export const assistantTools = [
  calendarListEvents,
  calendarListEventsBoth,
  calendarCreateEvent,
  todoistListProjects,
  todoistListTasks,
  todoistAddTask,
  todoistUpdateTask,
  todoistCloseTask,
  emailListMessages,
  emailGetMessage,
  emailDraftReply,
  obsidianListNotes,
  obsidianReadNote,
  obsidianWriteNote,
  obsidianAppendToNote,
  obsidianSearchNotes,
  saveMemory,
];
