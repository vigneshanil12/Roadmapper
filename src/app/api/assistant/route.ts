import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { AUTH_COOKIE, roleForToken } from "@/lib/auth";
import { buildBoardSnapshot, systemPrompt } from "@/lib/assistant";
import type { Card } from "@/lib/types";

// Free-tier Google Gemini. Override via GEMINI_MODEL if needed.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

type ChatMsg = { role: "user" | "assistant"; text: string };

// Read-only planning assistant. Any logged-in user (editor or guest) may ask;
// the assistant never writes. It pulls the live board + product context
// server-side every call, so the answer always reflects the current roadmap.
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
  const [cardsRes, settingsRes] = await Promise.all([
    sb.from("cards").select("*"),
    sb.from("settings").select("product_context").eq("id", 1).maybeSingle(),
  ]);
  if (cardsRes.error) {
    return NextResponse.json({ error: cardsRes.error.message }, { status: 500 });
  }

  const snapshot = buildBoardSnapshot((cardsRes.data ?? []) as Card[]);
  const productContext = settingsRes.data?.product_context ?? "";
  const system =
    systemPrompt(productContext) + "\n\nCURRENT ROADMAP SNAPSHOT:\n" + snapshot;

  // Keep the last few turns for follow-ups; cap to bound token use.
  const contents = (messages as ChatMsg[]).slice(-12).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.text ?? "") }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Could not reach Gemini: ${(e as Error).message}` },
      { status: 502 }
    );
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
