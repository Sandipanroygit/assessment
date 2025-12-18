"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { fetchCurriculumModuleById } from "@/lib/supabaseData";
import type { CurriculumModule } from "@/types";

const formatSubject = (subject: string) => (subject.toLowerCase() === "maths" ? "Mathematics" : subject);

export default function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [module, setModule] = useState<CurriculumModule | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [codeDisplay, setCodeDisplay] = useState("Loading code...");
  const [quizText, setQuizText] = useState<string | null>(null);
  const [quizStatus, setQuizStatus] = useState<string | null>(null);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);

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
    if (module.codeSnippet) {
      const blob = new Blob([module.codeSnippet], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${module.title.replace(/\s+/g, "-").toLowerCase()}.py`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const codeAsset = module.assets.find((a) => a.type === "code");
    if (codeAsset?.url) {
      const a = document.createElement("a");
      a.href = codeAsset.url;
      a.download = codeAsset.label || "code.py";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
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
      "Create 4 multiple-choice questions (A-D) that test understanding of the activity. Keep them concise and specific to this activity.",
      "Return in this markdown format:",
      "Q1. <question>",
      "A) ...",
      "B) ...",
      "C) ...",
      "D) ...",
      "Answer: <letter>",
      "",
      "Repeat for Q2-Q4. Do not add explanations.",
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
      setQuizStatus(null);
    } catch {
      setQuizStatus("Unable to generate quiz right now.");
    } finally {
      setGeneratingQuiz(false);
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
                <button
                  type="button"
                  className="text-xs text-accent-strong underline disabled:text-accent-strong/40 disabled:opacity-70"
                  onClick={downloadCode}
                  disabled={!module.codeSnippet && !module.assets.find((a) => a.type === "code")}
                >
                  Download
                </button>
              </div>
              <div className="bg-black rounded-xl border border-white/15 shadow-inner overflow-hidden flex-1">
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
                <button type="button" className="text-xs text-slate-900 underline" onClick={downloadDoc}>
                  Download
                </button>
              </div>
              <div className="bg-black/20 rounded-xl border border-white/10 shadow-inner overflow-hidden flex-1">
                {module.assets.filter((a) => a.type === "doc").length > 0 ? (
                  <iframe
                    src={module.assets.find((a) => a.type === "doc")?.url}
                    title={module.assets.find((a) => a.type === "doc")?.label}
                    className="w-full h-full min-h-[320px]"
                  />
                ) : (
                  <div className="p-4 text-sm text-slate-300">No documents available.</div>
                )}
              </div>
            </div>
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
            {quizText && (
              <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-slate-100 whitespace-pre-wrap text-sm leading-relaxed">
                {quizText}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
