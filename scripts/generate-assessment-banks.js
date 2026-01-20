"use strict";

/**
 * Generate concept-focused MCQ banks (100 per activity) using activity description/SOP/code.
 * Saves to public/assessments/<activityId>.json as:
 * { activityId, title, subject, grade, generatedAt, questions: Array<{question,options[{label,text}],answer,explanation}> }
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ENV_PATH = path.join(process.cwd(), ".env.local");
if (fs.existsSync(ENV_PATH)) {
  const lines = fs.readFileSync(ENV_PATH, "utf-8").split(/\r?\n/).filter(Boolean);
  lines.forEach((line) => {
    const match = line.match(/^(.*?)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      process.env[key] = value;
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const toAscii = (text) =>
  (text || "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x00-\x7F]/g, "");

const clip = (value, limit = 140) => {
  const text = value || "";
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
};

const pickLine = (text, options = {}) => {
  const maxLen = options.maxLen || 120;
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        l.length <= maxLen &&
        !/^\/\//.test(l) &&
        !/^#/.test(l) &&
        !/^--/.test(l) &&
        !/^\/\*/.test(l)
    );
  return lines.length ? lines[0] : "";
};

const fetchText = async (url, max = 8000) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  if (/pdf/i.test(contentType)) {
    return `SOP PDF available at ${url}`;
  }
  const txt = await res.text();
  return txt.slice(0, max);
};

const normalizeAssets = async (assets) => {
  const result = { code: "", sop: "" };
  for (const asset of assets || []) {
    if (asset.type === "code" && asset.url && !result.code) {
      try {
        result.code = await fetchText(asset.url, 6000);
      } catch (err) {
        console.warn("Code fetch failed", asset.url, err.message);
      }
    }
    if (asset.type === "doc" && asset.url && !result.sop) {
      try {
        result.sop = await fetchText(asset.url, 4000);
      } catch (err) {
        console.warn("SOP fetch failed", asset.url, err.message);
      }
    }
  }
  return result;
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const allowedSubjects = ["physics", "mathematics", "maths"];

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "their",
  "using",
  "students",
  "activity",
  "drone",
  "flight",
  "data",
  "will",
  "they",
  "also",
  "how",
  "into",
  "over",
  "about",
  "such",
  "different",
  "through",
  "after",
  "which",
  "should",
  "can",
  "during",
  "about",
  "each",
  "most",
  "very",
  "were",
  "then",
  "than",
  "only",
  "your",
  "have",
  "has",
  "been",
  "because",
]);

const deriveKeywords = (text) => {
  const tokens = text
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOP_WORDS.has(t));
  const freq = new Map();
  tokens.forEach((t) => freq.set(t, (freq.get(t) || 0) + 1));
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word]) => word);
};

const knownMetrics = [
  "distance",
  "displacement",
  "velocity",
  "speed",
  "altitude",
  "pressure",
  "battery",
  "energy",
  "power",
  "stability",
  "hover",
  "path",
  "efficiency",
  "regression",
  "trend",
  "simulation",
  "monte",
  "classification",
  "biodiversity",
  "noise",
  "vibration",
  "maintenance",
  "telemetry",
  "csv",
  "analysis",
  "vector",
  "components",
  "centripetal",
  "polygon",
  "square",
  "survey",
  "observation",
  "image",
  "visual",
  "trajectory",
  "force",
  "balance",
  "stability",
  "growth",
  "environment",
];

const extractMetrics = (text) => {
  const lower = text.toLowerCase();
  const hits = knownMetrics.filter((m) => lower.includes(m));
  return hits.length ? hits : ["observations", "measurements", "logs"];
};

const shuffle = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const makeOptions = (correct, wrongPool, salt = 0) => {
  const pool = wrongPool.filter(Boolean);
  while (pool.length < 3) pool.push("Not stated in this activity.");
  const shuffledWrong = shuffle(pool).slice(0, 3);
  const options = shuffle([correct, ...shuffledWrong]);
  const letters = ["A", "B", "C", "D"];
  const labeled = options.map((text, idx) => ({ label: letters[idx], text }));
  const answer = letters[Math.max(0, options.indexOf(correct))];
  return { options: labeled, answer };
};

