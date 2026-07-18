import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { AUTH_COOKIE, roleForToken } from "@/lib/auth";
import { buildBoardSnapshot, systemPrompt } from "@/lib/assistant";
import type { Card, Comment } from "@/lib/types";

// Free-tier Google Gemini. Override via GEMINI_MODEL if needed.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

// Bound token use on both sides of the call.
const MAX_TURNS = 12;
const MAX_MSG_CHARS = 4000;
const TIMEOUT_MS = 30_000;

type ChatMsg = { role: "user" | "assistant"; text: string };

// One retry on rate-limit/overload — the free tier 429s routinely and a single
// short backoff usually clears it. Key travels in a header, not the URL, so it
// can't leak into request logs.
async function callGemini(key: string, body: string): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  for (let attempt = 0; ; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (attempt === 0 && (resp.status === 429 || resp.status === 503)) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    return resp;
  }
}

// Read-only planning assistant. Any logged-in user (editor or guest) may ask;
// the assistant never writes. It pulls the live board + comments + product
// context server-side every call, so the answer always reflects the current
// roadmap.
export async function POST(req: NextRequest) {
  const role = roleForToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "AI assistant not configured — set GEMINI_API_KEY." },
      { status: 503 }
    );
  }

  const { messages } = await req.json().catch(() => ({ messages: [] }));
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const sb = getServiceClient();
  const [cardsRes, commentsRes, settingsRes] = await Promise.all([
    sb.from("cards").select("*"),
    sb.from("comments").select("*").order("created_at", { ascending: true }).limit(500),
    sb.from("settings").select("product_context").eq("id", 1).maybeSingle(),
  ]);
  if (cardsRes.error) {
    return NextResponse.json({ error: cardsRes.error.message }, { status: 500 });
  }

  // Comments enrich the snapshot but aren't worth failing the request over.
  const comments = commentsRes.error ? [] : ((commentsRes.data ?? []) as Comment[]);
  const snapshot = buildBoardSnapshot((cardsRes.data ?? []) as Card[], comments);
  const productContext = settingsRes.data?.product_context ?? "";
  const system =
    systemPrompt(productContext) + "\n\nCURRENT ROADMAP SNAPSHOT:\n" + snapshot;

  // Keep the last few turns for follow-ups, drop empties, cap each turn's
  // length. Gemini requires the thread to open with a user turn, so shed any
  // leading model turns left by the window slice.
  const contents = (messages as ChatMsg[])
    .filter((m) => String(m?.text ?? "").trim())
    .slice(-MAX_TURNS)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.text).slice(0, MAX_MSG_CHARS) }],
    }));
  while (contents.length && contents[0].role === "model") contents.shift();
  if (!contents.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  let resp: Response;
  try {
    resp = await callGemini(
      key,
      JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
      })
    );
  } catch (e) {
    const err = e as Error;
    const msg =
      err.name === "TimeoutError" || err.name === "AbortError"
        ? "Gemini took too long to answer — try again."
        : `Could not reach Gemini: ${err.message}`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return NextResponse.json(
      { error: `Gemini error ${resp.status}`, detail: detail.slice(0, 300) },
      { status: 502 }
    );
  }

  const data = await resp.json();
  const answer: string =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "";
  if (!answer.trim()) {
    const reason = data?.candidates?.[0]?.finishReason || "no content";
    return NextResponse.json({ error: `No answer (${reason})` }, { status: 502 });
  }

  return NextResponse.json({ answer });
}
