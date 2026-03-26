export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const payload = (await req.json().catch(() => ({}))) as {
    audioBase64?: string;
    mimeType?: string;
  };

  const audioBase64 = payload.audioBase64?.trim() ?? "";
  if (!audioBase64) return new Response("Missing audioBase64", { status: 400 });

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.BACKEND_URL ?? "http://localhost:3001";
  const backendRes = await fetch(`${backendUrl}/api/assistant/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({
      audioBase64,
      mimeType: payload.mimeType,
    }),
  });

  const data = (await backendRes.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!backendRes.ok) {
    return Response.json({ error: data.error ?? "Backend error" }, { status: backendRes.status });
  }

  if (!data.text) {
    return Response.json({ error: "Missing transcription text" }, { status: 502 });
  }
  return Response.json({ text: data.text });
}
