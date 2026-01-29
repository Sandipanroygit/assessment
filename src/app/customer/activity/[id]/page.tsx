"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { fetchCurriculumModuleById, uploadFileToBucket } from "@/lib/supabaseData";
import type { CurriculumModule } from "@/types";
import logo from "../../../../../image/logo.jpg";

const formatSubject = (subject: string) => (subject.toLowerCase() === "maths" ? "Mathematics" : subject);
const progressStorageKey = "activityProgress";
const submissionsBucket = "curriculum-assets";
const submissionPathPrefix = "activity-submissions";
const submissionHistoryKey = "activitySubmissionHistory";
const submissionHideKey = "activitySubmissionHide";

type UploadMeta = { name: string; size: number; type: string };
type ActivityProgressEntry = {
  completed?: boolean;
  score?: number;
  total?: number;
  completedAt?: string;
  uploads?: {
    logFile?: UploadMeta;
    plotFile?: UploadMeta;
    uploadedAt?: string;
  };
};
type ReportOverlayPoint = { x: number; y: number };
type PlotPoint = { x: number; y: number };
type AiReport = {
  summary: string;
  objectiveAlignment: string;
  trendAssessment: string;
  accuracyPercent: number | null;
  possibleErrors: string[];
  improvementTips: string[];
  logInsights: string[] | string;
  overlay?: { note: string; points: ReportOverlayPoint[] };
};

type SubmissionRow = {
  id: string;
  submission_number?: number | null;
  log_url?: string | null;
  log_name?: string | null;
  plot_url?: string | null;
  plot_name?: string | null;
  plot_type?: string | null;
  report_json?: AiReport | null;
  report_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ActivitySubmission = {
  id: string;
  submissionNumber: number;
  logUrl: string;
  logName: string;
  plotUrl: string;
  plotName: string;
  plotType?: string | null;
  report: AiReport | null;
  reportStatus: string | null;
  createdAt: string;
};

const buildFileMeta = (file: File): UploadMeta => ({ name: file.name, size: file.size, type: file.type });
const ensureProfile = async (user: User) => {
  const { data: existing, error: fetchError } = await supabase
    .from("profiles")
    .select("full_name, role, grade")
    .eq("id", user.id)
    .maybeSingle();
  if (!fetchError && existing) return existing as { full_name?: string; role?: string; grade?: string };
  if (fetchError) {
    console.warn("Profile fetch error", fetchError.message);
  }
  const payload: Record<string, string> = {
    id: user.id,
    full_name: (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "Student",
    role: (user.user_metadata?.role as string | undefined) ?? "customer",
  };
  const grade = user.user_metadata?.grade as string | undefined;
  if (grade) payload.grade = grade;
  const { data: inserted, error: insertError } = await supabase
    .from("profiles")
    .insert(payload)
    .select("full_name, role, grade")
    .single();
  if (insertError) {
    console.warn("Profile insert failed", insertError.message);
    return existing ?? null;
  }
  return inserted as { full_name?: string; role?: string; grade?: string };
};
const normalizeStringList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string");
  }
  if (typeof value === "string" && value.trim()) {
    return [value];
  }
  return [];
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err ?? "Unknown error");
  }
};

const sanitizeSegment = (value: string) =>
  value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "item";

