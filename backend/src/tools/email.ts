/**
 * Email tools — Gmail API (or IMAP/Nodemailer later).
 * Scope: list messages, get body, draft/send reply.
 * Consider human-in-the-loop for send_email.
 */

import { z } from "zod";

export const listMessagesSchema = z.object({
  maxResults: z.number().nullable().optional().default(20),
  q: z.string().nullable().optional().describe("Gmail search query e.g. 'is:unread'"),
  labelIds: z.array(z.string()).nullable().optional(),
});

export const getMessageSchema = z.object({
  messageId: z.string(),
});

export const draftReplySchema = z.object({
  messageId: z.string(),
  body: z.string(),
  send: z.boolean().nullable().optional().default(false).describe("If true, send immediately (consider approval if false)."),
});

export type ListMessagesInput = z.infer<typeof listMessagesSchema>;
export type GetMessageInput = z.infer<typeof getMessageSchema>;
export type DraftReplyInput = z.infer<typeof draftReplySchema>;

export async function listMessages(_input: ListMessagesInput): Promise<string> {
  return JSON.stringify({
    messages: [],
    message: "Email integration not yet implemented. Configure Gmail API or IMAP and implement listMessages.",
  });
}

export async function getMessage(_input: GetMessageInput): Promise<string> {
  return JSON.stringify({
    error: "Email get not yet implemented.",
  });
}

export async function draftReply(_input: DraftReplyInput): Promise<string> {
  return JSON.stringify({
    success: false,
    message: "Email draft/send not yet implemented. Add implementation and approval step for send.",
  });
}
