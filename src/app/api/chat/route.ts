import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Run on the server
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- ENV / KEY HANDLING ----------
const loadEnvKey = () => {
  if (process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_QUESTIONS || process.env.GOOGLE_API_KEY_FALLBACK) return;

  const readEnvFile = (file: string) => {
    try {
      const raw = fs.readFileSync(file, "utf8");
      raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .forEach((line) => {
          const [k, ...rest] = line.split("=");
          const v = rest.join("=").trim();
          if (k === "GOOGLE_API_KEY" && v) process.env.GOOGLE_API_KEY = v;
          if (k === "GOOGLE_API_KEY_QUESTIONS" && v) process.env.GOOGLE_API_KEY_QUESTIONS = v;
          if (k === "GOOGLE_API_KEY_FALLBACK" && v) process.env.GOOGLE_API_KEY_FALLBACK = v;
        });
    } catch {
      /* ignore */
    }
  };

  readEnvFile(path.join(process.cwd(), ".env"));
  readEnvFile(path.join(process.cwd(), ".env.local"));
};

const pickApiKey = (headerKey: string | null) => {
  const candidates = [
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_API_KEY_QUESTIONS,
    process.env.GOOGLE_API_KEY_FALLBACK,
    headerKey,
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY, // last resort
  ].filter(Boolean) as string[];

  const isMasked = (k: string) => k.includes("*") || k.includes("•");
  const looksValid = (k: string) => /^AIza[0-9A-Za-z_-]{20,}/.test(k) && !isMasked(k);
  return candidates.find(looksValid) ?? candidates.find((k) => !isMasked(k)) ?? null;
};

// ---------- HELPERS ----------
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

const shorten = (value: string, limit = 200) => (value.length > limit ? `${value.slice(0, limit)}...` : value);

const sample = <T,>(arr: T[]): T | null => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);

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
      ? `From description: ${shorten(description, 140)}`
      : sop
        ? `From SOP: ${shorten(sop, 140)}`
        : "Based on the provided context.",
  };

  const q2 = {
    stem: q2Stem,
    ...buildOptions(sopStep, [
      "Skipping safety checks entirely.",
      "Using an unrelated hobby checklist.",
      "Ignoring the procedure order.",
    ]),
    explanation: sop ? `From SOP snippet: ${shorten(sopStep, 140)}` : "SOP guidance was not provided; follow official steps.",
  };

  const q3 = {
    stem: q3Stem,
    ...buildOptions(codeLine, [
      "It performs an unrelated sensor calibration.",
      "It switches to an unrelated flight mode.",
      "It changes a setting not present in the snippet.",
    ]),
    explanation: code ? `From code snippet: ${shorten(codeLine, 140)}` : "No code provided; use the supplied snippet when available.",
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
      ? `From description: ${shorten(outcomeLine, 140)}`
      : sop
        ? `From SOP: ${shorten(outcomeLine, 140)}`
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

const buildWelcomeIntro = (context?: unknown) => {
  if (!context) return "";
  try {
    const parsed = typeof context === "string" ? JSON.parse(context) : (context as Record<string, unknown>);
    const title = (parsed?.title as string) || "this activity";
    const subject = (parsed?.subject as string) || "drone learning";
    const desc = (parsed?.description as string) || "";
    const grade = (parsed?.grade as string) ? ` for Grade ${parsed?.grade}` : "";
    return [
      `Welcome! Today we are exploring "${title}"${grade}, focused on ${subject}.`,
      `Why this matters: ${desc ? shorten(desc, 220) : "Hands-on drone skills blending programming, electronics, and physics."}`,
      `What you will learn: ${subject ? `You will practice ${subject} with code, testing, and reflection.` : "Core STEM problem-solving with code, sensors, and safe flight steps."}`,
      `This connects to real life through inspection, disaster response, agriculture, and smart cities, helping communities with safer logistics and better monitoring.`,
    ].join(" ");
  } catch {
    return "";
  }
};

// ---------- ROUTE ----------
export async function POST(req: Request) {
  loadEnvKey();

  let message: string | undefined;
  let context: unknown;
  try {
    const body = (await req.json()) as { message?: string; context?: unknown };
    message = body.message;
    context = body.context;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contextText =
    typeof context === "string"
      ? context.trim()
      : context && typeof context === "object"
        ? JSON.stringify(context)
        : "";

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const apiKey = pickApiKey(req.headers.get("x-google-key") ?? req.headers.get("x-openai-key"));
  if (!apiKey) {
    if (isQuizPrompt(message)) {
      return NextResponse.json(
        {
          reply: buildQuizFallback({ message, contextText }),
          fallback: true,
          detail: "Gemini API key missing or invalid.",
        },
        { status: 200 },
      );
    }
    const intro = buildWelcomeIntro(context);
    return NextResponse.json(
      {
        reply: `${intro}\n\nGemini API key missing or invalid. Set GOOGLE_API_KEY (or GOOGLE_API_KEY_QUESTIONS) in .env.local and restart.`,
        fallback: true,
      },
      { status: 200 },
    );
  }

  const client = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const intro = buildWelcomeIntro(context);

  try {
    const model = client.getGenerativeModel({ model: modelName });
    const completion = await model.generateContent({
      systemInstruction: {
        parts: [
          {
            text:
              "You are an AI assistant for Indus Skylab, an educational platform providing structured, school-focused drone curriculum for grades 9-12. "
              + "Explain what students learn, why drones matter, and keep the tone friendly and educational. "
              + "Before any reply, include the provided welcome intro text if supplied.",
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: intro ? `${intro}\n\n${message}` : message }],
        },
      ],
      generationConfig: { temperature: 0.4 },
    });

    const reply = completion.response?.text?.() ?? "No reply generated.";
    return NextResponse.json({ reply });
  } catch (err) {
    const detail =
      (err as { status?: number; error?: { message?: string } })?.error?.message ||
      (err as Error & { status?: number }).message ||
      "Unknown error contacting Gemini";
    const isQuota = detail.toLowerCase().includes("quota") || (err as { status?: number }).status === 429;

    if (isQuizPrompt(message)) {
      return NextResponse.json(
        {
          reply: buildQuizFallback({ message, contextText }),
          fallback: true,
          detail,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        reply: `${intro}\n\nAssistant fallback: Gemini call failed${isQuota ? " (quota exceeded — add billing or try a different project/key)" : ""}: ${detail}`,
        fallback: true,
        detail,
      },
      { status: 200 },
    );
  }
}
