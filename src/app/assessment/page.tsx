"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchCurriculumModuleById } from "@/lib/supabaseData";
import type { CurriculumModule } from "@/types";

type QuizQuestion = {
  question: string;
  options: Array<{ label: string; text: string }>;
  answer: string;
  explanation?: string;
};

const decodeDataUrl = (url?: string) => {
  if (!url || !url.startsWith("data:")) return null;
  const commaIndex = url.indexOf(",");
  if (commaIndex === -1) return null;
  try {
    const base64 = url.slice(commaIndex + 1);
    return atob(base64);
  } catch {
    return null;
  }
};

const parseQuiz = (text: string): QuizQuestion[] => {
  const blocks = text.split(/Q\d+\./i).filter(Boolean);
  const questions: QuizQuestion[] = [];
  const answerRegex = /Answer:\s*([A-D])/i;
  blocks.forEach((block) => {
    const lines = block
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
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

function AssessmentPageContent() {
  const searchParams = useSearchParams();
  const moduleId = searchParams.get("module");
  const [module, setModule] = useState<CurriculumModule | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [codeDisplay, setCodeDisplay] = useState("Loading code...");
  const [generating, setGenerating] = useState(false);
  const [quizText, setQuizText] = useState<string | null>(null);
  const [quizStatus, setQuizStatus] = useState<string | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);

  const loadCode = useCallback(
    async (currentModule: CurriculumModule | null) => {
      if (!currentModule) {
        setCodeDisplay("No activity selected yet.");
        return;
      }
      if (currentModule.codeSnippet) {
        setCodeDisplay(currentModule.codeSnippet);
        return;
      }
      const codeAsset = currentModule.assets.find((a) => a.type === "code");
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
    },
    [],
  );

  const quizContext = useMemo(() => {
    const codeSnippet = codeDisplay?.slice(0, 2400) ?? "";
    return {
      subject: module?.subject ?? "",
      title: module?.title ?? "",
      description: module?.description ?? "",
      code: codeSnippet,
    };
  }, [codeDisplay, module]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!moduleId) {
        setStatus("Select an activity to generate an assessment.");
        return;
      }
      setStatus("Loading activity...");
      try {
        const row = await fetchCurriculumModuleById(moduleId);
        if (cancelled) return;
        if (!row) {
          setStatus("Activity not found.");
          return;
        }
        setModule(row);
        setStatus(null);
      } catch {
        if (!cancelled) setStatus("Unable to load activity.");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  useEffect(() => {
    void loadCode(module);
  }, [loadCode, module]);

  const generateQuiz = async () => {
    if (!module) {
      setQuizStatus("Load an activity first.");
      return;
    }
    setGenerating(true);
    setQuizText(null);
    setQuizQuestions([]);
    setQuizStatus("Generating MCQs...");
    const prompt = [
      "You are creating a short MCQ quiz for a student who just viewed this drone activity.",
      `Title: ${quizContext.title}`,
      `Grade: ${module.grade}`,
      `Subject: ${quizContext.subject}`,
      `Description: ${quizContext.description}`,
      quizContext.code ? `Code (trimmed):\n${quizContext.code}` : "No code snippet available.",
      "",
      "Create 5 multiple-choice questions (A-D) that test understanding of the activity. Keep them concise and specific to this activity.",
      "Return in this markdown format:",
      "Q1. <question>",
      "A) ...",
      "B) ...",
      "C) ...",
      "D) ...",
      "Answer: <letter>",
      "Explanation: <short explanation>",
      "",
      "Repeat for Q2-Q5. Do not add explanations.",
    ].join("\n");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error || data?.reply || "Assistant unavailable.";
        setQuizStatus(detail);
        return;
      }
      const reply = data?.reply ?? "No quiz generated.";
      setQuizText(reply);
      const parsed = parseQuiz(reply);
      setQuizQuestions(parsed);
      setQuizStatus(null);
    } catch {
      setQuizStatus("Unable to generate quiz right now.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="section-padding space-y-6">
      <div className="glass-panel rounded-2xl border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">AI Assessment</p>
          <h1 className="text-2xl font-semibold text-white">Generate practice MCQs</h1>
          {module && (
            <p className="text-sm text-slate-400">
              {module.title} • Grade {module.grade} • {module.subject}
            </p>
          )}
          {!module && <p className="text-sm text-slate-400">Choose an activity to start.</p>}
        </div>
        <div className="flex gap-2">
          <Link
            href="/customer"
            className="px-3 py-2 rounded-xl border border-white/10 text-sm text-slate-200 hover:border-accent-strong"
          >
            Back to activities
          </Link>
          {module && (
            <Link
              href={`/customer/activity/${module.id}`}
              className="px-3 py-2 rounded-xl bg-accent text-true-white text-sm font-semibold shadow-glow"
            >
              View activity
            </Link>
          )}
        </div>
      </div>

      {status && <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">{status}</div>}

      <div className="glass-panel rounded-2xl p-4 border border-white/10 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">MCQ generator</p>
            <h3 className="text-lg font-semibold text-white">Ask AI for practice questions</h3>
            <p className="text-sm text-slate-400">
              Uses activity title, subject, grade, description, and a trimmed code snippet to build 5 MCQs.
            </p>
          </div>
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-accent text-true-white text-sm font-semibold shadow-glow disabled:opacity-50"
            onClick={() => void generateQuiz()}
            disabled={generating || !module}
          >
            {generating ? "Generating..." : "Generate MCQs"}
          </button>
        </div>
        {quizStatus && <div className="text-sm text-slate-300">{quizStatus}</div>}
        {quizQuestions.length > 0 && (
          <div className="space-y-3">
            {quizQuestions.map((q, idx) => (
              <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                <p className="text-sm font-semibold text-white">
                  Q{idx + 1}. {q.question}
                </p>
                <ul className="text-sm text-slate-200 space-y-1">
                  {q.options.map((opt) => (
                    <li key={opt.label}>
                      <span className="font-semibold mr-2">{opt.label})</span>
                      {opt.text}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-accent-strong font-semibold">Answer: {q.answer}</p>
                {q.explanation && <p className="text-sm text-slate-300">Explanation: {q.explanation}</p>}
              </div>
            ))}
          </div>
        )}
        {quizText && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2">Raw output</p>
            <pre className="text-sm text-slate-100 whitespace-pre-wrap">{quizText}</pre>
          </div>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-4 border border-white/10 space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">Activity context</p>
        <div className="space-y-2 text-sm text-slate-200">
          <p>{quizContext.title || "No activity loaded."}</p>
          <p className="text-slate-400">
            {quizContext.subject ? `Subject: ${quizContext.subject}` : "Subject not available"} •{" "}
            {module?.grade ? `Grade ${module.grade}` : "Grade not available"}
          </p>
          <p className="text-slate-300">{quizContext.description || "No description provided."}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2">Code snippet (trimmed)</p>
          <pre className="text-xs text-slate-100 whitespace-pre-wrap max-h-[320px] overflow-y-auto">
            {codeDisplay?.slice(0, 2400) || "No code available."}
          </pre>
        </div>
      </div>
    </main>
  );
}

export default function AssessmentPage() {
  return (
    <Suspense fallback={<div className="section-padding text-slate-200">Loading assessment...</div>}>
      <AssessmentPageContent />
    </Suspense>
  );
}
