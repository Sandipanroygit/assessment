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

const parseContext = (contextText?: string) => {
  if (!contextText) return {};
  try {
    const parsed = JSON.parse(contextText);
    if (parsed && typeof parsed === "object") {
      return {
        title: typeof (parsed as { title?: unknown }).title === "string" ? (parsed as { title: string }).title : "",
        subject:
          typeof (parsed as { subject?: unknown }).subject === "string" ? (parsed as { subject: string }).subject : "",
        grade: typeof (parsed as { grade?: unknown }).grade === "string" ? (parsed as { grade: string }).grade : "",
        description:
          typeof (parsed as { description?: unknown }).description === "string"
            ? (parsed as { description: string }).description
            : "",
        code: typeof (parsed as { code?: unknown }).code === "string" ? (parsed as { code: string }).code : "",
        sop: typeof (parsed as { sop?: unknown }).sop === "string" ? (parsed as { sop: string }).sop : "",
      };
    }
  } catch {
    // ignore parse errors
  }
  return {};
};

const shorten = (value: string, limit = 140) => (value.length > limit ? `${value.slice(0, limit)}...` : value);

const sample = <T,>(arr: T[]): T | null => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);

const buildWelcomeIntro = (contextText?: string) => {
  const ctx = parseContext(contextText);
  const title = ctx.title || "this activity";
  const subject = ctx.subject || "drone learning";
  const grade = ctx.grade ? ` for Grade ${ctx.grade}` : "";
  const why = ctx.description
    ? shorten(ctx.description, 220)
    : "We are focusing on hands-on drone skills that blend programming, electronics, and physics.";
  const learning = ctx.subject
    ? `You will practice ${ctx.subject} with code, testing, and reflection.`
    : "You will practice core STEM problem-solving with code, sensors, and safe flight steps.";
  const realLife =
    "This connects to real life through applications like inspection, disaster response, agriculture, and smart cities.";
  const humanity =
    "These skills help communities via safer logistics, faster aid, and better environmental monitoring.";

  return [
    `Welcome! Today we are exploring "${title}"${grade}, focused on ${subject}.`,
    `Why this matters: ${why}`,
    `What you will learn: ${learning}`,
    `${realLife} ${humanity}`,
  ].join(" ");
};

