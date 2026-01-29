// ======================================================
//  AI ASSESSMENT STUDIO – BACKEND (CommonJS version)
// ======================================================

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

// Load .env (optional, used mainly for PORT)
dotenv.config();

// 🔑 Hardcoded API key for now. KEEP IT IN QUOTES.
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY;
if (!GOOGLE_API_KEY) {
  throw new Error("Missing GOOGLE_API_KEY");
}
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Create Express app + config
const app = express();
const PORT = process.env.PORT || 4000;
const upload = multer({ dest: "uploads/" });

// Global middleware
app.use(express.json({ limit: "10mb" }));
app.use(cors());

// Serve static frontend from ./public
app.use(express.static("public"));

// ===============
// C) IN-MEMORY DB
// ===============
const db = {
  teachers: [], // { id, email, name, passwordHash }
  students: [], // { id, studentId, name, passwordHash }
  tests: []     // { id, key, date, subject, name, showAnswers, createdById, questions[], submissions[] }
};

// Simple ID generator
function makeId(prefix = "") {
  return (
    prefix +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8)
  );
}

// Unique key per test
function buildTestKey(date, subject, name) {
  return `${date}__${subject.trim()}__${name.trim()}`;
}

// Call Gemini generateContent with text and optional inline data parts
async function callGemini({ systemPrompt, userParts, temperature = 0.4, responseMimeType }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`;
  const body = {
    contents: [{ role: "user", parts: userParts }],
    generationConfig: { temperature },
  };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  if (responseMimeType) {
    body.generationConfig.responseMimeType = responseMimeType;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const textBody = await res.text();
  let data;
  try {
    data = JSON.parse(textBody);
  } catch {
    data = null;
  }

  if (!res.ok) {
    const detail = (data && data.error && data.error.message) || textBody || "Gemini request failed";
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

// ===============
// D) HELPERS
// ===============
async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

async function checkPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Read a file and try to extract text
async function extractTextFromFile(file) {
  const fullPath = path.resolve(file.path);
  const buffer = fs.readFileSync(fullPath);

  const isPdf =
    file.mimetype === "application/pdf" ||
    file.originalname.toLowerCase().endsWith(".pdf");
  const isImage = /^image\//.test(file.mimetype);

  try {
    // 1) Try pdf-parse if it's a text PDF
    if (isPdf) {
      try {
        const parsed = await pdfParse(buffer);
        if (parsed.text && parsed.text.trim().length > 0) {
          return `PDF TEXT (${file.originalname}):\n` + parsed.text.slice(0, 8000);
        }
      } catch (e) {
        // Ignore and fall through to vision
      }
    }

    // 2) If image or scanned PDF: use Gemini vision
    if (isImage || isPdf) {
      const base64 = buffer.toString("base64");

      const summary = await callGemini({
        systemPrompt:
          "You are a teacher assistant. Read this document/image and summarise key concepts for making exam questions.",
        userParts: [
          {
            text:
              "Extract the key concepts and important facts from this document/image. Return a concise outline only."
          },
          {
            inlineData: {
              mimeType: file.mimetype,
              data: base64
            }
          }
        ],
        temperature: 0.4
      });

      return `VISION SUMMARY (${file.originalname}):\n` + summary;
    }

    // 3) Fallback – treat as text-ish
    const asString = buffer.toString("utf8");
    return `FILE (${file.originalname}) RAW TEXT:\n` + asString.slice(0, 8000);
  } catch (err) {
    console.error("Error extracting text from file", file.originalname, err);
    return `UNREADABLE FILE (${file.originalname}): ${err.message}`;
  } finally {
    // Clean up temp file
    fs.unlink(fullPath, () => {});
  }
}

// Build combined context from topics, links, and files
async function buildContextFromInputs({ topicsText, links, files }) {
  const parts = [];

  if (topicsText && topicsText.trim()) {
    parts.push("TOPICS / NOTES:\n" + topicsText.trim());
  }

  if (Array.isArray(links) && links.length > 0) {
    parts.push("REFERENCE LINKS:\n" + links.join("\n"));
  }

  if (Array.isArray(files) && files.length > 0) {
    const extracts = [];
    for (const file of files) {
      const txt = await extractTextFromFile(file);
      extracts.push(txt);
    }
    parts.push("FILE EXTRACTS:\n" + extracts.join("\n\n---\n\n"));
  }

  if (parts.length === 0) {
    parts.push(
      "No specific content provided. Generate questions based on generic understanding of the subject."
    );
  }

  return parts.join("\n\n====================\n\n");
}

// Generate questions via Gemini
async function generateQuestionsWithGemini({
  subject,
  testName,
  numMcq,
  numShort,
  numDesc,
  topicsText,
  links,
  files
}) {
  const contextText = await buildContextFromInputs({ topicsText, links, files });

  const systemPrompt = `
You are an exam generator for a school assessment platform.
Generate **structured JSON only** without extra text.

Question types:
- "mcq": 4 options (A–D), correctAnswer is a letter.
- "short": 1–3 line answers, include expected keywords in correctAnswer.
- "descriptive": 5–8 line answers, correctAnswer is a model answer.

Return JSON exactly like:
{
  "questions": [
    {
      "type": "mcq" | "short" | "descriptive",
      "prompt": "...",
      "options": ["A", "B", "C", "D"] | null,
      "correctAnswer": "B" or "keywords..." or "model answer...",
      "maxScore": number
    }
  ]
}
No backticks, no explanation outside JSON.
  `;

  const userPrompt = `
Subject: ${subject}
Test: ${testName}

Requested counts:
- MCQ: ${numMcq}
- Short answer: ${numShort}
- Descriptive: ${numDesc}

Source material (topics + links + file extracts):
${contextText}
  `;

  const raw = await callGemini({
    systemPrompt,
    userParts: [{ text: userPrompt }],
    temperature: 0.4,
    responseMimeType: "application/json"
  });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("Failed to parse Gemini JSON. Raw:", raw);
    parsed = {
      questions: [
        {
          type: "mcq",
          prompt: `Fallback MCQ in ${subject} (JSON parse failed).`,
          options: ["Option A", "Option B", "Option C", "Option D"],
          correctAnswer: "A",
          maxScore: 1
        }
      ]
    };
  }

  const result = (parsed.questions || []).map((q, idx) => ({
    id: `Q${String(idx + 1).padStart(2, "0")}`,
    type: q.type,
    prompt: q.prompt,
    options: q.options || null,
    correctAnswer: q.correctAnswer || "",
    maxScore:
      q.maxScore || (q.type === "mcq" ? 1 : q.type === "short" ? 2 : 4)
  }));

  return result;
}

// ===============
// E) AUTH ROUTES
// ===============

// TEACHER SIGNUP
app.post("/api/auth/teacher/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "name, email, password are required" });
    }
    const lowerEmail = email.toLowerCase();
    if (db.teachers.find((t) => t.email === lowerEmail)) {
      return res
        .status(400)
        .json({ error: "Teacher with this email already exists" });
    }

    const passwordHash = await hashPassword(password);
    const teacher = {
      id: makeId("TCH_"),
      name,
      email: lowerEmail,
      passwordHash
    };
    db.teachers.push(teacher);

    res.json({
      ok: true,
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email }
    });
  } catch (err) {
    console.error("Teacher signup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// TEACHER LOGIN
app.post("/api/auth/teacher/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email, password are required" });
    }
    const lowerEmail = email.toLowerCase();
    const teacher = db.teachers.find((t) => t.email === lowerEmail);
    if (!teacher) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await checkPassword(password, teacher.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    res.json({
      ok: true,
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email }
    });
  } catch (err) {
    console.error("Teacher login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// STUDENT SIGNUP
app.post("/api/auth/student/signup", async (req, res) => {
  try {
    const { name, studentId, password } = req.body || {};
    if (!name || !studentId || !password) {
      return res
        .status(400)
        .json({ error: "name, studentId, password are required" });
    }

    if (db.students.find((s) => s.studentId === studentId)) {
      return res
        .status(400)
        .json({ error: "Student with this ID already exists" });
    }

    const passwordHash = await hashPassword(password);
    const student = {
      id: makeId("STD_"),
      name,
      studentId,
      passwordHash
    };
    db.students.push(student);

    res.json({
      ok: true,
      student: { id: student.id, name: student.name, studentId: student.studentId }
    });
  } catch (err) {
    console.error("Student signup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// STUDENT LOGIN
app.post("/api/auth/student/login", async (req, res) => {
  try {
    const { studentId, password } = req.body || {};
    if (!studentId || !password) {
      return res
        .status(400)
        .json({ error: "studentId, password are required" });
    }

    const student = db.students.find((s) => s.studentId === studentId);
    if (!student) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await checkPassword(password, student.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    res.json({
      ok: true,
      student: { id: student.id, name: student.name, studentId: student.studentId }
    });
  } catch (err) {
    console.error("Student login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =================================
// F) AI QUESTION GENERATION ROUTE
// =================================

// multipart/form-data: fields + files
app.post(
  "/api/tests/generate-questions",
  upload.array("files", 10),
  async (req, res) => {
    try {
      const body = req.body || {};
      const subject = body.subject || "Subject";
      const testName = body.testName || "Untitled Test";
      const numMcq = parseInt(body.numMcq || "0", 10) || 0;
      const numShort = parseInt(body.numShort || "0", 10) || 0;
      const numDesc = parseInt(body.numDesc || "0", 10) || 0;
      const topicsText = body.topicsText || "";

      let links = [];
      try {
        links = JSON.parse(body.links || "[]");
        if (!Array.isArray(links)) links = [];
      } catch {
        links = [];
      }

      const files = req.files || [];

      const questions = await generateQuestionsWithGemini({
        subject,
        testName,
        numMcq,
        numShort,
        numDesc,
        topicsText,
        links,
        files
      });

      res.json({ ok: true, questions });
    } catch (err) {
      console.error("Error in generate-questions:", err);
      res.status(500).json({ error: "Failed to generate questions" });
    }
  }
);

// ================================
// G) CREATE / UPDATE TEST
// ================================
app.post("/api/tests", (req, res) => {
  try {
    const {
      teacherId,
      date,
      subject,
      name,
      showAnswers = true,
      questions
    } = req.body || {};

    if (!teacherId || !date || !subject || !name || !Array.isArray(questions)) {
      return res
        .status(400)
        .json({ error: "teacherId, date, subject, name, questions[] required" });
    }

    const key = buildTestKey(date, subject, name);
    const existingIndex = db.tests.findIndex((t) => t.key === key);

    const qWithIds = questions.map((q, idx) => ({
      id: q.id || `Q${String(idx + 1).padStart(2, "0")}`,
      type: q.type,
      prompt: q.prompt,
      options: q.options || null,
      correctAnswer: q.correctAnswer || "",
      maxScore:
        q.maxScore || (q.type === "mcq" ? 1 : q.type === "short" ? 2 : 4)
    }));

    if (existingIndex !== -1) {
      const existing = db.tests[existingIndex];
      db.tests[existingIndex] = {
        ...existing,
        date,
        subject,
        name,
        showAnswers,
        questions: qWithIds
      };
      return res.json({ ok: true, test: db.tests[existingIndex], replaced: true });
    } else {
      const test = {
        id: makeId("TEST_"),
        key,
        date,
        subject,
        name,
        showAnswers,
        createdById: teacherId,
        questions: qWithIds,
        submissions: []
      };
      db.tests.push(test);
      return res.json({ ok: true, test, replaced: false });
    }
  } catch (err) {
    console.error("Error create/update test:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================================
// H) LIST / GET TESTS
// ================================
app.get("/api/tests", (req, res) => {
  try {
    const list = db.tests.map((t) => ({
      id: t.id,
      date: t.date,
      subject: t.subject,
      name: t.name,
      showAnswers: t.showAnswers,
      questionsCount: t.questions.length,
      submissionsCount: t.submissions.length
    }));
    res.json({ ok: true, tests: list });
  } catch (err) {
    console.error("Error listing tests:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/tests/:id", (req, res) => {
  const id = req.params.id;
  const test = db.tests.find((t) => t.id === id);
  if (!test) return res.status(404).json({ error: "Test not found" });

  res.json({
    ok: true,
    test: {
      id: test.id,
      date: test.date,
      subject: test.subject,
      name: test.name,
      showAnswers: test.showAnswers,
      questions: test.questions
    }
  });
});

// ================================
// I) SUBMISSIONS & SCORING
// ================================
function scoreResponses(test, responses) {
  let totalScore = 0;
  let maxScore = 0;
  const scored = [];

  for (const q of test.questions) {
    const r = responses.find((x) => x.questionId === q.id) || {};
    const rawAnswer = (r.answer || "").trim();
    let score = 0;
    let isCorrect = false;

    maxScore += q.maxScore;

    if (q.type === "mcq") {
      if (rawAnswer && rawAnswer === q.correctAnswer) {
        score = q.maxScore;
        isCorrect = true;
      }
    } else if (q.type === "short") {
      if (!rawAnswer) {
        score = 0;
      } else if (!q.correctAnswer) {
        score = Math.round(q.maxScore / 2);
      } else {
        const expected = q.correctAnswer.toLowerCase();
        const overlap = rawAnswer
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => expected.includes(w)).length;
        if (overlap >= 2) {
          score = q.maxScore;
          isCorrect = true;
        } else if (overlap >= 1) {
          score = Math.round(q.maxScore * 0.6);
        } else {
          score = Math.round(q.maxScore * 0.3);
        }
      }
    } else {
      if (!rawAnswer) {
        score = 0;
      } else {
        score = Math.round(q.maxScore * 0.7);
      }
    }

    totalScore += score;
    scored.push({
      questionId: q.id,
      type: q.type,
      answer: rawAnswer,
      score,
      isCorrect
    });
  }

  return { totalScore, maxScore, scored };
}

app.post("/api/tests/:id/submit", (req, res) => {
  try {
    const id = req.params.id;
    const { studentId, studentName, responses } = req.body || {};
    if (!studentId || !studentName || !Array.isArray(responses)) {
      return res
        .status(400)
        .json({ error: "studentId, studentName, responses[] required" });
    }

    const test = db.tests.find((t) => t.id === id);
    if (!test) return res.status(404).json({ error: "Test not found" });

    const { totalScore, maxScore, scored } = scoreResponses(test, responses);
    const submission = {
      id: makeId("SUB_"),
      studentId,
      studentName,
      totalScore,
      maxScore,
      submittedAt: new Date().toISOString(),
      responses: scored
    };

    test.submissions.push(submission);

    res.json({
      ok: true,
      submission,
      showAnswers: test.showAnswers
    });
  } catch (err) {
    console.error("Error submitting test:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================================
// J) CSV EXPORT
// ================================
app.get("/api/tests/:id/csv", (req, res) => {
  try {
    const id = req.params.id;
    const test = db.tests.find((t) => t.id === id);
    if (!test) return res.status(404).json({ error: "Test not found" });

    const submissions = test.submissions || [];
    if (!submissions.length) {
      return res.status(400).json({ error: "No submissions for this test" });
    }

    const qIds = test.questions.map((q) => q.id);
    const headers = [
      "StudentName",
      "StudentID",
      "SubmittedAt",
      ...qIds.map((qId) => `${qId}_Score`),
      "TotalScore",
      "MaxScore"
    ];

    const rows = [headers];

    submissions.forEach((s) => {
      const scoresByQ = {};
      (s.responses || []).forEach((r) => {
        scoresByQ[r.questionId] = r.score;
      });

      const row = [
        s.studentName,
        s.studentId,
        s.submittedAt,
        ...qIds.map((qId) =>
          scoresByQ[qId] === undefined ? "" : String(scoresByQ[qId])
        ),
        String(s.totalScore),
        String(s.maxScore)
      ];
      rows.push(row);
    });

    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell ?? "");
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(",")
      )
      .join("\n");

    res.header("Content-Type", "text/csv");
    res.attachment(
      `${test.date}_${test.subject}_${test.name.replace(/[^\w\-]+/g, "_")}.csv`
    );
    res.send(csv);
  } catch (err) {
    console.error("Error generating CSV:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================================
// K) ROOT & SERVER START
// ================================
app.get("/", (req, res) => {
  res.send(
    "AI Assessment Studio backend is running. Open http://localhost:" +
      PORT +
      " in your browser to see the frontend."
  );
});

app.listen(PORT, () => {
  console.log("✅ Server listening on http://localhost:" + PORT);
});
