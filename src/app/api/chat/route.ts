import { NextResponse } from "next/server";

const isQuizPrompt = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("mcq") ||
    normalized.includes("multiple-choice") ||
    normalized.includes("multiple choice") ||
    normalized.includes("create 5") ||
    normalized.includes("q1.")
  );
};

const extractPromptValue = (message: string, label: string) => {
  const match = message.match(new RegExp(`${label}:\\s*(.+)`, "i"));
  return match ? match[1].trim() : "";
};

const buildQuizFallback = (message: string) => {
  const title = extractPromptValue(message, "Title") || "this activity";
  const subject = extractPromptValue(message, "Subject") || "drone systems";
  const grade = extractPromptValue(message, "Grade") || "9-12";
  const description = extractPromptValue(message, "Description") || "a guided drone learning module";
  const hasCode = /code\s*\(trimmed\):/i.test(message);

  const questions = [
    {
      question: `What best describes the goal of "${title}"?`,
      options: [
        `Apply ${subject} concepts through ${description}`,
        "Assemble a toy drone with no learning objectives",
        "Focus only on drone racing techniques",
        "Skip hands-on work and read theory only",
      ],
      answer: "A",
    },
    {
      question: "Which subject area does this activity align with?",
      options: [subject, "Sports training", "Culinary arts", "Music production"],
      answer: "A",
    },
    {
      question: `This activity is designed for which grade band?`,
      options: [grade, "K-2", "College only", "All ages with no level"],
      answer: "A",
    },
    {
      question: hasCode
        ? "Which skill is most directly practiced in this activity?"
        : "Which learning approach is emphasized in this activity?",
      options: hasCode
        ? ["Python programming", "Oil painting", "Guitar performance", "Foreign language translation"]
        : ["Hands-on experimentation", "Passive memorization only", "Random guessing", "No assessment"],
      answer: "A",
    },
    {
      question: "Why are drones used in this learning module?",
      options: [
        "To connect classroom theory with real-world applications",
        "To replace all other subjects",
        "To avoid problem-solving and analysis",
        "To remove safety practices",
      ],
      answer: "A",
    },
  ];

  return questions
    .map((q, idx) => {
      const lines = [
        `Q${idx + 1}. ${q.question}`,
        `A) ${q.options[0]}`,
        `B) ${q.options[1]}`,
        `C) ${q.options[2]}`,
        `D) ${q.options[3]}`,
        `Answer: ${q.answer}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");
};

const fallbackReply = (message: string) => {
  const normalized = message.toLowerCase();

  if (normalized.includes("price") || normalized.includes("cost") || normalized.includes("pricing")) {
    return "Pricing varies by kit and bundle. Visit the shopping page for current packages or use 'Talk to sales' for a tailored quote.";
  }
  if (normalized.includes("login") || normalized.includes("sign in")) {
    return "Use the Login / Sign In button on the homepage. Students can access modules after selecting their grade and subject.";
  }
  if (normalized.includes("demo") || normalized.includes("sales") || normalized.includes("contact")) {
    return "Request a demo via the Talk to sales panel, and the team will share a guided walkthrough and onboarding details.";
  }
  if (normalized.includes("curriculum") || normalized.includes("syllabus") || normalized.includes("module")) {
    return "The curriculum is structured and subject-aligned (CS, Physics, Math, Design Tech, ESS). It blends hands-on drone activities with Python programming and real-world applications.";
  }
  if (normalized.includes("board") || normalized.includes("grade")) {
    return "Content is aligned for grades 9-12 and is compatible with major boards. Students choose their grade and subject to access curated modules.";
  }
  if (normalized.includes("download") || normalized.includes("materials") || normalized.includes("manual")) {
    return "Students can view and download manuals, code files, and activities. Materials are curated for structured, step-by-step learning.";
  }

  return "Indus Skylab delivers a structured, school-ready drone curriculum for grades 9-12. It combines Python, electronics, mechanics, and data analysis through hands-on activities and real-world use cases.";
};

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      if (isQuizPrompt(message)) {
        return NextResponse.json({ reply: buildQuizFallback(message), fallback: true }, { status: 200 });
      }
      return NextResponse.json({ reply: fallbackReply(message), fallback: true }, { status: 200 });
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
      if (isQuizPrompt(message)) {
        return NextResponse.json({ reply: buildQuizFallback(message), fallback: true, detail }, { status: 200 });
      }
      return NextResponse.json(
        {
          reply: `${fallbackReply(message)} (Note: live assistant is temporarily unavailable.)`,
          fallback: true,
          detail,
        },
        { status: 200 }
      );
    }

    const data = await openAiRes.json();
    const reply = data?.choices?.[0]?.message?.content ?? "Assistant is available but no reply was generated.";
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ reply: buildQuizFallback(""), fallback: true }, { status: 200 });
  }
}
