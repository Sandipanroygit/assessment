import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OpenAI key" }, { status: 500 });
    }

    const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
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
              + "Maintain a friendly, professional, educational tone. Avoid backend/system details.",
          },
          { role: "user", content: message },
        ],
      }),
    });

    if (!openAiRes.ok) {
      let detail = "Failed to contact OpenAI";
      try {
        const err = await openAiRes.json();
        detail = err?.error?.message ?? detail;
      } catch {
        // ignore
      }
      return NextResponse.json({ reply: `Assistant unavailable: ${detail}` }, { status: 502 });
    }

    const data = await openAiRes.json();
    const reply = data?.choices?.[0]?.message?.content ?? "Assistant is available but no reply was generated.";
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ reply: "Assistant unavailable: unexpected error." }, { status: 500 });
  }
}
