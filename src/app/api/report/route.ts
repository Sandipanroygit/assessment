import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Lightweight .env.local loader for local dev when env injection fails (avoids adding dependencies).
// Note: Next dev already loads .env.local, but on some setups the app route can miss it.
// We only fall back to reading the file when the key is absent to avoid overriding a valid injected env.
const ensureLocalEnv = () => {
  if (process.env.GOOGLE_API_KEY) return;
  const envPath = path.join(process.cwd(), ".env.local");
  try {
    const raw = fs.readFileSync(envPath, "utf8");
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .forEach((line) => {
        const idx = line.indexOf("=");
        if (idx === -1) return;
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key === "GOOGLE_API_KEY" && val) {
          process.env.GOOGLE_API_KEY = val;
        }
      });
  } catch {
    // ignore if file missing
  }
};

ensureLocalEnv();

// Ensure this route runs in the Node.js runtime (secrets available, no edge caching).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportPayload = {
  title?: string;
  subject?: string;
  grade?: string;
  description?: string;
  codeText?: string;
  sopUrl?: string;
  logText?: string;
  plotType?: string;
  plotImageDataUrl?: string | null;
  accuracyHint?: number;
  parsedPoints?: Array<{ x: number; y: number }>;
};

const clampAccuracy = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return Math.min(100, Math.max(0, Math.round(value)));
};

const normalizePoints = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) return [] as Array<{ x: number; y: number }>;
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  return points
    .map((p) => ({
      x: (p.x - minX) / spanX,
      y: (p.y - minY) / spanY,
    }))
    .sort((a, b) => a.x - b.x)
    .map((p) => ({
      x: Number.isFinite(p.x) ? Math.min(1, Math.max(0, p.x)) : 0,
      y: Number.isFinite(p.y) ? Math.min(1, Math.max(0, p.y)) : 0.5,
    }));
};

const computeCorrelation = (points: Array<{ x: number; y: number }>) => {
  if (points.length < 2) return 0;
  const n = points.length;
  const meanX = points.reduce((acc, p) => acc + p.x, 0) / n;
  const meanY = points.reduce((acc, p) => acc + p.y, 0) / n;
  let num = 0;
  let denomX = 0;
  let denomY = 0;
  points.forEach((p) => {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  });
  const denom = Math.sqrt(denomX * denomY) || 1;
  return num / denom;
};

const hasInversePressureTrend = (payload: ReportPayload) => {
  const text = `${payload.title ?? ""} ${payload.description ?? ""} ${payload.logText ?? ""}`.toLowerCase();
  return text.includes("pressure") && (text.includes("height") || text.includes("altitude"));
};

