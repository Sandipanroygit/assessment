import { NextResponse } from "next/server";

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
};

const clampAccuracy = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return Math.min(100, Math.max(0, Math.round(value)));
};

const hasInversePressureTrend = (payload: ReportPayload) => {
  const text = `${payload.title ?? ""} ${payload.description ?? ""} ${payload.logText ?? ""}`.toLowerCase();
  return text.includes("pressure") && (text.includes("height") || text.includes("altitude"));
};

const buildFallbackReport = (payload: ReportPayload) => {
  const title = payload.title || "Activity";
  const inversePressureTrend = hasInversePressureTrend(payload);
  const accuracy = clampAccuracy(payload.accuracyHint);
  const high = typeof accuracy === "number" && accuracy >= 90;
  const mid = typeof accuracy === "number" && accuracy >= 75;
  const accuracyPercent = accuracy ?? (inversePressureTrend ? 78 : 72);

  return {
    summary: high
      ? `Great work! Your submission for "${title}" aligns with the expected trend - keep it up.`
      : mid
      ? `Submission for "${title}" is mostly aligned. Tighten up minor deviations and confirm against the SOP.`
      : `Submission for "${title}" needs attention. Compare your plot and log to the expected trend and retry if needed.`,
    objectiveAlignment: high
      ? "Objective met; steps appear followed correctly."
      : mid
      ? "Objective mostly met; double-check safety checks and timing."
      : "Objective not fully met; follow each SOP step carefully on the next attempt.",
    trendAssessment: high
      ? "Trend matches the expected shape with minimal deviation."
      : mid
      ? "Trend is close to expected, with small offsets or slope differences."
      : "Trend differs from expected; recalibrate and rerun the trial.",
    accuracyPercent,
    possibleErrors: high
      ? ["No obvious errors detected from your upload."]
      : [
          "Sensor noise or calibration drift",
          "Incorrect sampling interval",
          "Incomplete warm-up or stabilization period",
        ],
    improvementTips: high
      ? ["Nice work - add brief notes about your setup to document this run."]
      : [
          "Repeat the trial with a steady setup and consistent timing.",
          "Cross-check calculations in the log before plotting.",
          "Re-run the activity following each SOP step carefully.",
        ],
    logInsights: payload.logText
      ? [
          high
            ? "Log values look stable and match the expected pattern."
            : mid
            ? "Log shows small deviations; verify any spikes or gaps."
            : "Log shows deviations; check for spikes, gaps, or incorrect units before retrying.",
        ]
      : ["No log excerpt provided."],
    overlay: {
      note: inversePressureTrend
        ? high
          ? "Expected trend: pressure decreases as height increases. Your data appears to follow this."
          : "Expected trend: pressure decreases as height increases."
        : high
        ? "Expected trend overlay; your points appear to align."
        : "Expected trend overlay is a generic guide. Adjust based on the SOP objective.",
      points: inversePressureTrend
        ? [
            { x: 0.0, y: 0.9 },
            { x: 0.15, y: 0.8 },
            { x: 0.35, y: 0.6 },
            { x: 0.55, y: 0.45 },
            { x: 0.75, y: 0.3 },
            { x: 1.0, y: 0.15 },
          ]
        : [
            { x: 0.0, y: 0.1 },
            { x: 0.15, y: 0.2 },
            { x: 0.35, y: 0.45 },
            { x: 0.55, y: 0.65 },
            { x: 0.75, y: 0.8 },
            { x: 1.0, y: 0.9 },
          ],
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

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as ReportPayload;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ report: buildFallbackReport(payload), fallback: true }, { status: 200 });
    }

    const promptText = buildPrompt(payload);
    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
    > = [{ type: "text", text: promptText }];

    if (payload.plotImageDataUrl) {
      userContent.push({
        type: "image_url",
        image_url: { url: payload.plotImageDataUrl, detail: "low" },
      });
    }

    const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an evaluator for STEM lab activities. Produce concise, student-friendly feedback and a clear expected-trend overlay for learning.",
          },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!openAiRes.ok) {
      return NextResponse.json({ report: buildFallbackReport(payload), fallback: true }, { status: 200 });
    }

    const data = await openAiRes.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    try {
      const parsed = JSON.parse(content);
      return NextResponse.json({ report: parsed }, { status: 200 });
    } catch {
      return NextResponse.json({ report: buildFallbackReport(payload), fallback: true }, { status: 200 });
    }
  } catch {
    return NextResponse.json({ report: buildFallbackReport({}), fallback: true }, { status: 200 });
  }
}
