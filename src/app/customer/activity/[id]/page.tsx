"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { fetchCurriculumModuleById } from "@/lib/supabaseData";
import type { CurriculumModule } from "@/types";

const formatSubject = (subject: string) => (subject.toLowerCase() === "maths" ? "Mathematics" : subject);
const progressStorageKey = "activityProgress";

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

const buildFileMeta = (file: File): UploadMeta => ({ name: file.name, size: file.size, type: file.type });

export default function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [module, setModule] = useState<CurriculumModule | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [codeDisplay, setCodeDisplay] = useState("Loading code...");
  const [quizText, setQuizText] = useState<string | null>(null);
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
  const [markedDone, setMarkedDone] = useState(false);
  const [codeExpanded, setCodeExpanded] = useState(false);
  const [sopExpanded, setSopExpanded] = useState(false);

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

  useEffect(() => {
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
  }, [id]);

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

  const downloadCode = async () => {
    if (!module) return;
    const ensurePyExtension = (name: string) => (name.toLowerCase().endsWith(".py") ? name : `${name}.py`);
    const fallbackName = ensurePyExtension(module.title.replace(/\s+/g, "-").toLowerCase() || "code");
    if (module.codeSnippet) {
      const blob = new Blob([module.codeSnippet], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fallbackName;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const codeAsset = module.assets.find((a) => a.type === "code");
    if (codeAsset?.url) {
      const fileName = ensurePyExtension(codeAsset.label || fallbackName);
      try {
        const res = await fetch(codeAsset.url);
        if (!res.ok) throw new Error("Failed to fetch code file.");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        const a = document.createElement("a");
        a.href = codeAsset.url;
        a.download = fileName;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.click();
      }
    }
  };

  const downloadDoc = async () => {
    if (!module) return;
    const docAsset = module.assets.find((a) => a.type === "doc");
    if (docAsset?.url) {
      const a = document.createElement("a");
      a.href = docAsset.url;
      a.download = docAsset.label || "document";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    }
  };

  const quizContext = useMemo(() => {
    const codeSnippet = codeDisplay?.slice(0, 2400) ?? "";
    return {
      subject: module?.subject ?? "",
      title: module?.title ?? "",
      description: module?.description ?? "",
      code: codeSnippet,
    };
  }, [codeDisplay, module]);

  const generateQuiz = async () => {
    if (!module) return;
    setGeneratingQuiz(true);
    setQuizText(null);
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
        setGeneratingQuiz(false);
        return;
      }
      const reply = data?.reply ?? "No quiz generated.";
      setQuizText(reply);
      const parsed = parseQuiz(reply);
      if (parsed.length > 0) {
        setQuizQuestions(parsed);
        setCurrentQuestion(0);
        setSelections({});
        setQuizComplete(false);
        setTimeLeft(300);
      } else {
        setQuizStatus("Unable to parse quiz. Please retry.");
      }
      setQuizStatus(null);
    } catch {
      setQuizStatus("Unable to generate quiz right now.");
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

  useEffect(() => {
    if (!module) return;
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
  }, [module]);

  const handleMarkDone = () => {
    if (!module) return;
    if (!logFile || !plotFile) {
      setUploadStatus("Add both the log file and plots to mark this activity as done.");
      return;
    }
    setSavingUploads(true);
    setUploadStatus(null);
    try {
      const stored = localStorage.getItem(progressStorageKey);
      const parsed = stored ? JSON.parse(stored) : {};
      const previous = parsed[String(module.id)] ?? {};
      const uploads = {
        logFile: buildFileMeta(logFile),
        plotFile: buildFileMeta(plotFile),
        uploadedAt: new Date().toISOString(),
      };
      parsed[String(module.id)] = {
        ...previous,
        completed: true,
        completedAt: previous.completedAt ?? uploads.uploadedAt,
        uploads,
      };
      localStorage.setItem(progressStorageKey, JSON.stringify(parsed));
      setStoredUploads(uploads);
      setMarkedDone(true);
      setUploadStatus("Files saved. Activity marked as done.");
    } catch {
      setUploadStatus("Unable to save your files right now.");
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
          <a
            href="#assessment"
            className="px-3 py-2 rounded-xl bg-accent text-true-white text-sm font-semibold shadow-glow"
          >
            Self Assessment
          </a>
        </div>
      </div>

      {status && <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">{status}</div>}

      {module && (
        <section className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">
              Grade {module.grade} · {formatSubject(module.subject)}
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
                    className="text-xs text-accent-strong underline disabled:text-accent-strong/40 disabled:opacity-70"
                    onClick={downloadCode}
                    disabled={!module.codeSnippet && !module.assets.find((a) => a.type === "code")}
                  >
                    Download
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
                  <button type="button" className="text-xs text-slate-900 underline" onClick={downloadDoc}>
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
            <button
              type="button"
              className="px-4 py-2 rounded-xl bg-accent text-true-white text-sm font-semibold shadow-glow disabled:opacity-50"
              onClick={handleMarkDone}
              disabled={savingUploads || !logFile || !plotFile}
            >
              {savingUploads ? "Saving..." : "Mark done"}
            </button>
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
                    <span className="px-2 py-1 rounded-md bg-black/30 border border-white/10">Time left: {Math.floor(timeLeft / 60)}:{`${timeLeft % 60}`.padStart(2, "0")}</span>
                    <span className="px-2 py-1 rounded-md bg-black/30 border border-white/10">Answered: {answeredCount}/{quizQuestions.length}</span>
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
            {quizStatus && !quizQuestions.length && !generatingQuiz && (
              <div className="text-sm text-slate-300">{quizStatus}</div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