const buildFallbackReport = (payload: ReportPayload) => {
  const title = payload.title || "Activity";
  const inversePressureTrend = hasInversePressureTrend(payload);
  const accuracy = clampAccuracy(payload.accuracyHint);
  const points = Array.isArray(payload.parsedPoints) ? payload.parsedPoints.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) : [];
  const enoughData = points.length >= 3;
  const normPoints = normalizePoints(points);
  const correlation = enoughData ? computeCorrelation(points) : 0;
  const trendDirection =
    correlation > 0.2 ? "increasing" : correlation < -0.2 ? "decreasing" : inversePressureTrend ? "decreasing" : "flat";
  const inferredAccuracy =
    accuracy ??
    (enoughData ? Math.max(40, Math.min(100, Math.round(Math.abs(correlation) * 90 + (inversePressureTrend ? 5 : 0)))) : null);
  const accuracyNumber = typeof inferredAccuracy === "number" && Number.isFinite(inferredAccuracy) ? inferredAccuracy : null;
  const high = typeof accuracyNumber === "number" && accuracyNumber >= 90;
  const mid = typeof accuracyNumber === "number" && accuracyNumber >= 75;

  const summary = enoughData
    ? correlation > 0.7
      ? `Your data for "${title}" shows a clear ${trendDirection} trend that matches expectations.`
      : correlation > 0.4
      ? `"${title}" data trends ${trendDirection} but with some noise; tighten consistency for a better match.`
      : `Trend for "${title}" is weak/noisy; rerun with steadier sampling to capture the expected shape.`
    : `Limited points uploaded for "${title}". Add more samples to see an accurate trend.`;

  const objectiveAlignment = high
    ? "Objective met; log and plot align with the expected pattern."
    : mid
    ? "Objective mostly met; reduce noise and verify steps."
    : "Objective not yet met; follow SOP carefully and repeat the trial.";

  const trendAssessment = enoughData
    ? `Trend detected: ${trendDirection} (corr ${correlation.toFixed(2)}).`
    : inversePressureTrend
    ? "Expected inverse pressure-height trend; add more samples to verify."
    : "Expected monotonic trend; more data needed to confirm.";

  const possibleErrors =
    enoughData && correlation > 0.4
      ? ["Minor noise or offsets in measurements", "Sampling interval variation"]
      : [
          "Sensor noise or calibration drift",
          "Gaps or spikes in sampling",
          "Units or axis mix-up in the log/plot",
        ];

  const improvementTips =
    enoughData && correlation > 0.4
      ? [
          "Keep sampling interval consistent; avoid gaps.",
          "Smooth sudden spikes; recheck sensor placement and wiring.",
          "Re-run with the same setup to confirm repeatability.",
        ]
      : [
          "Collect more data points for a clearer trend.",
          "Verify units and columns before plotting.",
          "Repeat the trial after a quick sensor calibration.",
        ];

  const logInsights = enoughData
    ? [
        `Detected ${points.length} samples; trend is ${trendDirection} with correlation ${correlation.toFixed(2)}.`,
        `Value range X: ${points.reduce((acc, p) => [Math.min(acc[0], p.x), Math.max(acc[1], p.x)], [points[0].x, points[0].x]).join(" to ")}, Y: ${points.reduce((acc, p) => [Math.min(acc[0], p.y), Math.max(acc[1], p.y)], [points[0].y, points[0].y]).join(" to ")}`,
      ]
    : ["Not enough numeric pairs were detected in the uploaded log. Add more rows with numeric columns."];

  const overlayPoints =
    normPoints.length >= 3
      ? normPoints
      : inversePressureTrend
        ? [
            { x: 0.0, y: 0.9 },
            { x: 0.2, y: 0.75 },
            { x: 0.4, y: 0.55 },
            { x: 0.6, y: 0.4 },
            { x: 0.8, y: 0.25 },
            { x: 1.0, y: 0.1 },
          ]
        : [
            { x: 0.0, y: 0.1 },
            { x: 0.2, y: 0.25 },
            { x: 0.4, y: 0.45 },
            { x: 0.6, y: 0.65 },
            { x: 0.8, y: 0.8 },
            { x: 1.0, y: 0.9 },
          ];

  return {
    summary,
    objectiveAlignment,
    trendAssessment,
    accuracyPercent: accuracyNumber,
    possibleErrors,
    improvementTips,
    logInsights,
    overlay: {
      note:
        normPoints.length >= 3
          ? "Overlay shows your uploaded points normalized to expected axes."
          : inversePressureTrend
            ? "Expected trend: pressure decreases as height increases."
            : "Expected monotonic trend shown for reference.",
      points: overlayPoints,
    },
  };
};

const buildPrompt = (payload: ReportPayload) => {
  const logExcerpt = payload.logText?.slice(0, 3000) ?? "";
  const codeExcerpt = payload.codeText?.slice(0, 2000) ?? "";
  const inversePressureTrend = hasInversePressureTrend(payload);
  const accuracy = clampAccuracy(payload.accuracyHint);
  return [
    "You are an academic evaluator for a student lab activity.",
    "Analyze the student's log + graph against the expected trend in the SOP and activity description.",
    "Return JSON only with these keys:",
    "summary, objectiveAlignment, trendAssessment, accuracyPercent, possibleErrors, improvementTips, logInsights, overlay",
    "overlay must include: note (string) and points (array of 12-20 points).",
    "Each point must be an object with x and y values normalized between 0 and 1.",
    "x must be strictly increasing.",
    inversePressureTrend
      ? "Expected trend: as height increases, pressure decreases. Reflect this inverse relationship in overlay points."
      : null,
    "Accuracy percent should reflect similarity to the expected trend.",
    "Use the accuracy hint: if >= 90, praise and avoid listing errors (possibleErrors should state none). If < 90, include likely issues and encourage a retry when needed.",
    "Keep feedback concise and specific; avoid generic boilerplate.",
    accuracy !== undefined ? `Accuracy hint (0-100): ${accuracy}` : "Accuracy hint: (not provided)",
    "Be specific and student-friendly; suggest likely sources of error.",
    "",
    `Title: ${payload.title ?? ""}`,
    `Grade: ${payload.grade ?? ""}`,
    `Subject: ${payload.subject ?? ""}`,
    `Description: ${payload.description ?? ""}`,
    payload.sopUrl ? `SOP URL: ${payload.sopUrl}` : "SOP URL: (not provided)",
    codeExcerpt ? `Code excerpt:\n${codeExcerpt}` : "Code excerpt: (not provided)",
    payload.plotType ? `Plot type: ${payload.plotType}` : "Plot type: (unknown)",
    logExcerpt ? `Log excerpt:\n${logExcerpt}` : "Log excerpt: (not provided)",
  ]
    .filter(Boolean)
    .join("\n");
};

