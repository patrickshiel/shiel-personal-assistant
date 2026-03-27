import "./lib/load-env.js";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { cognitoAuthMiddleware } from "./lib/auth.js";

import { getAllTriggerIds, getTrigger, type TriggerId } from "./orchestrator/triggers.js";
import { newId, createJob, loadJob, listJobs, saveJob, type JobRecord } from "./api/job-store.js";
import {
  proposeAssistant,
  proposeScheduleDayAssistant,
  proposeTaskRefinement,
  proposeTrigger,
} from "./api/propose-run.js";
import { executeProposals } from "./api/execute-run.js";
import { createProposalCollector } from "./agent/tools.js";
import { runWeeklyPrepApplyFromMarkdown, runWeeklyPrepList } from "./orchestrator/weekly-prep.js";
import { runDebriefSynthesis } from "./cli/debrief.js";
import { getStateDir } from "./lib/paths.js";
import { getTasksGrouped } from "./api/tasks-api.js";
import * as todoist from "./tools/todoist.js";
import * as obsidian from "./tools/obsidian.js";
import * as calendarTool from "./tools/calendar.js";
import {
  isCalendarConfigured,
  listPrimaryCalendarEvents,
  type CalendarContext,
  type NormalizedCalendarEvent,
} from "./lib/google-calendar.js";

const app = express();
const explicitCorsOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: explicitCorsOrigins.length > 0 ? explicitCorsOrigins : true,
  })
);
app.use(express.json({ limit: "12mb" }));
app.use(cognitoAuthMiddleware());

function sseInit(res: express.Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
}

function sseSend(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sseStreamText(res: express.Response, eventPrefix: string, text: string) {
  const chunkSize = 120;
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    sseSend(res, `${eventPrefix}_delta`, { delta: chunk });
    // Small delay to let the browser paint progressively.
    await sleep(10);
  }
}

const proposeAssistantBody = z.object({
  message: z.string().min(1).max(100_000),
});

const scheduleDayAssistantBody = z.object({
  message: z.string().min(1).max(100_000),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduleMarkdown: z.string().min(1).max(120_000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(100_000),
      })
    )
    .max(40)
    .optional(),
});

const assistantTranscribeBody = z.object({
  audioBase64: z.string().min(1).max(12_000_000),
  mimeType: z.string().min(1).max(120).optional(),
});

const assistantTtsBody = z.object({
  text: z.string().min(1).max(24_000),
  voice: z.string().min(1).max(40).optional(),
  format: z.enum(["mp3", "wav", "opus"]).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  instructions: z.string().max(1000).optional(),
});

const proposeTriggerBody = z.object({
  inputOverride: z.string().min(1).max(100_000).optional(),
});

const executeJobBody = z.object({
  approvedProposalIds: z.array(z.string().min(1)).optional(),
});

const weeklyPrepApplyBody = z.object({
  prepMarkdown: z.string().min(1).max(200000),
});

const debriefProposeBody = z.object({
  summaryText: z.string().min(1).max(200000).optional(),
  transcriptText: z.string().min(1).max(500000).optional(),
});

const taskUpdateBody = z.object({
  context: z.enum(["personal", "work"]).optional(),
  content: z.string().min(1).max(10000).optional(),
  dueString: z.string().max(200).optional(),
  priority: z.number().min(1).max(4).optional(),
  description: z.string().max(10000).optional(),
  duration: z.number().int().positive().optional(),
  durationUnit: z.enum(["minute", "day"]).optional(),
});

const taskCloseBody = z.object({
  context: z.enum(["personal", "work"]).optional(),
});

const taskCreateBody = z.object({
  context: z.enum(["personal", "work"]),
  content: z.string().min(1).max(10000),
  dueString: z.string().max(200).optional(),
  priority: z.number().min(1).max(4).optional(),
  description: z.string().max(10000).optional(),
  duration: z.number().int().positive().optional(),
  durationUnit: z.enum(["minute", "day"]).optional(),
});

const obsidianWriteBody = z.object({
  context: z.enum(["personal", "work"]).optional(),
  relativePath: z.string().min(1).max(2000),
  content: z.string().min(1).max(500_000),
  frontmatter: z.record(z.unknown()).nullable().optional(),
});

const obsidianAppendBody = z.object({
  context: z.enum(["personal", "work"]).optional(),
  relativePath: z.string().min(1).max(2000),
  content: z.string().min(1).max(500_000),
});

