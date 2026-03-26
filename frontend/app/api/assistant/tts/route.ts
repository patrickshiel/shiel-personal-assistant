export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const payload = (await req.json().catch(() => ({}))) as {
    text?: string;
    voice?: string;
    format?: "mp3" | "wav" | "opus";
    speed?: number;
    instructions?: string;
  };

  const text = payload.text?.trim() ?? "";
  if (!text) return new Response("Missing text", { status: 400 });

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.BACKEND_URL ?? "http://localhost:3001";
  const backendRes = await fetch(`${backendUrl}/api/assistant/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({
      text,
      voice: payload.voice,
      format: payload.format,
      speed: payload.speed,
      instructions: payload.instructions,
    }),
  });

  if (!backendRes.ok) {
    const data = (await backendRes.json().catch(() => ({}))) as { error?: string };
    return Response.json({ error: data.error ?? "Backend TTS error" }, { status: backendRes.status });
  }

  const audioBuffer = await backendRes.arrayBuffer();
  const contentType = backendRes.headers.get("content-type") ?? "audio/mpeg";
  return new Response(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}