const templates = [
  (ctx, i) => {
    const stem =
      i % 2 === 0
        ? `Which quantity best captures the focus of "${ctx.title}"?`
        : "Which physical/mathematical idea drives the task?";
    const correct = clip(ctx.concept, 120);
    const wrong = [
      "Pilot preferences and style",
      "Entertainment-only free flight",
      "Hardware aesthetics unrelated to data",
    ];
    return { stem, correct, wrong, explanation: `From description: ${ctx.concept}` };
  },
  (ctx) => {
    const metric = ctx.metric;
    const stem = `Which variable must be measured to evaluate the objective?`;
    const correct = `Quantify ${metric} as specified.`;
    const wrong = [
      "Unlogged pilot reaction time",
      "Random internet values",
      "Ignoring quantitative capture",
    ];
    return { stem, correct, wrong, explanation: `Key focus: ${metric}` };
  },
  (ctx, i) => {
    const metric = ctx.metric;
    const stem =
      i % 3 === 0
        ? `Which trend check validates ${metric}?`
        : `How should ${metric} be interpreted mathematically?`;
    const correct = `Compare recorded ${metric} to the expected curve/relationship described.`;
    const wrong = ["Assume expected values", "Use unrelated datasets", "Skip comparisons"];
    return { stem, correct, wrong, explanation: `Validation uses expected vs observed ${metric}.` };
  },
  (ctx, i) => {
    const metric = ctx.metric;
    const stem =
      i % 2 === 0
        ? `Which relationship best describes ${metric} versus time/position in this activity?`
        : `How should ${metric} vary if the objective is met?`;
    const correct = "Follow the expected functional trend given in the activity (e.g., linear, inverse, piecewise).";
    const wrong = [
      "No relationship; values should be random",
      "Opposite trend with no justification",
      "Assume constant regardless of conditions",
    ];
    return { stem, correct, wrong, explanation: "Trend form is defined by the described objective/phenomenon." };
  },
  (ctx, i) => {
    const codeLine = ctx.codeLine || "the provided script parameters";
    const stem =
      i % 2 === 0
        ? "Which script element most directly controls the measured variable?"
        : "What should be inspected first to ensure parameter correctness?";
    const correct = clip(codeLine, 120);
    const wrong = [
      "Comments unrelated to execution",
      "Unused placeholder text",
      "Aesthetic spacing changes",
    ];
    return { stem, correct, wrong, explanation: "Measured outcomes depend on correct parameters." };
  },
  (ctx, i) => {
    const sopLine = ctx.sopLine || "the SOP checklist items";
    const stem =
      i % 2 === 0
        ? "Which SOP detail guards against invalid measurements?"
        : "What must be verified in the SOP before logging data?";
    const correct = clip(sopLine, 120);
    const wrong = ["Skipping pre-flight checks", "Ignoring safety limits", "Using another activity's steps"];
    return { stem, correct, wrong, explanation: "SOP gates valid, safe measurements." };
  },
  (ctx, i) => {
    const stem =
      i % 2 === 0
        ? "Which result shows the objective was achieved quantitatively?"
        : "What indicates success from a physics/maths standpoint?";
    const correct = clip(`Observed data matches the described objective (${ctx.objective}).`, 140);
    const wrong = ["Any landing counts", "Only subjective smoothness matters", "No measurements reviewed"];
    return { stem, correct, wrong, explanation: "Success = matching objective with data." };
  },
  (ctx) => {
    const stem = "What comparison is required to validate findings mathematically?";
    const correct = "Contrast observed curve/values with the expected pattern described in the activity.";
    const wrong = ["Compare to entertainment metrics", "Accept first run without review", "Use random baselines"];
    return { stem, correct, wrong, explanation: "Validation hinges on expected-vs-observed comparison." };
  },
  (ctx, i) => {
    const metric = ctx.metric;
    const stem = i % 2 === 0 ? "First technical step when troubleshooting?" : "How to isolate the fault path?";
    const correct = `Re-check SOP steps and parameters affecting ${metric} before changing hardware.`;
    const wrong = ["Swap hardware immediately", "Ignore logs and rerun blindly", "Skip procedure review"];
    return { stem, correct, wrong, explanation: "Start with procedure/parameters, not guesses." };
  },
  (ctx, i) => {
    const metric = ctx.metric;
    const stem = i % 2 === 0 ? "Which pattern should be contrasted?" : "How do students separate key behaviors?";
    const correct = `Compare expected vs observed patterns for ${metric} and note deviations.`;
    const wrong = ["Memorize trivia", "Avoid comparisons", "Focus on aesthetics"];
    return { stem, correct, wrong, explanation: "Pattern comparison yields technical insight." };
  },
  (ctx, i) => {
    const stem = i % 2 === 0 ? "Which practice ensures dependable logs?" : "What habit keeps data reliable?";
    const correct = "Log every run and keep parameters/procedure consistent before interpreting.";
    const wrong = ["Skip logging", "Change steps mid-run with no record", "Rely on memory"];
    return { stem, correct, wrong, explanation: "Reliability needs disciplined logging and consistency." };
  },
  (ctx, i) => {
    const stem = i % 2 === 0 ? "What pre-run check protects accuracy?" : "Which prep step avoids bad data?";
    const correct = "Review objectives, SOP constraints, and key parameters prior to execution.";
    const wrong = ["Start without review", "Use unrelated checklists", "Ignore objectives entirely"];
    return { stem, correct, wrong, explanation: "Accurate runs need targeted prep." };
  },
];

