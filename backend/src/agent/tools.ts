/**
 * LangChain tool definitions for the personal assistant.
 * Each tool is a narrow, typed function the LLM can call.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import * as calendar from "../tools/calendar.js";
import * as todoist from "../tools/todoist.js";
import * as email from "../tools/email.js";
import * as obsidian from "../tools/obsidian.js";
import { appendMemory } from "../orchestrator/state.js";
import type { Proposal } from "../api/job-store.js";

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
    description:
      'Create a new calendar event on personal or work Google Calendar. Use calendarId "primary" unless a specific calendar is required. Start/end as ISO datetimes.',
    schema: calendar.createEventSchema,
  }
);

export const calendarUpdateEvent = tool(
  async (input: z.infer<typeof calendar.updateEventSchema>) => calendar.updateEvent(input),
  {
    name: "calendar_update_event",
    description:
      'Update an existing event (summary and/or start/end times). Use context personal or work, calendarId usually "primary". eventId may be composite "personal:googleId" or "work:googleId" from listings, or the raw Google id.',
    schema: calendar.updateEventSchema,
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

export type AgentMode = "execute" | "propose";

export interface ProposalCollector {
  proposals: Proposal[];
  add: (toolName: string, args: unknown) => Proposal;
}

export function createProposalCollector(): ProposalCollector {
  const proposals: Proposal[] = [];
  return {
    proposals,
    add: (toolName, args) => {
      const id = `prop_${Date.now()}_${randomBytes(4).toString("hex")}`;
      const proposal: Proposal = { id, toolName, args };
      // Agent uses this list for UI approvals; order matters for "execute in sequence".
      proposals.push(proposal);
      return proposal;
    },
  };
}

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

export const assistantToolsExecute = [
  calendarListEvents,
  calendarListEventsBoth,
  calendarCreateEvent,
  calendarUpdateEvent,
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

// Backwards compatibility: existing code imports `assistantTools`.
export const assistantTools = assistantToolsExecute;

export function makeAssistantTools(mode: AgentMode, collector?: ProposalCollector) {
  if (mode === "execute") return assistantToolsExecute;
  if (!collector) throw new Error("makeAssistantTools('propose') requires a ProposalCollector");

  const calendarCreateEventPropose = tool(
    async (input: z.infer<typeof calendar.createEventSchema>) => {
      const proposal = collector.add("calendar_create_event", input);
      return JSON.stringify({ success: true, proposalId: proposal.id });
    },
    {
      name: "calendar_create_event",
      description:
        "Propose creating a new calendar event (personal/work, calendarId usually primary). Approval required before execution.",
      schema: calendar.createEventSchema,
    }
  );

  const calendarUpdateEventPropose = tool(
    async (input: z.infer<typeof calendar.updateEventSchema>) => {
      const proposal = collector.add("calendar_update_event", input);
      return JSON.stringify({ success: true, proposalId: proposal.id });
    },
    {
      name: "calendar_update_event",
      description:
        "Propose updating an event (title/time). eventId from listings may be personal:id or work:id. Approval required before execution.",
      schema: calendar.updateEventSchema,
    }
  );

  const todoistAddTaskPropose = tool(
    async (input: z.infer<typeof todoist.addTaskSchema>) => {
      const proposal = collector.add("todoist_add_task", input);
      return JSON.stringify({ success: true, proposalId: proposal.id });
    },
    {
      name: "todoist_add_task",
      description: "Propose adding a task to Todoist. Approval required before execution.",
      schema: todoist.addTaskSchema,
    }
  );

  const todoistUpdateTaskPropose = tool(
    async (input: z.infer<typeof todoist.updateTaskSchema>) => {
      const proposal = collector.add("todoist_update_task", input);
      return JSON.stringify({ success: true, proposalId: proposal.id });
    },
    {
      name: "todoist_update_task",
      description: "Propose updating a task in Todoist. Approval required before execution.",
      schema: todoist.updateTaskSchema,
    }
  );

  const todoistCloseTaskPropose = tool(
    async (input: z.infer<typeof todoist.closeTaskSchema>) => {
      const proposal = collector.add("todoist_close_task", input);
      return JSON.stringify({ success: true, proposalId: proposal.id });
    },
    {
      name: "todoist_close_task",
      description: "Propose closing a task in Todoist. Approval required before execution.",
      schema: todoist.closeTaskSchema,
    }
  );

  const obsidianWriteNotePropose = tool(
    async (input: z.infer<typeof obsidian.writeNoteSchema>) => {
      const proposal = collector.add("obsidian_write_note", input);
      return JSON.stringify({ success: true, proposalId: proposal.id });
    },
    {
      name: "obsidian_write_note",
      description: "Propose overwriting/creating an Obsidian note. Approval required before execution.",
      schema: obsidian.writeNoteSchema,
    }
  );

  const obsidianAppendToNotePropose = tool(
    async (input: z.infer<typeof obsidian.appendToNoteSchema>) => {
      const proposal = collector.add("obsidian_append_to_note", input);
      return JSON.stringify({ success: true, proposalId: proposal.id });
    },
    {
      name: "obsidian_append_to_note",
      description: "Propose appending to an Obsidian note. Approval required before execution.",
      schema: obsidian.appendToNoteSchema,
    }
  );

  const saveMemoryPropose = tool(
    async (input: z.infer<typeof saveMemorySchema>) => {
      const proposal = collector.add("save_memory", input);
      return JSON.stringify({ success: true, proposalId: proposal.id });
    },
    {
      name: "save_memory",
      description: "Propose saving a long-term memory entry. Approval required before execution.",
      schema: saveMemorySchema,
    }
  );

  return [
    calendarListEvents,
    calendarListEventsBoth,
    // Replace writes with proposal versions
    calendarCreateEventPropose,
    calendarUpdateEventPropose,
    todoistListProjects,
    todoistListTasks,
    todoistAddTaskPropose,
    todoistUpdateTaskPropose,
    todoistCloseTaskPropose,
    emailListMessages,
    emailGetMessage,
    emailDraftReply,
    obsidianListNotes,
    obsidianReadNote,
    obsidianWriteNotePropose,
    obsidianAppendToNotePropose,
    obsidianSearchNotes,
    saveMemoryPropose,
  ];
}