const calendarCreateApiBody = z.object({
  context: z.enum(["personal", "work"]),
  calendarId: z.string().min(1).max(200).optional(),
  summary: z.string().min(1).max(5000),
  description: z.string().max(20000).optional(),
  start: z.string().min(1).max(80),
  end: z.string().min(1).max(80),
  attendees: z.array(z.string().email()).max(100).optional(),
});

const calendarUpdateApiBody = z.object({
  context: z.enum(["personal", "work"]),
  calendarId: z.string().min(1).max(200).optional(),
  eventId: z.string().min(1).max(500),
  summary: z.string().max(5000).optional(),
  start: z.string().max(80).optional(),
  end: z.string().max(80).optional(),
});

const taskRefineBody = z.object({
  task: z.object({
    id: z.string(),
    content: z.string(),
    due_string: z.string().optional(),
    due: z.object({ date: z.string() }).passthrough().optional(),
    duration: z
      .object({
        amount: z.number(),
        unit: z.enum(["minute", "day"]),
      })
      .optional(),
    priority: z.number(),
    context: z.enum(["personal", "work"]),
    description: z.string().optional(),
  }),
  message: z.string().min(1).max(100_000),
  history: z
    .array(z.object({ role: z.enum(["human", "ai"]), content: z.string() }))
    .max(50)
    .optional(),
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/triggers", (_req, res) => {
  const ids = getAllTriggerIds();
  const triggers = ids.map((id) => {
    const t = getTrigger(id);
    return {
      id,
      schedule: t.schedule ?? null,
      defaultInput: t.defaultInput,
    };
  });
  res.json({ triggers });
});

app.get("/api/jobs", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const jobs = await listJobs(status as JobRecord["status"] | undefined);
  res.json({ jobs });
});