const buildBank = (context) => {
  const questions = [];
  for (let i = 0; i < 100; i += 1) {
    const tmpl = templates[i % templates.length];
    const { stem, correct, wrong, explanation } = tmpl(context, i);
    const wrongPool = wrong || [];
    const { options, answer } = makeOptions(correct, wrongPool, i);
    questions.push({
      question: toAscii(clip(stem, 140)),
      options: options.map((opt) => ({ label: opt.label, text: toAscii(clip(opt.text, 140)) })),
      answer,
      explanation: toAscii(clip(explanation, 180)),
    });
  }
  return questions;
};

const main = async () => {
  const { data, error } = await supabase
    .from("curriculum_modules")
    .select("id,title,grade,subject,module,description,asset_urls,published")
    .eq("published", true);
  if (error) throw error;

  const outDir = path.join(process.cwd(), "public", "assessments");
  ensureDir(outDir);

  for (const row of data || []) {
    const subject = (row.subject || "").toLowerCase();
    if (!allowedSubjects.includes(subject)) {
      console.log(`Skipping ${row.title} (${row.id}) due to subject ${row.subject}`);
      continue;
    }
    const assets = Array.isArray(row.asset_urls) ? row.asset_urls : [];
    const snippets = await normalizeAssets(assets);
    const descText = toAscii((row.description || "").trim());
    const descLine = descText.split(/\n/).filter(Boolean)[0] || descText;
    const concept = descLine || row.title;
    const metric = extractMetrics(descText);
    const objective = descLine || concept;
    const keywords = deriveKeywords(`${row.title} ${row.subject} ${descText} ${snippets.code} ${snippets.sop}`);
    const codeLine = toAscii(pickLine(snippets.code));
    const sopLine = toAscii(pickLine(snippets.sop));
    const context = {
      id: row.id,
      title: row.title,
      grade: row.grade,
      subject: row.subject,
      description: descText.slice(0, 2400),
      code: toAscii(snippets.code).slice(0, 2400),
      sop: toAscii(snippets.sop).slice(0, 2000),
      concept: toAscii(concept),
      metric: toAscii(metric[0] || "observations"),
      objective: toAscii(objective),
      keywords,
      codeLine,
      sopLine,
    };
    console.log(`Building MCQs for ${row.title} (${row.id}) ...`);
    const questions = buildBank(context);
    const payload = {
      activityId: row.id,
      title: row.title,
      subject: row.subject,
      grade: row.grade,
      generatedAt: new Date().toISOString(),
      questions,
    };
    const outPath = path.join(outDir, `${row.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf-8");
    console.log(`Saved ${questions.length} questions to ${outPath}`);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
