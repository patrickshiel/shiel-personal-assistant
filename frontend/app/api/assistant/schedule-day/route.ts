import { createTextStreamResponse } from "ai";

function parseSseEvent(rawEvent: string): { event: string | null; data: unknown } {
  const lines = rawEvent.split("\n").map((l) => l.trimEnd());
  let event: string | null = null;
  let dataStr: string | null = null;

  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    if (line.startsWith("data:")) dataStr = line.slice("data:".length).trim();
  }

  if (!dataStr) return { event, data: null };
  try {
    return { event, data: JSON.parse(dataStr) };
  } catch {
    return { event, data: dataStr };
  }
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const payload = (await req.json()) as {
    message?: string;
    dateKey?: string;
    scheduleMarkdown?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };
  const message = payload.message?.trim() ?? "";
  const dateKey = payload.dateKey ?? "";
  const scheduleMarkdown = payload.scheduleMarkdown ?? "";
  if (!message) return new Response("Missing message", { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return new Response("Invalid dateKey", { status: 400 });
  if (!scheduleMarkdown) return new Response("Missing scheduleMarkdown", { status: 400 });

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.BACKEND_URL ?? "http://localhost:3001";
  const backendRes = await fetch(`${backendUrl}/api/assistant/schedule-day`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({
      message,
      dateKey,
      scheduleMarkdown,
      history: payload.history,
    }),
  });

  if (!backendRes.ok) {
    const text = await backendRes.text().catch(() => "");
    return new Response(text || "Backend error", { status: backendRes.status });
  }

  const body = backendRes.body;
  if (!body) return new Response("Missing backend response body", { status: 500 });

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const textStream = new ReadableStream<string>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const { event, data } = parseSseEvent(frame);
            if (event === "assistant_output_delta") {
              const delta = (data as { delta?: string })?.delta ?? "";
              if (delta) controller.enqueue(delta);
            }
            if (event === "error") {
              const msg = (data as { message?: string })?.message ?? "Unknown backend SSE error";
              controller.error(new Error(msg));
              return;
            }
            if (event === "done") {
              controller.close();
              return;
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return createTextStreamResponse({ textStream });
}