app.get("/api/tasks", async (_req, res) => {
  try {
    const grouped = await getTasksGrouped();
    res.json(grouped);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

/** Google Calendar events for Next 7 days tab (uses GOOGLE_* refresh tokens from .env). */
app.get("/api/calendar/events", async (req, res) => {
  const timeMinStr = req.query.timeMin;
  const timeMaxStr = req.query.timeMax;
  if (typeof timeMinStr !== "string" || typeof timeMaxStr !== "string") {
    return res.status(400).json({ error: "Query params timeMin and timeMax (ISO 8601) are required" });
  }
  const timeMin = new Date(timeMinStr);
  const timeMax = new Date(timeMaxStr);
  if (Number.isNaN(timeMin.getTime()) || Number.isNaN(timeMax.getTime())) {
    return res.status(400).json({ error: "Invalid timeMin or timeMax" });
  }

  const contextParam = typeof req.query.context === "string" ? req.query.context : "all";
  const contexts: CalendarContext[] =
    contextParam === "work" ? ["work"] : contextParam === "personal" ? ["personal"] : ["personal", "work"];

  const configured = {
    personal: isCalendarConfigured("personal"),
    work: isCalendarConfigured("work"),
  };

  try {
    const events: NormalizedCalendarEvent[] = [];
    for (const ctx of contexts) {
      if (!configured[ctx]) continue;
      const chunk = await listPrimaryCalendarEvents(ctx, timeMin, timeMax);
      events.push(...chunk);
    }

    const sortKey = (e: NormalizedCalendarEvent) => (e.allDay ? `${e.start}T00:00:00` : e.start);
    events.sort((a, b) => {
      const cmp = sortKey(a).localeCompare(sortKey(b));
      if (cmp !== 0) return cmp;
      return a.title.localeCompare(b.title);
    });

    res.json({ events, configured });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/calendar/events]", err);
    res.status(500).json({ events: [], configured, error: message });
  }
});

app.post("/api/calendar/create", async (req, res) => {
  const body = calendarCreateApiBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  try {
    const raw = await calendarTool.createEvent({
      context: body.data.context,
      calendarId: body.data.calendarId ?? null,
      summary: body.data.summary,
      description: body.data.description ?? null,
      start: body.data.start,
      end: body.data.end,
      attendees: body.data.attendees ?? null,
    });
    const parsed = JSON.parse(String(raw)) as { success?: boolean; error?: string; id?: string; htmlLink?: string };
    if (parsed?.error || parsed?.success === false) {
      return res.status(400).json({ error: parsed.error ?? "Calendar create failed" });
    }
    res.status(201).json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post("/api/calendar/update", async (req, res) => {
  const body = calendarUpdateApiBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  if (!body.data.summary && !body.data.start && !body.data.end) {
    return res.status(400).json({ error: "Provide at least one of summary, start, or end" });
  }
  try {
    const raw = await calendarTool.updateEvent({
      context: body.data.context,
      calendarId: body.data.calendarId ?? "primary",
      eventId: body.data.eventId,
      summary: body.data.summary ?? null,
      start: body.data.start ?? null,
      end: body.data.end ?? null,
    });
    const parsed = JSON.parse(String(raw)) as { success?: boolean; error?: string };
    if (parsed?.error || parsed?.success === false) {
      return res.status(400).json({ error: parsed.error ?? "Calendar update failed" });
    }
    res.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.patch("/api/tasks/:taskId", async (req, res) => {
  const body = taskUpdateBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const taskId = req.params.taskId;
  try {
    const raw = await todoist.updateTask({
      ...(body.data.context != null && { context: body.data.context }),
      taskId,
      content: body.data.content,
      dueString: body.data.dueString,
      priority: body.data.priority,
      ...(body.data.description !== undefined && { description: body.data.description }),
      duration: body.data.duration,
      durationUnit: body.data.durationUnit,
    });
    const parsed = JSON.parse(String(raw)) as { success?: boolean; error?: string };
    if (parsed?.error) return res.status(400).json({ error: parsed.error });
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post("/api/tasks", async (req, res) => {
  const body = taskCreateBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  try {
    const raw = await todoist.addTask({
      context: body.data.context,
      content: body.data.content,
      dueString: body.data.dueString ?? undefined,
      priority: body.data.priority ?? undefined,
      description: body.data.description ?? undefined,
      duration: body.data.duration ?? undefined,
      durationUnit: body.data.durationUnit ?? undefined,
    });
    const parsed = JSON.parse(String(raw)) as { error?: string; id?: string; content?: string; [k: string]: unknown };
    if (parsed?.error) return res.status(400).json({ error: parsed.error });
    res.status(201).json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post("/api/tasks/:taskId/close", async (req, res) => {
  const body = taskCloseBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const taskId = req.params.taskId;
  try {
    const raw = await todoist.closeTask({
      ...(body.data.context != null && { context: body.data.context }),
      taskId,
    });
    const parsed = JSON.parse(String(raw)) as { success?: boolean; error?: string };
    if (parsed?.error) return res.status(400).json({ error: parsed.error });
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post("/api/obsidian/write", async (req, res) => {
  const body = obsidianWriteBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  try {
    const raw = await obsidian.writeNote({
      context: body.data.context ?? null,
      relativePath: body.data.relativePath,
      content: body.data.content,
      frontmatter: body.data.frontmatter ?? null,
    });
    const parsed = JSON.parse(String(raw)) as { error?: string; success?: boolean };
    if (parsed?.error) return res.status(400).json({ error: parsed.error });
    res.status(201).json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post("/api/obsidian/append", async (req, res) => {
  const body = obsidianAppendBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  try {
    const raw = await obsidian.appendToNote({
      context: body.data.context ?? null,
      relativePath: body.data.relativePath,
      content: body.data.content,
    });
    const parsed = JSON.parse(String(raw)) as { error?: string; success?: boolean };
    if (parsed?.error) return res.status(400).json({ error: parsed.error });
    res.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

async function proposeJobSse(req: express.Request, res: express.Response, run: () => Promise<void>) {
  sseInit(res);
  res.flushHeaders?.();

  try {
    await run();
    sseSend(res, "done", { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sseSend(res, "error", { message });
  } finally {
    res.end();
  }
}

app.post("/api/assistant/propose", async (req, res) => {
  const body = proposeAssistantBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const jobId = newId("job");

  await proposeJobSse(req, res, async () => {
    const { outputText, proposals } = await proposeAssistant(body.data.message);
    await createJob({
      id: jobId,
      type: "assistant",
      status: "pending",
      message: body.data.message,
      outputText,
      proposals,
    });

    sseSend(res, "assistant_output_start", {});
    await sseStreamText(res, "assistant_output", outputText);
    sseSend(res, "assistant_output_end", {});
    sseSend(res, "proposals", { jobId, proposals });
  });
});

app.post("/api/assistant/schedule-day", async (req, res) => {
  const body = scheduleDayAssistantBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const jobId = newId("job");

  await proposeJobSse(req, res, async () => {
    const history = body.data.history?.map((h) => ({
      role: h.role === "user" ? ("human" as const) : ("ai" as const),
      content: h.content,
    }));
    const { outputText, proposals } = await proposeScheduleDayAssistant(
      body.data.message,
      body.data.dateKey,
      body.data.scheduleMarkdown,
      history
    );
    await createJob({
      id: jobId,
      type: "assistant",
      status: "pending",
      message: body.data.message,
      outputText,
      proposals,
    });

    sseSend(res, "assistant_output_start", {});
    await sseStreamText(res, "assistant_output", outputText);
    sseSend(res, "assistant_output_end", {});
    sseSend(res, "proposals", { jobId, proposals });
  });
});

app.post("/api/assistant/transcribe", async (req, res) => {
  const body = assistantTranscribeBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });

  const mimeType = (body.data.mimeType ?? "audio/webm").trim().toLowerCase();
  if (!mimeType.startsWith("audio/")) {
    return res.status(400).json({ error: "mimeType must be an audio/* type" });
  }

  let audioBase64 = body.data.audioBase64.trim();
  const dataUrlComma = audioBase64.indexOf(",");
  if (audioBase64.startsWith("data:") && dataUrlComma > 0) {
    audioBase64 = audioBase64.slice(dataUrlComma + 1);
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(audioBase64, "base64");
  } catch {
    return res.status(400).json({ error: "Invalid base64 audio payload" });
  }

  if (audioBuffer.length === 0) {
    return res.status(400).json({ error: "Audio payload is empty" });
  }
  if (audioBuffer.length > 8 * 1024 * 1024) {
    return res.status(413).json({ error: "Audio payload is too large" });
  }

  const extension = mimeType.split("/")[1] ?? "webm";
  const file = new Blob([audioBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append("model", process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe");
  formData.append("file", file, `speech.${extension}`);

  try {
    const openAiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const payload = (await openAiRes.json().catch(() => ({}))) as {
      text?: string;
      error?: { message?: string };
    };

    if (!openAiRes.ok) {
      const message = payload.error?.message ?? `OpenAI transcription failed (${openAiRes.status})`;
      return res.status(502).json({ error: message });
    }

    const text = payload.text?.trim();
    if (!text) {
      return res.status(502).json({ error: "Transcription completed without text output" });
    }

    return res.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

app.post("/api/assistant/tts", async (req, res) => {
  const body = assistantTtsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });

  const voice = body.data.voice ?? process.env.OPENAI_TTS_VOICE ?? "alloy";
  const format = body.data.format ?? "mp3";
  const speed = body.data.speed ?? 1;
  const model = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";

  try {
    const openAiRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice,
        input: body.data.text,
        speed,
        response_format: format,
        ...(body.data.instructions && { instructions: body.data.instructions }),
      }),
    });

    if (!openAiRes.ok) {
      const payload = (await openAiRes.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      const message = payload.error?.message ?? `OpenAI TTS failed (${openAiRes.status})`;
      console.error("[api/assistant/tts]", openAiRes.status, message, { model, voice, speed, format, textLen: body.data.text.length });
      return res.status(502).json({ error: message });
    }

    const bytes = Buffer.from(await openAiRes.arrayBuffer());
    const mimeType = format === "wav" ? "audio/wav" : format === "opus" ? "audio/ogg" : "audio/mpeg";
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "no-store");
    return res.send(bytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/assistant/tts] exception:", message);
    return res.status(500).json({ error: message });
  }
});

app.post("/api/tasks/refine", async (req, res) => {
  const body = taskRefineBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  await proposeJobSse(req, res, async () => {
    const history = body.data.history?.map((h) => ({
      role: h.role as "human" | "ai",
      content: h.content,
    }));
    const { outputText, proposals } = await proposeTaskRefinement(
      body.data.task,
      body.data.message,
      history
    );

    sseSend(res, "assistant_output_start", {});
    await sseStreamText(res, "assistant_output", outputText);
    sseSend(res, "assistant_output_end", {});
    sseSend(res, "proposals", { proposals });
  });
});

app.post("/api/triggers/:id/propose", async (req, res) => {
  const triggerIdRaw = req.params.id;
  const validIds = new Set(getAllTriggerIds());
  if (!validIds.has(triggerIdRaw as TriggerId)) return res.status(400).json({ error: "Unknown trigger" });

  const bodyParse = proposeTriggerBody.safeParse(req.body);
  if (!bodyParse.success) return res.status(400).json({ error: bodyParse.error.flatten() });

  const jobId = newId(`job_${triggerIdRaw}`);

  await proposeJobSse(req, res, async () => {
    const { outputText, proposals } = await proposeTrigger(triggerIdRaw as TriggerId, bodyParse.data.inputOverride);
    await createJob({
      id: jobId,
      type: "trigger",
      triggerId: triggerIdRaw as TriggerId,
      inputOverride: bodyParse.data.inputOverride,
      status: "pending",
      outputText,
      proposals,
    });

    sseSend(res, "assistant_output_start", {});
    await sseStreamText(res, "assistant_output", outputText);
    sseSend(res, "assistant_output_end", {});
    sseSend(res, "proposals", { jobId, proposals });
  });
});

function nextSevenDaysRange(now: Date): { start: string; end: string } {
  const startD = new Date(now);
  startD.setHours(0, 0, 0, 0);
  const endD = new Date(startD);
  endD.setDate(endD.getDate() + 6);
  const start = startD.toISOString().slice(0, 10);
  const end = endD.toISOString().slice(0, 10);
  return { start, end };
}

app.post("/api/weekly-prep/list", async (_req, res) => {
  const { start, end } = nextSevenDaysRange(new Date());
  await runWeeklyPrepList();

  const filepath = path.join(getStateDir(), `weekly-prep-${start}.md`);
  const markdown = await fs.readFile(filepath, "utf-8");
  res.json({ start, end, markdown });
});

app.post("/api/weekly-prep/apply/propose", async (req, res) => {
  const body = weeklyPrepApplyBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const jobId = newId("job_weekly_prep");

  await proposeJobSse(req, res, async () => {
    const collector = createProposalCollector();
    const outputText = await runWeeklyPrepApplyFromMarkdown(body.data.prepMarkdown, {
      mode: "propose",
      proposalCollector: collector,
    });

    await createJob({
      id: jobId,
      type: "weekly_prep",
      status: "pending",
      outputText,
      proposals: collector.proposals,
    });

    sseSend(res, "assistant_output_start", {});
    await sseStreamText(res, "assistant_output", outputText);
    sseSend(res, "assistant_output_end", {});
    sseSend(res, "proposals", { jobId, proposals: collector.proposals });
  });
});

app.post("/api/meeting-debrief/propose", async (req, res) => {
  const parsed = debriefProposeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { summaryText, transcriptText } = parsed.data;
  const combined = [summaryText, transcriptText].filter(Boolean).join("\n\n---\n\n");
  if (!combined) return res.status(400).json({ error: "Provide summaryText and/or transcriptText" });

  const jobId = newId("job_debrief");

  await proposeJobSse(req, res, async () => {
    const collector = createProposalCollector();
    const outputText = await runDebriefSynthesis(combined, { mode: "propose", proposalCollector: collector });

    await createJob({
      id: jobId,
      type: "debrief",
      status: "pending",
      outputText,
      proposals: collector.proposals,
    });

    sseSend(res, "assistant_output_start", {});
    await sseStreamText(res, "assistant_output", outputText);
    sseSend(res, "assistant_output_end", {});
    sseSend(res, "proposals", { jobId, proposals: collector.proposals });
  });
});

app.post("/api/jobs/:jobId/execute", async (req, res) => {
  const body = executeJobBody.safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const jobId = req.params.jobId;
  const job = await loadJob(jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.status !== "pending") return res.status(409).json({ error: `Job is ${job.status}` });

  const approvedIds = body.data.approvedProposalIds ?? job.proposals.map((p) => p.id);
  const approvedSet = new Set(approvedIds);
  const approvedProposals = job.proposals.filter((p) => approvedSet.has(p.id));

  const exec = await executeProposals(approvedProposals);

  const next: JobRecord = {
    ...job,
    status: exec.ok ? "executed" : "failed",
    approvedProposalIds: approvedIds,
    executedAt: exec.ok ? new Date().toISOString() : undefined,
    executionResults: exec.results,
  };
  await saveJob(next);

  res.json({ ok: exec.ok, job: next });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`Express API listening on http://localhost:${port}`);
});

