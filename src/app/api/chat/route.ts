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
const shorten = (val: string, n = 200) => (val.length > n ? `${val.slice(0, n)}...` : val);

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

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const apiKey = pickApiKey(req.headers.get("x-google-key") ?? req.headers.get("x-openai-key"));
  if (!apiKey) {
    const intro = buildWelcomeIntro(context);
    return NextResponse.json(
      {
        reply: `${intro}\n\nGemini API key missing or invalid. Set GOOGLE_API_KEY (or GOOGLE_API_KEY_QUESTIONS) in .env.local and restart.`,
        fallback: true,
      },
      { status: 200 }
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
    return NextResponse.json(
      {
        reply: `${intro}\n\nAssistant fallback: Gemini call failed${isQuota ? " (quota exceeded — add billing or try a different project/key)" : ""}: ${detail}`,
        fallback: true,
        detail,
      },
      { status: 200 }
    );
  }
}
