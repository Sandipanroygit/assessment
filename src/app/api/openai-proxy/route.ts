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
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing GOOGLE_API_KEY" }, { status: 500 });
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
  const model =
    (body.model && typeof body.model === "string" && body.model) ||
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash";

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [{ text: contextText ? `${contextText}\n\n${message}` : message }],
      },
    ],
    generationConfig: { temperature: 0.4 },
  };

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  const data = await geminiRes.json().catch(() => null);

  if (!geminiRes.ok) {
    const detail = (data as { error?: { message?: string } })?.error?.message || "Failed to contact Gemini";
    return NextResponse.json({ error: "Gemini request failed", detail }, { status: geminiRes.status });
  }

  const reply =
    (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";
  return NextResponse.json({ reply, gemini: data });
}
