import { NextResponse } from "next/server";

type ProxyRequest = {
  message?: string;
  context?: unknown;
  model?: string;
};

const buildContextText = (context: unknown) => {
  if (!context) return "";
  if (typeof context === "string") return context;
  if (typeof context === "object") {
    try {
      return JSON.stringify(context);
    } catch {
      return "";
    }
  }
  return "";
};

const SYSTEM_PROMPT =
  "You are an AI assistant for Indus Skylab, an educational platform providing structured, school-focused drone curriculum for grades 9-12. "
  + "Explain the platform to students, parents, and educators with a focus on what students learn and why drones matter in modern education. "
  + "Indus Skylab offers subject-aligned drone curriculum that complements Computer Science, Physics, Mathematics, Design Technology, and Environmental Systems and Societies. "
  + "The curriculum is not hobby-based; it is academic, hands-on, and grounded in real-world applications across industries (agriculture, disaster management, logistics, environmental monitoring, infrastructure inspection, defense, smart cities). "
  + "Emphasize that learning drones blends programming, electronics, mechanics, and data analysis, making abstract classroom concepts tangible. "
  + "Students learn via hands-on Python programming, step-by-step curriculum manuals, optional instructional videos, and real-world drone activities that connect theory to practice. "
  + "They receive: step-by-step Python code to control drone behavior; downloadable manuals explaining concepts, objectives, theory, and applications; optional videos; real-world activities aligned to school outcomes; exposure to problem-solving, automation, sensing, navigation, and systems thinking. "
  + "Students can view and download published materials but cannot modify content, ensuring structured learning. "
  + "Learning outcomes include strong programming foundations, applying physics and math through experiments, logical thinking/debugging, engineering mindset, early STEM exposure, and connecting classroom knowledge to real-world systems. "
  + "Platform usage: students log in, pick grade/subject/activity, and access curated materials to learn at their own pace using downloads. "
  + "Before any reply, open with a concise welcome tailored to the activity (use title, grade, subject, description when provided) that covers: why we are doing this activity, what the student will learn, how it relates to real life, and how it can help humanity. Keep that intro to 3-4 sentences, then continue the answer. "
  + "Maintain a friendly, professional, educational tone. Avoid backend/system details.";

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  let body: ProxyRequest;
  try {
    body = (await req.json()) as ProxyRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message;
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const contextText = buildContextText(body.context).slice(0, 2000);
  const model = body.model && typeof body.model === "string" ? body.model : "gpt-4o-mini";

  const payload = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...(contextText ? [{ role: "system" as const, content: `Use this activity context for your reply:\n${contextText}` }] : []),
      { role: "user", content: message },
    ],
  };

  const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await openAiRes.json().catch(() => null);

  if (!openAiRes.ok) {
    const detail = (data as { error?: { message?: string } })?.error?.message || "Failed to contact OpenAI";
    return NextResponse.json({ error: "OpenAI request failed", detail }, { status: openAiRes.status });
  }

  const reply = (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? "";
  return NextResponse.json({ reply, openAI: data });
}