const buildReportHtml = ({
  logoSrc,
  activityTitle,
  activityDescription,
  accuracyOverride,
  subject,
  grade,
  studentName,
  submissionTime,
  logFileName,
  plotFileName,
  report,
}: {
  logoSrc: string | null;
  activityTitle: string;
  activityDescription: string;
  accuracyOverride?: number;
  subject: string;
  grade: string;
  studentName: string;
  submissionTime: string;
  logFileName: string;
  plotFileName: string;
  report: AiReport;
}) => {
  const detailsRows = [
    ["Activity", activityTitle],
    ["Subject", subject || "-"],
    ["Grade", grade || "-"],
    ["Student", studentName || "-"],
    ["Submission time", submissionTime || "-"],
    ["Log file", logFileName || "-"],
    ["Plot file", plotFileName || "-"],
  ];
  const rawAccuracy = typeof accuracyOverride === "number" ? accuracyOverride : report.accuracyPercent;
  const accuracyValue = typeof rawAccuracy === "number" && Number.isFinite(rawAccuracy) ? Math.round(rawAccuracy) : null;
  const metricRows = [
    ["Accuracy", accuracyValue === null ? "Not enough data" : `${accuracyValue}%`],
    ["Objective alignment", report.objectiveAlignment || "-"],
    ["Trend assessment", report.trendAssessment || "-"],
  ];
  const listToHtml = (items: string[]) =>
    items.length ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : "<li>-</li>";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>AerohawX Activity Report</title>
    <style>
      body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; }
      .header { display: block; margin-bottom: 10px; }
      .logo { width: 140px; height: 60px; object-fit: contain; }
      h1 { font-size: 20px; margin: 10px 0 6px 0; color: #0f4c81; }
      .subtitle { color: #475569; font-size: 12px; margin-top: 2px; }
      .section { margin-bottom: 18px; }
      .objective-text { margin: 0 0 18px 0; font-size: 12px; color: #334155; }
      .section-title { font-weight: bold; font-size: 12px; margin-bottom: 6px; color: #0f4c81; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      td, th { border: 1px solid #e2e8f0; padding: 6px; vertical-align: top; }
      th { background: #e0f2fe; text-align: left; color: #0f4c81; }
      .accent-bar { height: 6px; width: 100%; background: linear-gradient(90deg, #0ea5e9, #38bdf8); margin: 6px 0 14px 0; }
      .label { font-weight: bold; color: #334155; width: 180px; }
      .muted { color: #64748b; }
      ul { margin: 0; padding-left: 18px; }
    </style>
  </head>
  <body>
    <div class="header">
      ${logoSrc ? `<img class="logo" src="${logoSrc}" alt="AerohawX logo" />` : ""}
    </div>
    <div class="accent-bar"></div>
    <h1>Activity Objective</h1>
    <div class="objective-text">${escapeHtml(activityDescription || activityTitle)}</div>

    <div class="section">
      <div class="section-title">Submission details</div>
      <table>
        <tbody>
          ${detailsRows
            .map(
              (row) =>
                `<tr><td class="label">${escapeHtml(row[0])}</td><td class="muted">${escapeHtml(row[1])}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Summary</div>
      <div class="muted">${escapeHtml(report.summary || "-")}</div>
    </div>

    <div class="section">
      <div class="section-title">Key metrics</div>
      <table>
        <tbody>
          ${metricRows
            .map(
              (row) =>
                `<tr><td class="label">${escapeHtml(row[0])}</td><td class="muted">${escapeHtml(row[1])}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Possible errors</div>
      <ul>${listToHtml(normalizeStringList(report.possibleErrors))}</ul>
    </div>

    <div class="section">
      <div class="section-title">Suggestions</div>
      <ul>${listToHtml(normalizeStringList(report.improvementTips))}</ul>
    </div>

    <div class="section">
      <div class="section-title">Log insights</div>
      <ul>${listToHtml(normalizeStringList(report.logInsights))}</ul>
    </div>

    ${report.overlay?.note ? `<div class="section"><div class="section-title">ISA note</div><div class="muted">${escapeHtml(report.overlay.note)}</div></div>` : ""}
  </body>
</html>`;
};

const mapSubmissionRow = (row: SubmissionRow, idx: number): ActivitySubmission => ({
  id: row.id,
  submissionNumber: row.submission_number ?? idx + 1,
  logUrl: row.log_url ?? "",
  logName: row.log_name ?? "",
  plotUrl: row.plot_url ?? "",
  plotName: row.plot_name ?? "",
  plotType: row.plot_type ?? null,
  report: typeof row.report_json === "object" && row.report_json !== null ? (row.report_json as AiReport) : null,
  reportStatus: row.report_status ?? null,
  createdAt: row.created_at ?? row.updated_at ?? new Date().toISOString(),
});

const extractStoragePath = (url: string) => {
  const marker = "/storage/v1/object/public/";
  try {
    const parsed = new URL(url);
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;
    return parsed.pathname.slice(idx + marker.length);
  } catch {
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.slice(idx + marker.length);
  }
};

const bucketPathsFromUrls = (urls: string[]) => {
  const byBucket: Record<string, string[]> = {};
  urls.forEach((url) => {
    const path = extractStoragePath(url);
    if (!path) return;
    const [bucket, ...rest] = path.split("/");
    if (!bucket || rest.length === 0) return;
    byBucket[bucket] = [...(byBucket[bucket] ?? []), rest.join("/")];
  });
  return byBucket;
};

const readLocalSubmissionHistory = (moduleId: string): ActivitySubmission[] => {
  try {
    const stored = localStorage.getItem(submissionHistoryKey);
    const parsed = stored ? JSON.parse(stored) : {};
    const entries = Array.isArray(parsed[moduleId]) ? (parsed[moduleId] as ActivitySubmission[]) : [];
    return entries.map((entry, idx) => ({
      ...entry,
      id: entry.id || `local-${moduleId}-${idx + 1}`,
      submissionNumber: entry.submissionNumber ?? idx + 1,
      createdAt: entry.createdAt ?? new Date().toISOString(),
    }));
  } catch {
    return [];
  }
};

const writeLocalSubmissionHistory = (moduleId: string, submissions: ActivitySubmission[]) => {
  try {
    const stored = localStorage.getItem(submissionHistoryKey);
    const parsed = stored ? JSON.parse(stored) : {};
    parsed[moduleId] = submissions.map((entry, idx) => ({
      ...entry,
      id: entry.id || `local-${moduleId}-${idx + 1}`,
      submissionNumber: entry.submissionNumber ?? idx + 1,
      createdAt: entry.createdAt ?? new Date().toISOString(),
    }));
    localStorage.setItem(submissionHistoryKey, JSON.stringify(parsed));
  } catch {
    // ignore storage failures
  }
};

const readHiddenSubmissions = (moduleId: string): string[] => {
  try {
    const stored = localStorage.getItem(submissionHideKey);
    const parsed = stored ? JSON.parse(stored) : {};
    return Array.isArray(parsed[moduleId]) ? (parsed[moduleId] as string[]) : [];
  } catch {
    return [];
  }
};

const writeHiddenSubmissions = (moduleId: string, ids: string[]) => {
  try {
    const stored = localStorage.getItem(submissionHideKey);
    const parsed = stored ? JSON.parse(stored) : {};
    parsed[moduleId] = Array.from(new Set(ids));
    localStorage.setItem(submissionHideKey, JSON.stringify(parsed));
  } catch {
    // ignore storage failures
  }
};

const triggerDownload = (url: string, fileName: string) => {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

export default function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [module, setModule] = useState<CurriculumModule | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [codeDisplay, setCodeDisplay] = useState("Loading code...");
  const [userId, setUserId] = useState<string | null>(null);
  const [quizStatus, setQuizStatus] = useState<string | null>(null);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<
    Array<{ question: string; options: Array<{ label: string; text: string }>; answer: string; explanation?: string }>
  >([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [quizComplete, setQuizComplete] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [logFile, setLogFile] = useState<File | null>(null);
  const [plotFile, setPlotFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [savingUploads, setSavingUploads] = useState(false);
  const [storedUploads, setStoredUploads] = useState<ActivityProgressEntry["uploads"] | null>(null);
  const [, setMarkedDone] = useState(false);
  const [submissions, setSubmissions] = useState<ActivitySubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [codeExpanded, setCodeExpanded] = useState(false);
  const [sopExpanded, setSopExpanded] = useState(false);
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [, setReportLoading] = useState(false);
  const [report, setReport] = useState<AiReport | null>(null);
  const [logPlotPoints, setLogPlotPoints] = useState<PlotPoint[]>([]);
  const [studentName, setStudentName] = useState("Student");
  const [pdfLogoSrc, setPdfLogoSrc] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sopUploading, setSopUploading] = useState(false);

  const applyQuizQuestions = (
    questions: Array<{
      question: string;
      options: Array<{ label: string; text: string }>;
      answer: string;
      explanation?: string;
    }>,
  ) => {
    if (!questions.length) return false;
    setQuizQuestions(questions);
    setCurrentQuestion(0);
    setSelections({});
    setQuizComplete(false);
    setTimeLeft(300);
    setQuizStatus(null);
    return true;
  };

  const computeAccuracy = (points: PlotPoint[]) => {
    if (points.length < 2) return null;
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    const spanX = end.x - start.x;
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    const spanY = maxY - minY;
    if (!Number.isFinite(spanX) || !Number.isFinite(spanY) || spanX === 0 || spanY === 0) {
      return null;
    }
    const slope = (end.y - start.y) / spanX;
    const expectedAt = (x: number) => start.y + slope * (x - start.x);
    const avgError = points.reduce((acc, point) => acc + Math.abs(point.y - expectedAt(point.x)), 0) / points.length;
    const normalized = avgError / spanY;
    return clamp(100 - normalized * 100, 0, 100);
  };

  const computedAccuracy = useMemo(() => computeAccuracy(logPlotPoints), [logPlotPoints]);

  const nextSubmissionNumber = useMemo(
    () => (submissions[submissions.length - 1]?.submissionNumber ?? 0) + 1,
    [submissions],
  );

  const generateQuiz = async () => {
    if (!module) return;
    setGeneratingQuiz(true);
    setQuizStatus("Loading questions from this activity...");

    const loadFromQuestionBank = async () => {
      const gradeSegment = sanitizeSegment(module.grade);
      const moduleSegments = Array.from(
        new Set([sanitizeSegment(module.module || module.title), sanitizeSegment(module.title), sanitizeSegment(module.module || "")].filter(Boolean)),
      );
      const bucket = supabase.storage.from("curriculum-assets");
      for (const moduleSegment of moduleSegments) {
        const prefix = `question-banks/${gradeSegment}/${moduleSegment}`;
        const { data: listed, error } = await bucket.list(prefix, {
          limit: 100,
          offset: 0,
          sortBy: { column: "name", order: "desc" },
        });
        if (error || !listed?.length) continue;
        const candidates = listed
          .filter((item) => item.name.toLowerCase().endsWith(".json"))
          .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "") || b.name.localeCompare(a.name));
        if (!candidates.length) continue;

        const filePath = `${prefix}/${candidates[0].name}`;
        const { data: urlData } = bucket.getPublicUrl(filePath);
        const res = await fetch(urlData.publicUrl);
        if (!res.ok) continue;
        const payload = await res.text();
        const parsed = parseQuestionBankPayload(payload);
        if (parsed.length) return parsed;
      }
      return [] as typeof quizQuestions;
    };

    const generateAiQuiz = async () => {
      setQuizStatus("Generating fresh questions for this activity...");
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message:
              `Create 5 multiple-choice questions (A-D) with answers and short explanations for "${module.title}". `
              + "Return in the format: Q1. question\\nA) option\\nB) option\\nC) option\\nD) option\\nAnswer: A\\nExplanation: ...",
            context: {
              title: module.title,
              subject: module.subject,
              grade: module.grade,
              description: module.description,
              code: codeDisplay,
            },
          }),
        });
        if (!res.ok) {
          setQuizStatus("AI service unavailable. Please try again shortly.");
          return [] as typeof quizQuestions;
        }
        const data = (await res.json()) as { reply?: string; fallback?: boolean; detail?: string };
        const reply = (data?.reply || "").trim();

        if (data?.fallback) {
          setQuizStatus(data.detail || reply || "AI service unavailable.");
          return [] as typeof quizQuestions;
        }

        if (!reply) {
          setQuizStatus("No quiz returned by AI. Please retry.");
          return [] as typeof quizQuestions;
        }

        const parsed = parseQuiz(reply);
        if (!parsed.length) {
          setQuizStatus("AI replied but no valid MCQs were parsed.");
          return [] as typeof quizQuestions;
        }
        return parsed;
      } catch (err) {
        console.error("AI quiz generation failed", err);
        setQuizStatus(getErrorMessage(err));
        return [] as typeof quizQuestions;
      }
    };

    try {
      const bankQuestions = await loadFromQuestionBank();
      if (applyQuizQuestions(bankQuestions)) return;

      const aiQuestions = await generateAiQuiz();
      if (applyQuizQuestions(aiQuestions)) return;

      setQuizStatus((prev) => prev ?? "Unable to generate quiz right now. Please try again in a bit.");
    } catch (err) {
      console.error("Quiz generation failed", err);
      setQuizStatus(getErrorMessage(err));
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const parseQuiz = (text: string) => {
    const blocks = text.split(/Q\d+\./i).filter(Boolean);
    const questions: Array<{
      question: string;
      options: Array<{ label: string; text: string }>;
      answer: string;
      explanation?: string;
    }> = [];
    const answerRegex = /Answer:\s*([A-D])/i;
    blocks.forEach((block) => {
      const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) return;
      const question = lines[0];
      const opts = lines
        .slice(1)
        .filter((l) => /^[A-D][).]/i.test(l))
        .map((l) => {
          const label = l.slice(0, 1).toUpperCase();
          const text = l.replace(/^[A-D][).]\s*/, "");
          return { label, text };
        })
        .slice(0, 4);
      const answerLine = lines.find((l) => answerRegex.test(l));
      const answerMatch = answerLine ? answerLine.match(answerRegex) : null;
      const answer = answerMatch ? answerMatch[1].toUpperCase() : "";
      const explanationLine = lines.find((l) => /^Explanation:/i.test(l));
      const explanation = explanationLine ? explanationLine.replace(/^Explanation:\s*/i, "").trim() : "";
      if (question && opts.length === 4 && answer) {
        questions.push({ question, options: opts, answer, explanation: explanation || undefined });
      }
    });
    return questions.slice(0, 5);
  };

  const parseQuestionBankPayload = (raw: string) => {
    const safeOptions = (options: unknown): Array<{ label: string; text: string }> => {
      if (Array.isArray(options)) {
        return options
          .slice(0, 4)
          .map((opt, idx) => {
            if (typeof opt === "string") return { label: "ABCD".charAt(idx), text: opt };
            if (opt && typeof opt === "object" && "text" in opt) {
              const label = typeof (opt as { label?: string }).label === "string" ? (opt as { label: string }).label : "ABCD".charAt(idx);
              const text = String((opt as { text?: unknown }).text ?? "");
              return { label: label.toUpperCase(), text };
            }
            return null;
          })
          .filter(Boolean) as Array<{ label: string; text: string }>;
      }
      return [];
    };

    const normalizeArray = (items: unknown[]): Array<{ question: string; options: Array<{ label: string; text: string }>; answer: string; explanation?: string }> => {
      return items
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const q = (item as { q?: string; question?: string }).question || (item as { q?: string }).q || "";
          const opts = safeOptions((item as { options?: unknown }).options);
          const ans = ((item as { answer?: string }).answer || "").trim().toUpperCase();
          const explanation =
            typeof (item as { explanation?: string }).explanation === "string"
              ? (item as { explanation?: string }).explanation
              : undefined;
          if (!q || opts.length !== 4 || !ans) return null;
          return { question: q, options: opts, answer: ans.charAt(0), explanation };
        })
        .filter(Boolean) as Array<{ question: string; options: Array<{ label: string; text: string }>; answer: string; explanation?: string }>;
    };

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return normalizeArray(parsed).slice(0, 5);
      }
      if (parsed && typeof parsed === "object") {
        const questionsField = (parsed as { questions?: unknown }).questions;
        if (typeof questionsField === "string") {
          try {
            const nested = JSON.parse(questionsField);
            if (Array.isArray(nested)) return normalizeArray(nested).slice(0, 5);
          } catch {
            // fall through to parse as text
            const viaText = parseQuiz(questionsField);
            if (viaText.length) return viaText;
          }
        }
        if (Array.isArray(questionsField)) return normalizeArray(questionsField).slice(0, 5);
      }
    } catch {
      // not JSON, try text parsing
    }
    const fallback = parseQuiz(raw);
    return fallback;
  };

  useEffect(() => {
    if (quizComplete || quizQuestions.length === 0) return;
    setTimeLeft(300);
    const id = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          setQuizComplete(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [quizQuestions.length, quizComplete]);

  const answeredCount = useMemo(() => Object.keys(selections).length, [selections]);
  const score = useMemo(() => {
    if (!quizComplete) return null;
    return quizQuestions.reduce((acc, q, idx) => (selections[idx] === q.answer ? acc + 1 : acc), 0);
  }, [quizComplete, quizQuestions, selections]);

  useEffect(() => {
    if (!module || !quizComplete || score === null || quizQuestions.length === 0) return;
    try {
      const stored = localStorage.getItem(progressStorageKey);
      const parsed = stored ? JSON.parse(stored) : {};
      const previous = parsed[String(module.id)] ?? {};
      parsed[String(module.id)] = {
        ...previous,
        completed: true,
        score,
        total: quizQuestions.length,
        completedAt: new Date().toISOString(),
      };
      localStorage.setItem(progressStorageKey, JSON.stringify(parsed));
      setMarkedDone(true);
    } catch {
      // ignore storage errors
    }
  }, [module, quizComplete, score, quizQuestions.length]);

  const decodeDataUrl = useCallback((url?: string) => {
    if (!url || !url.startsWith("data:")) return null;
    const commaIndex = url.indexOf(",");
    if (commaIndex === -1) return null;
    try {
      const base64 = url.slice(commaIndex + 1);
      return atob(base64);
    } catch {
      return null;
    }
  }, []);

  const parseLogPoints = useCallback((text: string, codeText: string, plotType: string) => {
    const points: PlotPoint[] = [];
    const lines = text.split(/\r?\n/);
    const normalizedPlotType = plotType.toLowerCase();
    const normalizedCode = codeText.toLowerCase();
    const findAxisLabels = () => {
      if (normalizedPlotType.includes("vs")) {
        const parts = normalizedPlotType.split("vs").map((part) => part.trim());
        if (parts.length >= 2) {
          return { x: parts[1], y: parts[0] };
        }
      }
      if (normalizedCode.includes("pressure") && (normalizedCode.includes("height") || normalizedCode.includes("altitude"))) {
        return { x: normalizedCode.includes("altitude") ? "altitude" : "height", y: "pressure" };
      }
      if (normalizedCode.includes("time") && normalizedCode.includes("pressure")) {
        return { x: "time", y: "pressure" };
      }
      if (normalizedCode.includes("time") && normalizedCode.includes("temperature")) {
        return { x: "time", y: "temperature" };
      }
      return null;
    };
    const axisLabels = findAxisLabels();
    const headerLine = lines.find((line) => {
      const trimmed = line.trim();
      return trimmed && /[a-zA-Z]/.test(trimmed) && !/^-?\d/.test(trimmed);
    });
    let headerColumns: string[] | null = null;
    if (headerLine) {
      const raw = headerLine.replace(/[#;]/g, " ").trim();
      const split =
        raw.includes(",") ? raw.split(",") : raw.includes("\t") ? raw.split("\t") : raw.split(/\s+/);
      headerColumns = split.map((col) => col.trim().toLowerCase()).filter(Boolean);
    }
    const findColumnIndex = (label: string) => {
      if (!headerColumns) return -1;
      return headerColumns.findIndex((col) => col.includes(label));
    };
    const xIndex = axisLabels?.x ? findColumnIndex(axisLabels.x) : -1;
    const yIndex = axisLabels?.y ? findColumnIndex(axisLabels.y) : -1;
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      if (trimmed.includes("=")) {
        const pairs = trimmed.split(/[,\s]+/);
        const map: Record<string, number> = {};
        pairs.forEach((pair) => {
          const [key, value] = pair.split("=");
          if (!key || value === undefined) return;
          const parsed = Number.parseFloat(value);
          if (Number.isFinite(parsed)) {
            map[key.trim().toLowerCase()] = parsed;
          }
        });
        if (axisLabels?.x && axisLabels?.y && map[axisLabels.x] !== undefined && map[axisLabels.y] !== undefined) {
          points.push({ x: map[axisLabels.x], y: map[axisLabels.y] });
        }
        return;
      }
      const cols = trimmed.includes(",")
        ? trimmed.split(",")
        : trimmed.includes("\t")
          ? trimmed.split("\t")
          : trimmed.split(/\s+/);
      if (xIndex >= 0 && yIndex >= 0 && cols[xIndex] !== undefined && cols[yIndex] !== undefined) {
        const x = Number.parseFloat(cols[xIndex]);
        const y = Number.parseFloat(cols[yIndex]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          points.push({ x, y });
        }
        return;
      }
      const values = cols.map((value) => Number.parseFloat(value)).filter((value) => Number.isFinite(value));
      if (values.length < 2) return;
      points.push({ x: values[0], y: values[1] });
    });
    return points;
  }, []);

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    let cancelled = false;
    const load = async () => {
      try {
        setStatus("Loading activity...");
        const row = await fetchCurriculumModuleById(id);
        if (cancelled) return;
        if (!row) {
          setStatus("Activity not found.");
          return;
        }
        setModule(row);
        setStatus(null);
      } catch {
        if (cancelled) return;
        setStatus("Unable to load this activity.");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [authChecked, isAuthenticated, id]);

  useEffect(() => {
    if (!module) return;
    const local = readLocalSubmissionHistory(module.id);
    if (local.length) {
      setSubmissions(local);
      setSelectedSubmissionId(local[local.length - 1].id);
      setMarkedDone(true);
      setStoredUploads({
        logFile: local[local.length - 1].logName ? { name: local[local.length - 1].logName, size: 0, type: "" } : undefined,
        plotFile: local[local.length - 1].plotName ? { name: local[local.length - 1].plotName, size: 0, type: "" } : undefined,
        uploadedAt: local[local.length - 1].createdAt,
      });
    }
  }, [module]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        if (!user) {
          setIsAuthenticated(false);
          setAuthChecked(true);
          setStatus("Redirecting to login...");
          router.replace("/login");
          return;
        }
        setIsAuthenticated(true);
        setAuthChecked(true);
        setUserId(user.id);
        const profile = await ensureProfile(user);
        setStudentName(profile?.full_name ?? user.user_metadata.full_name ?? user.email ?? "Student");
      } catch {
        setIsAuthenticated(false);
        setAuthChecked(true);
        setUserId(null);
        setStatus("Redirecting to login...");
        router.replace("/login");
      }
    };
    loadProfile();
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const loadLogo = async () => {
      const logoSrc = typeof logo === "string" ? logo : logo.src;
      try {
        const res = await fetch(logoSrc);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onload = () => {
          if (cancelled) return;
          if (typeof reader.result === "string") {
            setPdfLogoSrc(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      } catch {
        if (!cancelled) setPdfLogoSrc(null);
      }
    };
    loadLogo();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadCode = async () => {
      if (!module) {
        setCodeDisplay("Loading code...");
        return;
      }
      if (module.codeSnippet) {
        setCodeDisplay(module.codeSnippet);
        return;
      }
      const codeAsset = module.assets.find((a) => a.type === "code");
      if (codeAsset?.url) {
        const decoded = decodeDataUrl(codeAsset.url);
        if (decoded) {
          setCodeDisplay(decoded);
          return;
        }
        const canFetch =
          codeAsset.url.startsWith("http://") ||
          codeAsset.url.startsWith("https://") ||
          codeAsset.url.startsWith("data:") ||
          codeAsset.url.startsWith("blob:");
        if (canFetch) {
          try {
            const res = await fetch(codeAsset.url);
            const txt = await res.text();
            setCodeDisplay(txt || "Code file is empty.");
            return;
          } catch {
            setCodeDisplay("Unable to load code file.");
            return;
          }
        }
        setCodeDisplay(codeAsset.label || "Code file available.");
        return;
      }
      setCodeDisplay("No code snippet available.");
    };
    loadCode();
  }, [module, decodeDataUrl]);

  const loadSubmissions = useCallback(async () => {
    if (!module) return;
    setSubmissionsLoading(true);
    try {
      let mapped: ActivitySubmission[] = [];
      if (userId) {
        const { data, error } = await supabase
          .from("activity_submissions")
          .select(
            "id,submission_number,log_url,log_name,plot_url,plot_name,plot_type,report_json,report_status,created_at,updated_at",
          )
          .eq("module_id", module.id)
          .eq("user_id", userId)
          .order("submission_number", { ascending: true })
          .order("created_at", { ascending: true });
        if (error) throw error;
        mapped = (data ?? []).map((row, idx) => mapSubmissionRow(row as SubmissionRow, idx));
        if (mapped.length) {
          writeLocalSubmissionHistory(module.id, mapped);
        }
      }
      if (!mapped.length) {
        mapped = readLocalSubmissionHistory(module.id);
      }
      const hidden = readHiddenSubmissions(module.id);
      if (hidden.length) {
        mapped = mapped.filter((item) => !hidden.includes(item.id));
      }
      setSubmissions(mapped);
      if (mapped.length) {
        const latest = mapped[mapped.length - 1];
        setSelectedSubmissionId(latest.id);
        setMarkedDone(true);
      }
    } catch {
      const fallback = readLocalSubmissionHistory(module.id);
      setSubmissions(fallback);
    } finally {
      setSubmissionsLoading(false);
    }
  }, [module, userId]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  const openCodeInEditor = async () => {
    if (!module) return;
    const ensurePyExtension = (name: string) => (name.toLowerCase().endsWith(".py") ? name : `${name}.py`);
    const fallbackName = ensurePyExtension(module.title.replace(/\s+/g, "-").toLowerCase() || "code");
    const nav = navigator as Navigator & { msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => boolean };
    const launchBlob = (blob: Blob, fileName: string) => {
      if (nav?.msSaveOrOpenBlob) {
        nav.msSaveOrOpenBlob(blob, fileName);
        return;
      }
      const url = URL.createObjectURL(blob);
      triggerDownload(url, fileName);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    };

    if (module.codeSnippet) {
      launchBlob(new Blob([module.codeSnippet], { type: "text/x-python" }), fallbackName);
      return;
    }

    const codeAsset = module.assets.find((a) => a.type === "code");
    if (codeAsset?.url) {
      const fileName = ensurePyExtension(codeAsset.label || fallbackName);
      try {
        const res = await fetch(codeAsset.url);
        if (!res.ok) throw new Error("Failed to fetch code file.");
        const blob = await res.blob();
        launchBlob(blob, fileName);
      } catch (err) {
        console.warn("Unable to fetch code blob; downloading file directly.", err);
        triggerDownload(codeAsset.url, fileName);
      }
      return;
    }

    console.warn("No code file available to open in editor.");
  };

  const openDocInViewer = async () => {
    if (!module) return;
    const docAsset = module.assets.find((a) => a.type === "doc");
    if (docAsset?.url) {
      const nav = navigator as Navigator & { msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => boolean };
      const fileName = (docAsset.label || "document").trim() || "document";
      const triggerDownload = (url: string, name: string) => {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        anchor.rel = "noopener noreferrer";
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      };
      try {
        const res = await fetch(docAsset.url);
        if (!res.ok) throw new Error("Failed to fetch doc file.");
        const blob = await res.blob();
        if (nav?.msSaveOrOpenBlob) {
          nav.msSaveOrOpenBlob(blob, fileName);
          return;
        }
        const url = URL.createObjectURL(blob);
        triggerDownload(url, fileName);
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      } catch (err) {
        console.warn("Unable to fetch doc blob; downloading file directly.", err);
        triggerDownload(docAsset.url, fileName);
      }
    } else {
      console.warn("No SOP file available to open.");
    }
  };

  useEffect(() => {
    if (!module || submissions.length > 0) return;
    try {
      const stored = localStorage.getItem(progressStorageKey);
      const parsed = stored ? JSON.parse(stored) : {};
      const entry = parsed[String(module.id)] as ActivityProgressEntry | undefined;
      setStoredUploads(entry?.uploads ?? null);
      setMarkedDone(Boolean(entry?.completed));
    } catch {
      setStoredUploads(null);
      setMarkedDone(false);
    }
  }, [module, submissions.length]);

  useEffect(() => {
    const active = selectedSubmissionId
      ? submissions.find((submission) => submission.id === selectedSubmissionId) ?? submissions[submissions.length - 1]
      : submissions[submissions.length - 1];
    if (!active) {
      setStoredUploads(null);
      setReport(null);
      setReportStatus(null);
      setLogPlotPoints([]);
      return;
    }
    setStoredUploads({
      logFile: active.logName ? { name: active.logName, size: 0, type: "" } : undefined,
      plotFile: active.plotName ? { name: active.plotName, size: 0, type: "" } : undefined,
      uploadedAt: active.createdAt,
    });
    setReport(active.report ?? null);
    setReportStatus(
      active.report ? `Showing report from submission ${active.submissionNumber}.` : active.reportStatus ?? "Report pending.",
    );
    const loadLog = async () => {
      if (!active.logUrl) {
        setLogPlotPoints([]);
        return;
      }
      try {
        const res = await fetch(active.logUrl);
        const text = await res.text();
        const parsedPoints = parseLogPoints(text, codeDisplay, active.plotType || active.plotName || "");
        setLogPlotPoints(parsedPoints);
      } catch {
        setLogPlotPoints([]);
      }
    };
    loadLog();
  }, [selectedSubmissionId, submissions, parseLogPoints, codeDisplay]);

  const generateReport = useCallback(
    async (source: { log: File; plot: File }) => {
      if (!module) return null;
      let nextReport: AiReport | null = null;
      setReportLoading(true);
      setReportStatus("Generating AI report...");
      try {
        const logText = await source.log.text();
        const parsedPoints = parseLogPoints(logText, codeDisplay, source.plot.type || source.plot.name || "");
        const accuracyHint = computeAccuracy(parsedPoints);
        setLogPlotPoints(parsedPoints);
        const sopAsset = module.assets.find((a) => a.type === "doc");
        const res = await fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: module.title,
            subject: module.subject,
            grade: module.grade,
            description: module.description,
            codeText: codeDisplay,
            sopUrl: sopAsset?.url,
            logText,
            plotType: source.plot.type || source.plot.name,
            parsedPoints: parsedPoints.slice(0, 500),
            accuracyHint: typeof accuracyHint === "number" ? accuracyHint : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.report) {
          const detail = (data as { detail?: string; error?: string })?.detail ?? (data as { error?: string })?.error;
          throw new Error(detail || "AI report unavailable.");
        }
        nextReport = data.report as AiReport;
        setReport(nextReport);
        setReportStatus(
          data?.fallback
            ? (data as { detail?: string })?.detail
              ? `AI offline; showing heuristic analysis. Detail: ${(data as { detail?: string }).detail}`
              : "AI offline; showing heuristic analysis."
            : null,
        );
        setPdfStatus(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to generate AI report right now.";
        setReportStatus(message);
        if (!nextReport) {
          setReport(null);
        }
        nextReport = null;
      } finally {
        setReportLoading(false);
      }
      return nextReport;
    },
    [module, codeDisplay, parseLogPoints],
  );

  const downloadReportPdf = useCallback(async () => {
    if (!module || !report) return;
    setDownloadingPdf(true);
    setPdfStatus(null);
    try {
      const html = buildReportHtml({
        logoSrc: pdfLogoSrc,
        activityTitle: module.title,
        activityDescription: module.description,
        accuracyOverride: computedAccuracy ?? undefined,
        subject: module.subject,
        grade: module.grade,
        studentName,
        submissionTime: storedUploads?.uploadedAt ?? "Not recorded",
        logFileName: storedUploads?.logFile?.name ?? logFile?.name ?? "",
        plotFileName: storedUploads?.plotFile?.name ?? plotFile?.name ?? "",
        report,
      });
      const printWindow = window.open("", "_blank", "width=900,height=1200");
      if (!printWindow) {
        throw new Error("Unable to open print window.");
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    } catch {
      setPdfStatus("Unable to generate PDF right now.");
    } finally {
      setDownloadingPdf(false);
    }
  }, [module, report, pdfLogoSrc, studentName, storedUploads, logFile, plotFile, computedAccuracy]);

  const formatError = (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
      return (err as { message: string }).message;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err ?? "Unknown error");
    }
  };

  const deleteSubmission = async (submissionId: string) => {
    if (!userId) {
      setUploadStatus("Sign in to delete a submission.");
      return;
    }
    const submission = submissions.find((item) => item.id === submissionId);
    if (!submission) return;
    setSavingUploads(true);
    setUploadStatus("Deleting submission...");
    let serverDeleted = false;
    try {
      if (!submission.id.startsWith("local-")) {
        const attemptDelete = async (query: ReturnType<typeof supabase.from>) => {
          const { data, error } = await query.select("id");
          if (error) throw error;
          return (Array.isArray(data) ? data.length : 0) ?? 0;
        };

        let deleteQuery = supabase
          .from("activity_submissions")
          .delete()
          .eq("id", submissionId)
          .eq("user_id", userId);
        if (module?.id) {
          deleteQuery = deleteQuery.eq("module_id", module.id);
        }

        let deletedCount = await attemptDelete(deleteQuery);
        if (deletedCount === 0 && module?.id) {
          // Fallback without module filter in case the stored row lacks module_id
          deletedCount = await attemptDelete(
            supabase.from("activity_submissions").delete().eq("id", submissionId).eq("user_id", userId),
          );
        }

        if (deletedCount === 0) throw new Error("Delete blocked (no matching submission)");
        serverDeleted = true;
        const byBucket = bucketPathsFromUrls([submission.logUrl, submission.plotUrl]);
        await Promise.all(
          Object.entries(byBucket).map(async ([bucket, paths]) => {
            if (!paths.length) return;
            try {
              await supabase.storage.from(bucket).remove(paths);
            } catch {
              // Best effort delete; ignore storage errors
            }
          }),
        );
      }
      setSubmissions((prev) => {
        const remaining = prev.filter((item) => item.id !== submissionId);
        if (module) {
          writeLocalSubmissionHistory(module.id, remaining);
          writeHiddenSubmissions(module.id, readHiddenSubmissions(module.id).filter((id) => id !== submissionId));
        }
        const nextActive = remaining[remaining.length - 1] ?? null;
        setSelectedSubmissionId(nextActive?.id ?? null);
        setMarkedDone(Boolean(nextActive));
        if (!nextActive) {
          setReport(null);
          setReportStatus(null);
          setStoredUploads(null);
          setLogPlotPoints([]);
        } else {
          setStoredUploads({
            logFile: nextActive.logName ? { name: nextActive.logName, size: 0, type: "" } : undefined,
            plotFile: nextActive.plotName ? { name: nextActive.plotName, size: 0, type: "" } : undefined,
            uploadedAt: nextActive.createdAt,
          });
        }
        return remaining;
      });
      setUploadStatus(serverDeleted ? "Submission deleted." : "Removed locally; server delete failed.");
    } catch (err) {
      const message = formatError(err);
      // Hide locally so it doesn't reappear after refresh; surface message for transparency
      setSubmissions((prev) => {
        const remaining = prev.filter((item) => item.id !== submissionId);
        if (module) {
          const hidden = readHiddenSubmissions(module.id);
          writeHiddenSubmissions(module.id, [...hidden, submissionId]);
          writeLocalSubmissionHistory(module.id, remaining);
        }
        const nextActive = remaining[remaining.length - 1] ?? null;
        setSelectedSubmissionId(nextActive?.id ?? null);
        setMarkedDone(Boolean(nextActive));
        if (!nextActive) {
          setReport(null);
          setReportStatus(null);
          setStoredUploads(null);
          setLogPlotPoints([]);
        } else {
          setStoredUploads({
            logFile: nextActive.logName ? { name: nextActive.logName, size: 0, type: "" } : undefined,
            plotFile: nextActive.plotName ? { name: nextActive.plotName, size: 0, type: "" } : undefined,
            uploadedAt: nextActive.createdAt,
          });
        }
        return remaining;
      });
      setUploadStatus(`Removed locally; could not delete on server: ${message}`);
    } finally {
      setSavingUploads(false);
    }
  };

  const handleMarkDone = async () => {
    if (!module) return;
    if (!userId) {
      setUploadStatus("Sign in to upload your submission.");
      return;
    }
    if (!logFile || !plotFile) {
      setUploadStatus("Add both the log file and plots to mark this activity as done.");
      return;
    }
    setSavingUploads(true);
    setUploadStatus("Generating AI report...");
    const reportResult = await generateReport({ log: logFile, plot: plotFile });
    setUploadStatus("Uploading files...");
    try {
      const pathPrefix = `${submissionPathPrefix}/${userId}/${module.id}`;
      const [logUrl, plotUrl] = await Promise.all([
        uploadFileToBucket({ bucket: submissionsBucket, file: logFile, pathPrefix }),
        uploadFileToBucket({ bucket: submissionsBucket, file: plotFile, pathPrefix }),
      ]);
      const submissionNumber = nextSubmissionNumber;
      const fallbackSubmission: ActivitySubmission = {
        id: `local-${module.id}-${submissionNumber}-${Date.now()}`,
        submissionNumber,
        logUrl,
        logName: logFile.name,
        plotUrl,
        plotName: plotFile.name,
        plotType: plotFile.type || plotFile.name,
        report: reportResult,
        reportStatus: reportResult ? "Report ready" : "Report not generated",
        createdAt: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("activity_submissions")
        .insert({
          user_id: userId,
          module_id: module.id,
          submission_number: submissionNumber,
          log_url: logUrl,
          log_name: logFile.name,
          plot_url: plotUrl,
          plot_name: plotFile.name,
          plot_type: plotFile.type || plotFile.name,
          report_json: reportResult ?? null,
          report_status: reportResult ? "Report ready" : "Report not generated",
        })
        .select()
        .single();
      if (error) throw error;
      const saved = mapSubmissionRow(data as SubmissionRow, submissions.length);
      const uploads = {
        logFile: buildFileMeta(logFile),
        plotFile: buildFileMeta(plotFile),
        uploadedAt: saved.createdAt,
      };
      setSubmissions((prev) => [...prev.filter((item) => item.id !== fallbackSubmission.id), saved]);
      setSelectedSubmissionId(saved.id);
      setStoredUploads(uploads);
      writeLocalSubmissionHistory(module.id, [...submissions.filter((item) => item.id !== fallbackSubmission.id), saved]);
      try {
        const stored = localStorage.getItem(progressStorageKey);
        const parsed = stored ? JSON.parse(stored) : {};
        const previous = parsed[String(module.id)] ?? {};
        parsed[String(module.id)] = {
          ...previous,
          completed: true,
          completedAt: previous.completedAt ?? uploads.uploadedAt,
          uploads,
        };
        localStorage.setItem(progressStorageKey, JSON.stringify(parsed));
      } catch {
        // ignore storage errors
      }
      setMarkedDone(true);
      setUploadStatus(`Submission ${saved.submissionNumber} saved.`);
    } catch (err) {
      console.error("Submission save failed", err);
      const reason = getErrorMessage(err);
      const submissionNumber = nextSubmissionNumber;
      const uploads = {
        logFile: buildFileMeta(logFile),
        plotFile: buildFileMeta(plotFile),
        uploadedAt: new Date().toISOString(),
      };
      const finalReport = reportResult ?? null;
      const finalStatus = finalReport ? "Report ready (saved locally)" : "Saved locally (offline)";
      const fallback: ActivitySubmission = {
        id: `local-${module.id}-${submissionNumber}-${Date.now()}`,
        submissionNumber,
        logUrl: "",
        logName: logFile.name,
        plotUrl: "",
        plotName: plotFile.name,
        plotType: plotFile.type || plotFile.name,
        report: finalReport,
        reportStatus: finalStatus,
        createdAt: uploads.uploadedAt,
      };
      setSubmissions((prev) => [...prev, fallback]);
      setSelectedSubmissionId(fallback.id);
      setStoredUploads(uploads);
      writeLocalSubmissionHistory(module.id, [...submissions, fallback]);
      setMarkedDone(true);
      setReport(finalReport);
      setReportStatus(finalStatus);
      setUploadStatus(`Saved locally. Unable to sync with server right now. (${reason})`);
    } finally {
      setSavingUploads(false);
    }
  };

  return (
    <main className="section-padding space-y-8">
      <div className="glass-panel rounded-2xl border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">Navigation</p>
          <h2 className="text-lg font-semibold text-white">Activity workspace</h2>
          <p className="text-sm text-slate-400 break-all">Activity ID: {id}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/customer"
            className="px-3 py-2 rounded-xl border border-white/10 text-sm text-slate-200 hover:border-accent-strong"
          >
            Back to activities
          </Link>
          <a href="#assessment" className="px-3 py-2 rounded-xl bg-accent text-true-white text-sm font-semibold shadow-glow">
            Self Assessment
          </a>
        </div>
      </div>

      {status && <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">{status}</div>}

      {module && (
        <section className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">
              Grade {module.grade} ? {formatSubject(module.subject)}
            </p>
            <h1 className="text-3xl font-semibold text-white leading-tight">{module.title}</h1>
            <p className="text-slate-300 text-base">{module.description}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="glass-panel rounded-2xl p-4 border border-white/10 h-full flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-lg font-semibold text-white">Code</h3>
                  <p className="text-xs text-slate-400">{module.assets.find((a) => a.type === "code")?.label || "Python file"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg bg-emerald-500 text-true-white text-sm font-semibold shadow-glow disabled:opacity-40 disabled:bg-emerald-500/60"
                    onClick={openCodeInEditor}
                    disabled={!module.codeSnippet && !module.assets.find((a) => a.type === "code")}
                    title="Open in your default editor (e.g. VS Code)"
                  >
                    Run
                  </button>
                  <button
                    type="button"
                    className="text-xs text-slate-200 underline"
                    onClick={() => setCodeExpanded((prev) => !prev)}
                  >
                    {codeExpanded ? "Collapse" : "Expand"}
                  </button>
                </div>
              </div>
              <div
                className={`bg-black rounded-xl border border-white/15 shadow-inner overflow-hidden ${codeExpanded ? "h-[70vh]" : "h-[320px]"}`}
              >
                <pre className="p-4 text-sm text-true-white overflow-auto h-full whitespace-pre-wrap">
                  <code>{codeDisplay}</code>
                </pre>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 border border-white/10 h-full flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-lg font-semibold text-white">SOP</h3>
                  <p className="text-xs text-slate-400">{module.assets.find((a) => a.type === "doc")?.label || "Document"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg bg-emerald-500 text-true-white text-sm font-semibold shadow-glow disabled:opacity-40 disabled:bg-emerald-500/60"
                    onClick={openDocInViewer}
                    disabled={!module.assets.find((a) => a.type === "doc")}
                    title="Open in your default viewer"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    className="text-xs text-slate-200 underline"
                    onClick={() => setSopExpanded((prev) => !prev)}
                  >
                    {sopExpanded ? "Collapse" : "Expand"}
                  </button>
                </div>
              </div>
              <div
                className={`bg-black/20 rounded-xl border border-white/10 shadow-inner overflow-hidden ${sopExpanded ? "h-[70vh]" : "h-[320px]"}`}
              >
                {module.assets.filter((a) => a.type === "doc").length > 0 ? (
                  <iframe
                    src={module.assets.find((a) => a.type === "doc")?.url}
                    title={module.assets.find((a) => a.type === "doc")?.label}
                    className="w-full h-full"
                  />
                ) : (
                  <div className="p-4 text-sm text-slate-300">No documents available.</div>
                )}
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-white/10 space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">MoodAI</p>
              <h3 className="text-lg font-semibold text-white">Talk Freely with MoodAI</h3>
              <p className="text-sm text-slate-400">
                Continue the conversation about this activity with MoodAI
              </p>
            </div>
            <Link
              href={module ? `/moodai?module=${module.id}` : "/moodai"}
              className="px-4 py-2 rounded-xl bg-accent text-true-white text-sm font-semibold shadow-glow inline-flex items-center justify-center"
            >
              Go to MoodAI
            </Link>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-white/10 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">Submission</p>
              <h3 className="text-lg font-semibold text-white">Upload log + plots</h3>
                <p className="text-sm text-slate-400">Add your activity log file and plots, then mark this activity as done.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-300 space-y-2">
                Upload log file
                <input
                  type="file"
                  accept=".log,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setLogFile(file);
                    if (file) setUploadStatus(null);
                    setReport(null);
                    setReportStatus(null);
                    setLogPlotPoints([]);
                  }}
                  className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none file-accent"
                />
                {logFile?.name && <p className="text-xs text-slate-400">Selected: {logFile.name}</p>}
                {!logFile?.name && storedUploads?.logFile?.name && (
                  <p className="text-xs text-slate-400">Previously uploaded: {storedUploads.logFile.name}</p>
                )}
              </label>
              <label className="block text-sm text-slate-300 space-y-2">
                Upload plots
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setPlotFile(file);
                    if (file) setUploadStatus(null);
                    setReport(null);
                    setReportStatus(null);
                    setLogPlotPoints([]);
                  }}
                  className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none file-accent"
                />
                {plotFile?.name && <p className="text-xs text-slate-400">Selected: {plotFile.name}</p>}
                {!plotFile?.name && storedUploads?.plotFile?.name && (
                  <p className="text-xs text-slate-400">Previously uploaded: {storedUploads.plotFile.name}</p>
                )}
              </label>
            </div>
            {uploadStatus && <div className="text-sm text-slate-300">{uploadStatus}</div>}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-accent text-true-white text-sm font-semibold shadow-glow disabled:opacity-50"
                onClick={handleMarkDone}
                disabled={savingUploads || !logFile || !plotFile}
              >
                {savingUploads ? "Saving..." : `Save submission #${nextSubmissionNumber}`}
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-xl border border-white/20 text-xs text-slate-200 hover:border-accent-strong disabled:opacity-60"
                onClick={() => void loadSubmissions()}
                disabled={submissionsLoading || savingUploads}
              >
                {submissionsLoading ? "Refreshing..." : "Refresh saved files"}
              </button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">Saved submissions</p>
                  <p className="text-xs text-slate-400">Every upload stays here. Pick one to view, download, or delete.</p>
                </div>
              </div>
              {submissionsLoading ? (
                <div className="text-sm text-slate-300">Loading submissions...</div>
              ) : submissions.length === 0 ? (
                <div className="text-sm text-slate-300">No submissions yet. Upload your first log and plot.</div>
              ) : (
                <div className="space-y-2">
                  {submissions.map((submission) => {
                    const isSelected =
                      submission.id === selectedSubmissionId ||
                      (!selectedSubmissionId && submission.id === submissions[submissions.length - 1]?.id);
                    return (
                      <div
                        key={submission.id}
                        className={`rounded-xl border px-3 py-2 flex flex-wrap items-center justify-between gap-2 ${
                          isSelected ? "border-accent/70 bg-accent/10" : "border-white/10 bg-black/20"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-white">Submission #{submission.submissionNumber}</p>
                          <p className="text-xs text-slate-400">
                            {submission.logName || "Log"} • {submission.plotName || "Plot"} •{" "}
                            {new Date(submission.createdAt).toLocaleString()}
                          </p>
                          {submission.reportStatus && <p className="text-xs text-slate-400">{submission.reportStatus}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-lg border border-white/15 text-xs text-white disabled:opacity-50"
                            onClick={() => setSelectedSubmissionId(submission.id)}
                            disabled={savingUploads}
                          >
                            {isSelected ? "Viewing" : "View"}
                          </button>
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-lg border border-red-500/50 text-xs text-red-200 hover:border-red-500 disabled:opacity-50"
                            onClick={() => deleteSubmission(submission.id)}
                            disabled={savingUploads}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-4 border border-white/10 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">AI Report</p>
                <h3 className="text-lg font-semibold text-white">Student submission analysis</h3>
                <p className="text-sm text-slate-400">Generated automatically after marking the submission as done.</p>
              </div>
            </div>
            {reportStatus && <div className="text-sm text-slate-300">{reportStatus}</div>}
            {pdfStatus && <div className="text-sm text-slate-300">{pdfStatus}</div>}
            {report && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-slate-300">Student: {studentName}</div>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-accent text-true-white text-sm font-semibold shadow-glow disabled:opacity-50"
                    onClick={downloadReportPdf}
                    disabled={downloadingPdf || !report}
                  >
                    {downloadingPdf ? "Preparing report..." : "Download AI Report"}
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Accuracy</p>
                    <p className="text-2xl font-semibold text-white">
                      {(() => {
                        const value = computedAccuracy ?? report.accuracyPercent;
                        return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "N/A";
                      })()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 md:col-span-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Summary</p>
                    <p className="text-sm text-slate-200">{report.summary}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Objective alignment</p>
                    <p className="text-sm text-slate-200">{report.objectiveAlignment}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Trend assessment</p>
                    <p className="text-sm text-slate-200">{report.trendAssessment}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <p className="text-sm font-semibold text-white">Plot overlay (student vs zero-error)</p>
                  {logPlotPoints.length > 1 && report.overlay?.points?.length ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                        <svg viewBox="0 0 100 100" className="w-full h-[28rem]" aria-label="Plot overlay">
                          <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
                          {(() => {
                            const xs = logPlotPoints.map((p) => p.x);
                            const ys = logPlotPoints.map((p) => p.y);
                            const minX = Math.min(...xs);
                            const maxX = Math.max(...xs);
                            const minY = Math.min(...ys);
                            const maxY = Math.max(...ys);
                            const spanX = maxX - minX || 1;
                            const spanY = maxY - minY || 1;
                            const ticks = [0, 2, 4];
                            const plotLeft = 14;
                            const plotTop = 8;
                            const plotWidth = 78;
                            const plotHeight = 78;
                            const plotRight = plotLeft + plotWidth;
                            const plotBottom = plotTop + plotHeight;
                            const formatTick = (value: number, span: number) => {
                              if (span >= 50) return Math.round(value).toString();
                              if (span >= 10) return value.toFixed(1);
                              return value.toFixed(2);
                            };
                            const toSvg = (point: PlotPoint) => {
                              const x = plotLeft + ((point.x - minX) / spanX) * plotWidth;
                              const y = plotTop + (1 - (point.y - minY) / spanY) * plotHeight;
                              return `${x},${y}`;
                            };
                            const studentPath = logPlotPoints.map(toSvg).join(" ");
                            const sortedByX = [...logPlotPoints].sort((a, b) => a.x - b.x);
                            const startPoint = sortedByX[0];
                            const endPoint = sortedByX[sortedByX.length - 1];
                            const expectedPath = startPoint && endPoint
                              ? [startPoint, endPoint].map(toSvg).join(" ")
                              : "";
                            const pointMarkers = logPlotPoints
                              .slice(0, 300)
                              .map((point, idx) => {
                                const coords = toSvg(point).split(",");
                                return (
                                  <circle
                                    key={`pt-${idx}`}
                                    cx={Number.parseFloat(coords[0])}
                                    cy={Number.parseFloat(coords[1])}
                                    r="0.8"
                                    fill="#93c5fd"
                                  />
                                );
                              });
                            return (
                              <>
                                {ticks.map((t) => {
                                  const x = plotLeft + (t / 4) * plotWidth;
                                  const y = plotTop + (t / 4) * plotHeight;
                                  return (
                                    <g key={`grid-${t}`}>
                                      <line x1={x} y1={plotTop} x2={x} y2={plotBottom} stroke="rgba(15,23,42,0.15)" strokeWidth="0.4" />
                                      <line x1={plotLeft} y1={y} x2={plotRight} y2={y} stroke="rgba(15,23,42,0.15)" strokeWidth="0.4" />
                                    </g>
                                  );
                                })}
                                <polyline points={studentPath} fill="none" stroke="#2563eb" strokeWidth="1.2" />
                                {pointMarkers}
                                <polyline points={expectedPath} fill="none" stroke="#dc2626" strokeWidth="1.2" strokeDasharray="2 2" />
                                {ticks.map((t) => {
                                  const valueX = minX + (t / 4) * spanX;
                                  const valueY = maxY - (t / 4) * spanY;
                                  return (
                                    <g key={`tick-${t}`}>
                                      <text
                                        x={plotLeft + (t / 4) * plotWidth}
                                        y={plotBottom + 6}
                                        textAnchor="middle"
                                        fill="rgba(15,23,42,0.7)"
                                        fontSize="2.2"
                                      >
                                        {formatTick(valueX, spanX)}
                                      </text>
                                      <text
                                        x="10"
                                        y={plotTop + 2 + (t / 4) * plotHeight}
                                        textAnchor="end"
                                        fill="rgba(15,23,42,0.7)"
                                        fontSize="2.2"
                                      >
                                        {formatTick(valueY, spanY)}
                                      </text>
                                    </g>
                                  );
                                })}
                                <text x={(plotLeft + plotRight) / 2} y="99" textAnchor="middle" fill="rgba(15,23,42,0.9)" fontSize="3">
                                  Height (cm)
                                </text>
                                <text
                                  x="3.5"
                                  y="50"
                                  textAnchor="middle"
                                  fill="rgba(15,23,42,0.9)"
                                  fontSize="2.8"
                                  transform="rotate(-90 3.5 50)"
                                >
                                  Pressure (kPa)
                                </text>
                                <g>
                                  <rect x="64" y="10" width="26" height="12" rx="2" fill="rgba(255,255,255,0.9)" stroke="none" />
                                  <line x1="66" y1="14" x2="72" y2="14" stroke="#2563eb" strokeWidth="1.2" />
                                  <text x="74" y="15.2" fill="rgba(15,23,42,0.9)" fontSize="2.4">Student log</text>
                                  <line x1="66" y1="19" x2="72" y2="19" stroke="#dc2626" strokeWidth="1.2" strokeDasharray="2 2" />
                                  <text x="74" y="20.2" fill="#dc2626" fontSize="2.4">Standard (ISA)</text>
                                </g>
                              </>
                            );
                          })()}
                          <rect x="14" y="8" width="78" height="78" fill="none" stroke="rgba(15,23,42,0.35)" />
                        </svg>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-slate-300">
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-blue-300" /> Student (from log)
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Standard (ISA)
                        </span>
                      </div>
                      {report.overlay?.note && <p className="text-xs text-slate-400">{report.overlay.note}</p>}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-300">Upload a log with at least two numeric columns to view the overlay.</p>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Possible errors</p>
                    <ul className="text-sm text-slate-200 space-y-1">
                      {normalizeStringList(report.possibleErrors).map((err, idx) => (
                        <li key={idx}>- {err}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Suggestions</p>
                    <ul className="text-sm text-slate-200 space-y-1">
                      {normalizeStringList(report.improvementTips).map((tip, idx) => (
                        <li key={idx}>- {tip}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Log insights</p>
                  <ul className="text-sm text-slate-200 space-y-1">
                    {normalizeStringList(report.logInsights).map((insight, idx) => (
                      <li key={idx}>- {insight}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div id="assessment" className="glass-panel rounded-2xl p-4 border border-white/10 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">AI Assessment</p>
                <h3 className="text-lg font-semibold text-white">Generate practice MCQs</h3>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-accent text-true-white text-sm font-semibold disabled:opacity-50"
                onClick={generateQuiz}
                disabled={generatingQuiz}
              >
                {generatingQuiz ? "Generating..." : "Generate quiz"}
              </button>
            </div>
            {quizStatus && <div className="text-sm text-slate-300">{quizStatus}</div>}
            {quizQuestions.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-slate-200">
                  <div className="flex gap-2 flex-wrap">
                    <span className="px-2 py-1 rounded-md bg-black/30 border border-white/10">
                      Time left: {Math.floor(timeLeft / 60)}:{`${timeLeft % 60}`.padStart(2, "0")}
                    </span>
                    <span className="px-2 py-1 rounded-md bg-black/30 border border-white/10">
                      Answered: {answeredCount}/{quizQuestions.length}
                    </span>
                  </div>
                  {quizComplete && score !== null && (
                    <span className="text-accent-strong font-semibold">Score: {score}/{quizQuestions.length}</span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {quizQuestions.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`w-10 h-10 rounded-full border text-sm font-semibold ${
                        idx === currentQuestion ? "border-accent text-accent-strong bg-accent/10" : "border-white/15 text-white bg-white/5"
                      }`}
                      onClick={() => setCurrentQuestion(idx)}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
                {!quizComplete && (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-200 font-semibold">Question {currentQuestion + 1} of {quizQuestions.length}</p>
                    <div className="rounded-xl border border-accent/30 bg-white/5 p-4 space-y-3 shadow-glow">
                      <p className="text-white text-base leading-relaxed font-semibold">{quizQuestions[currentQuestion].question}</p>
                      <div className="space-y-2">
                        {quizQuestions[currentQuestion].options.map((opt) => {
                          const selected = selections[currentQuestion] === opt.label;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              className={`w-full text-left px-3 py-2 rounded-lg border ${
                                selected ? "border-accent bg-accent/20 text-white" : "border-white/15 bg-white/5 text-slate-100"
                              }`}
                              onClick={() => setSelections((prev) => ({ ...prev, [currentQuestion]: opt.label }))}
                            >
                              <span className="font-semibold mr-2">{opt.label})</span>
                              {opt.text}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex gap-2 justify-between">
                        <button
                          type="button"
                          className="h-10 px-4 rounded-lg border border-white/15 bg-white/5 text-white font-semibold disabled:opacity-40"
                          disabled={currentQuestion === 0}
                          onClick={() => setCurrentQuestion((idx) => Math.max(0, idx - 1))}
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          className="h-10 px-4 rounded-lg border border-white/15 bg-white/5 text-white font-semibold disabled:opacity-40"
                          disabled={currentQuestion === quizQuestions.length - 1}
                          onClick={() => setCurrentQuestion((idx) => Math.min(quizQuestions.length - 1, idx + 1))}
                        >
                          Next
                        </button>
                        <button
                          type="button"
                          className="h-10 px-5 rounded-lg bg-accent text-true-white font-semibold shadow-glow disabled:opacity-40"
                          onClick={() => setQuizComplete(true)}
                          disabled={quizComplete}
                        >
                          Submit
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {quizComplete && score !== null && (
                  <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-white space-y-3">
                    <p className="text-lg font-semibold">Assessment complete</p>
                    <p className="text-sm">Score: {score}/{quizQuestions.length}</p>
                    {quizQuestions[currentQuestion] && (() => {
                      const q = quizQuestions[currentQuestion];
                      const selected = selections[currentQuestion] ?? "";
                      const selectedOption = q.options.find((opt) => opt.label === selected);
                      const correctOption = q.options.find((opt) => opt.label === q.answer);
                      const isCorrect = selected === q.answer;
                      return (
                        <div className="rounded-lg border border-white/10 bg-black/20 p-5 space-y-3">
                          <p className="text-lg font-semibold text-white">
                            Q{currentQuestion + 1}. {q.question}
                          </p>
                          <p
                            className={`text-base font-semibold ${
                              isCorrect
                                ? "text-emerald-200"
                                : "text-rose-400 bg-rose-500/15 border border-rose-400/30 px-2 py-1 rounded-md inline-block"
                            }`}
                          >
                            Your answer: {selected ? `${selected}) ${selectedOption?.text ?? ""}` : "Not answered"}
                          </p>
                          <p className="text-base text-slate-100">
                            Correct answer: {q.answer}) {correctOption?.text ?? ""}
                          </p>
                          {q.explanation && <p className="text-base text-slate-200">Explanation: {q.explanation}</p>}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