const buildFallbackResponse = (payload: ReportPayload, detail: string, status = 200) =>
  NextResponse.json({ report: buildFallbackReport(payload), fallback: true, detail }, { status });

const extractContentString = (rawContent: unknown) => {
  if (typeof rawContent === "string") return rawContent;
  if (Array.isArray(rawContent)) {
    return rawContent
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part !== null && "text" in part && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  if (typeof rawContent === "object" && rawContent !== null && "text" in rawContent) {
    const value = (rawContent as { text?: unknown }).text;
    return typeof value === "string" ? value : "";
  }
  return "";
};

const pickApiKey = (headerKey: string | null) => {
  const candidates = [
    process.env.GOOGLE_API_KEY,
    headerKey,
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
  ].filter(Boolean) as string[];
  const isMasked = (key: string) => key.includes("*") || key.includes("•");
  const looksValid = (key: string) => /^AIza[0-9A-Za-z_-]{20,}/.test(key) && !isMasked(key);
  return candidates.find(looksValid) ?? candidates.find((k) => !isMasked(k)) ?? null;
};

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as ReportPayload;
    const headerKey = req.headers.get("x-google-key") ?? req.headers.get("x-openai-key");
    const apiKey = pickApiKey(headerKey?.trim() ?? null);
    if (!apiKey) {
      console.error("[report] GOOGLE_API_KEY missing or malformed");
      return buildFallbackResponse(payload, "GOOGLE_API_KEY missing or malformed", 500);
    }
    // Debug trace without leaking the full key
    console.debug("[report] using GOOGLE_API_KEY prefix:", apiKey.slice(0, 8));

    const promptText = buildPrompt(payload);
    const userParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      { text: promptText },
    ];

    if (payload.plotImageDataUrl) {
      const match = /^data:(.+);base64,(.+)$/.exec(payload.plotImageDataUrl);
      if (match) {
        userParts.push({
          inlineData: { mimeType: match[1], data: match[2] },
        });
      }
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  "You are an evaluator for STEM lab activities. Produce concise, student-friendly feedback and a clear expected-trend overlay for learning.",
              },
            ],
          },
          contents: [{ role: "user", parts: userParts }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      }
    );

    if (!geminiRes.ok) {
      let detail = "Gemini request failed.";
      try {
        const err = await geminiRes.json();
        detail = (err as { error?: { message?: string; code?: string } })?.error?.message ?? detail;
      } catch {
        try {
          detail = await geminiRes.text();
        } catch {
          // ignore
        }
      }
      console.error("[report] Gemini error:", detail);
      return buildFallbackResponse(payload, detail, geminiRes.status || 502);
    }

    const data = await geminiRes.json();
    const content = extractContentString(
      (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content
        ?.parts
    );
    if (!content) {
      console.error("[report] Empty content from Gemini");
      return buildFallbackResponse(payload, "Empty content from Gemini", 502);
    }
    try {
      const parsed = JSON.parse(content);
      return NextResponse.json({ report: parsed }, { status: 200 });
    } catch {
      console.error("[report] Invalid JSON from Gemini:", content?.slice?.(0, 200) ?? "");
      return buildFallbackResponse(payload, "Invalid JSON from Gemini", 502);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    console.error("[report] Unhandled error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