const shuffle = <T,>(arr: T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const splitSentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const splitLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const buildOptions = (correct: string, distractors: string[]) => {
  const letters = ["A", "B", "C", "D"];
  const fillers = [
    "Not stated in the provided materials.",
    "Unrelated to the given SOP or code.",
    "Not part of this activity.",
    "Conflicts with the described steps.",
  ];
  const pool: string[] = [];
  const seen = new Set<string>();
  [correct, ...distractors, ...fillers].forEach((item) => {
    if (item && !seen.has(item)) {
      seen.add(item);
      pool.push(item);
    }
  });
  while (pool.length < 4) pool.push(sample(fillers) || "Not provided.");
  const picks = shuffle(pool).slice(0, 4);
  if (!picks.includes(correct)) {
    picks[0] = correct;
  }
  const shuffled = shuffle(picks);
  const answerIdx = Math.max(shuffled.indexOf(correct), 0);
  return {
    options: shuffled.map((text, idx) => ({ label: letters[idx], text })),
    answer: letters[answerIdx],
  };
};

const pickApiKey = (headerKey: string | null) => {
  const candidates = [
    process.env.OPENAI_API_KEY,
    headerKey,
    process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  ].filter(Boolean) as string[];
  const isMasked = (key: string) => key.includes("*") || key.includes("•");
  const looksValid = (key: string) => /^sk-[a-zA-Z0-9]{20,}/.test(key) && !isMasked(key);
  return candidates.find(looksValid) ?? candidates.find((k) => !isMasked(k)) ?? null;
};

const buildQuizFallback = ({ message, contextText }: { message: string; contextText?: string }) => {
  const parsedContext = parseContext(contextText);
  const title = parsedContext.title || extractPromptValue(message, "Title") || "this activity";
  const subject = parsedContext.subject || extractPromptValue(message, "Subject") || "drone systems";
  const grade = parsedContext.grade || extractPromptValue(message, "Grade") || "students";
  const description =
    parsedContext.description || extractPromptValue(message, "Description") || "a guided drone learning module";
  const sop = parsedContext.sop || "";
  const code = parsedContext.code || "";

  const descSentences = splitSentences(description);
  const sopSentences = splitSentences(sop);
  const codeLines = splitLines(code);
  const conceptLine = sample([...descSentences, ...sopSentences]) || `${title} — applying ${subject}`;
  const sopStep = sample(sopSentences) || "Follow the SOP steps as written for this activity.";
  const codeLine = sample(codeLines.filter((l) => l.length < 160)) || sample(codeLines) || "Review the provided code.";
  const outcomeLine =
    sample(descSentences.slice(1)) || descSentences[0] || sample(sopSentences.slice(-2)) || "Achieve the stated result.";
  const troubleshootCue = sample([...sopSentences, ...codeLines]) || "Re-check the SOP steps and code parameters.";

  const q1Stem =
    sample([
      `What core concept is emphasized in "${title}" for ${grade}?`,
      `Which learning outcome best matches this activity on ${subject}?`,
      `What is the primary idea students practice in this activity?`,
    ]) || `What concept drives this activity?`;
  const q2Stem =
    sample([
      "According to the SOP, which step or check must be followed?",
      "Which SOP action is required to stay on procedure?",
      "Which SOP instruction applies to this activity?",
    ]) || "Which SOP item applies here?";
  const q3Stem =
    sample([
      `In the provided code, what does this line do?\n${codeLine}`,
      `What is the purpose of this code snippet?\n${codeLine}`,
      `How does this code line support the activity?\n${codeLine}`,
    ]) || "What is the purpose of the provided code line?";
  const q4Stem =
    sample([
      "If results drift from expected, what should be checked or adjusted first?",
      "When the outcome is off, which source should you revisit?",
      "How should you troubleshoot if the activity is not working?",
    ]) || "How should you troubleshoot the activity?";
  const q5Stem =
    sample([
      "Which outcome or measurement shows the concept was applied correctly?",
      "What indicates success for this activity?",
      "What result should you verify after running the activity?",
    ]) || "What indicates successful execution?";

  const q1 = {
    stem: q1Stem,
    ...buildOptions(conceptLine, [
      "A topic unrelated to the provided materials.",
      "A general drone trivia point.",
      "An off-topic theory not covered here.",
    ]),
    explanation: description
      ? `From description: ${shorten(description)}`
      : sop
        ? `From SOP: ${shorten(sop)}`
        : "Based on the provided context.",
  };

  const q2 = {
    stem: q2Stem,
    ...buildOptions(sopStep, [
      "Skipping safety checks entirely.",
      "Using an unrelated hobby checklist.",
      "Ignoring the procedure order.",
    ]),
    explanation: sop ? `From SOP snippet: ${shorten(sopStep)}` : "SOP guidance was not provided; follow official steps.",
  };

  const q3 = {
    stem: q3Stem,
    ...buildOptions(codeLine, [
      "It performs an unrelated sensor calibration.",
      "It switches to an unrelated flight mode.",
      "It changes a setting not present in the snippet.",
    ]),
    explanation: code ? `From code snippet: ${shorten(codeLine)}` : "No code provided; use the supplied snippet when available.",
  };

  const q4 = {
    stem: q4Stem,
    ...buildOptions(
      troubleshootCue,
      [
        "Adjust random parameters without review.",
        "Ignore the SOP and rerun blindly.",
        "Assume hardware is faulty without checks.",
      ],
    ),
    explanation: sop || code
      ? "Troubleshoot by re-checking the provided SOP steps and code parameters."
      : "Use provided materials to verify steps and parameters.",
  };

  const q5 = {
    stem: q5Stem,
    ...buildOptions(outcomeLine, [
      "No measurement is needed.",
      "Any unrelated outcome counts as success.",
      "Only speed of completion matters, not accuracy.",
    ]),
    explanation: description
      ? `From description: ${shorten(outcomeLine)}`
      : sop
        ? `From SOP: ${shorten(outcomeLine)}`
        : "Use the stated objective to verify success.",
  };

  const questions = shuffle([q1, q2, q3, q4, q5]);

  return questions
    .map((q, idx) => {
      const lines = [
        `Q${idx + 1}. ${q.stem}`,
        ...q.options.map((opt) => `${opt.label}) ${opt.text}`),
        `Answer: ${q.answer}`,
        `Explanation: ${q.explanation}`,
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
  let contextText = "";
  try {
    const { message, context } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    contextText =
      typeof context === "string"
        ? context.trim()
        : context && typeof context === "object"
          ? JSON.stringify(context)
          : "";

    const apiKey = pickApiKey(req.headers.get("x-openai-key"));
    if (!apiKey) {
      if (isQuizPrompt(message)) {
        return NextResponse.json({ reply: buildQuizFallback({ message, contextText }), fallback: true }, { status: 200 });
      }
      const intro = buildWelcomeIntro(contextText);
      const baseReply = contextText
        ? `${fallbackReply(message)}\n\nActivity context: ${contextText}`
        : fallbackReply(message);
      const reply = `${intro}\n\n${baseReply}`;
      return NextResponse.json({ reply, fallback: true }, { status: 200 });
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
              + "Before any reply, open with a concise welcome tailored to the activity (use title, grade, subject, description when provided) that covers: why we are doing this activity, what the student will learn, how it relates to real life, and how it can help humanity. Keep that intro to 3-4 sentences, then continue the answer. "
              + "Maintain a friendly, professional, educational tone. Avoid backend/system details.",
          },
          ...(contextText
            ? [
                {
                  role: "system",
                  content: `Use this activity context for your reply:\n${contextText.slice(0, 2000)}`,
                },
              ]
            : []),
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
        return NextResponse.json(
          { reply: buildQuizFallback({ message, contextText }), fallback: true, detail },
          { status: 200 }
        );
      }
      const intro = buildWelcomeIntro(contextText);
      const baseReply = `${fallbackReply(message)} (Note: live assistant is temporarily unavailable.)`;
      const reply = contextText ? `${intro}\n\n${baseReply}\n\nActivity context: ${contextText}` : `${intro}\n\n${baseReply}`;
      return NextResponse.json(
        {
          reply,
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
    const intro = buildWelcomeIntro(contextText);
    return NextResponse.json(
      { reply: `${intro}\n\n${buildQuizFallback({ message: "", contextText })}`, fallback: true },
      { status: 200 }
    );
  }
}
