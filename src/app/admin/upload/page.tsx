"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { CURRICULUM_STORAGE_KEY } from "@/data/curriculum";
import type { CurriculumModule } from "@/types";

const grades = ["Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const subjects = ["Physics", "Maths", "Computer Science", "Environment System & Society (ESS)", "Design Technology"];

const toBase64 = (text: string) => {
  if (typeof window === "undefined") {
    return Buffer.from(text, "utf-8").toString("base64");
  }
  try {
    return btoa(unescape(encodeURIComponent(text)));
  } catch {
    return btoa(text);
  }
};

export default function UploadCurriculumPage() {
  const [grade, setGrade] = useState(grades[0]);
  const [subject, setSubject] = useState(subjects[0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoFileName, setVideoFileName] = useState("");
  const [pythonCode, setPythonCode] = useState("");
  const [pythonFileName, setPythonFileName] = useState("");
  const [pythonFileData, setPythonFileData] = useState("");
  const [manualFileName, setManualFileName] = useState("");
  const [manualFileData, setManualFileData] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    let finalCode = pythonCode;
    if (!finalCode && pythonFileData.startsWith("data:")) {
      try {
        const base64 = pythonFileData.split(",")[1];
        finalCode = atob(base64);
      } catch {
        finalCode = "";
      }
    }
    const codeDataUrl =
      finalCode && finalCode.length
        ? `data:text/plain;base64,${toBase64(finalCode)}`
        : pythonFileData || "";
    const newItem: CurriculumModule = {
      id: crypto.randomUUID(),
      title,
      grade,
      subject,
      module: "Drone Module",
      description,
      assets: [
        ...(videoFileName ? [{ type: "video" as const, url: videoFileName, label: videoFileName }] : []),
        ...(finalCode
          ? [{ type: "code" as const, url: codeDataUrl || "inline", label: pythonFileName || "Python code" }]
          : []),
        ...(manualFileName
          ? [{ type: "doc" as const, url: manualFileData || manualFileName, label: manualFileName }]
          : []),
      ],
      codeSnippet: finalCode || undefined,
    };
    try {
      const stored = localStorage.getItem(CURRICULUM_STORAGE_KEY);
      const parsed = stored ? (JSON.parse(stored) as CurriculumModule[]) : [];
      const next = Array.isArray(parsed) ? [...parsed, newItem] : [newItem];
      localStorage.setItem(CURRICULUM_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
    setStatus(
      `Saved draft for ${title || "untitled"} (${grade}, ${subject}). Video file: ${
        videoFileName || "none"
      }, manual file: ${manualFileName || "none"}.`
    );
  };

  return (
    <main className="section-padding space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-accent-strong uppercase text-xs tracking-[0.2em]">Curriculum</p>
          <h1 className="text-3xl font-semibold text-white">Upload drone activity</h1>
          <p className="text-slate-300 text-sm mt-2">
            Choose grade and subject, then add title, description, video, Python code, and the user manual.
          </p>
        </div>
        <Link
          href="/admin"
          className="px-4 py-2 rounded-xl border border-white/10 text-sm text-white hover:border-accent-strong"
        >
          Back to dashboard
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-6 space-y-4 border border-white/10">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block text-sm text-slate-300 space-y-2">
            Grade
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
            >
              {grades.map((g) => (
                <option key={g} value={g} className="text-black">
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-300 space-y-2">
            Subject
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
            >
              {subjects.map((s) => (
                <option key={s} value={s} className="text-black">
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm text-slate-300 space-y-2">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
            placeholder="Drone activity title"
            required
          />
        </label>

        <label className="block text-sm text-slate-300 space-y-2">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
            rows={3}
            placeholder="What students will learn and do."
            required
          />
        </label>

        <div className="grid md:grid-cols-2 gap-4">
        <label className="block text-sm text-slate-300 space-y-2">
          Upload video (MP4)
          <input
            type="file"
            accept="video/mp4"
              onChange={(e) => setVideoFileName(e.target.files?.[0]?.name ?? "")}
              className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none file:bg-transparent file:border-0 file:text-white"
            />
            {videoFileName && <p className="text-xs text-slate-400">Selected: {videoFileName}</p>}
          </label>
          <label className="block text-sm text-slate-300 space-y-2">
          Upload user manual (PDF/PPT/DOC)
          <input
            type="file"
            accept=".pdf,.ppt,.pptx,.doc,.docx"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setManualFileName(file?.name ?? "");
              if (!file) {
                setManualFileData("");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setManualFileData(typeof reader.result === "string" ? reader.result : "");
              };
              reader.readAsDataURL(file);
            }}
            className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none file:bg-transparent file:border-0 file:text-white"
          />
          {manualFileName && <p className="text-xs text-slate-400">Selected: {manualFileName}</p>}
        </label>
        </div>

        <label className="block text-sm text-slate-300 space-y-2">
          Python code (paste or link)
          <textarea
            value={pythonCode}
            onChange={(e) => setPythonCode(e.target.value)}
            className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none font-mono"
            rows={4}
            placeholder="Paste code snippet or link to file"
          />
        </label>

        <label className="block text-sm text-slate-300 space-y-2">
          Upload Python file
          <input
            type="file"
            accept=".py"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setPythonFileName(file?.name ?? "");
              setPythonFileData("");
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === "string") {
                  setPythonCode(reader.result);
                }
              };
              reader.readAsText(file);

              const readerData = new FileReader();
              readerData.onload = () => {
                if (typeof readerData.result === "string") {
                  setPythonFileData(readerData.result);
                }
              };
              readerData.readAsDataURL(file);
            }}
            className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none file:bg-transparent file:border-0 file:text-white"
          />
          {pythonFileName && <p className="text-xs text-slate-400">Selected: {pythonFileName}</p>}
        </label>

        {status && (
          <div className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent-strong">
            {status}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            className="px-4 py-3 rounded-xl bg-accent text-slate-900 font-semibold shadow-glow hover:translate-y-[-1px] transition-transform"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={() => {
              setTitle("");
              setDescription("");
              setVideoFileName("");
              setPythonCode("");
              setPythonFileName("");
              setPythonFileData("");
              setManualFileName("");
              setManualFileData("");
              setStatus(null);
            }}
            className="px-4 py-3 rounded-xl border border-white/10 text-white hover:border-accent-strong"
          >
            Reset
          </button>
        </div>
      </form>
    </main>
  );
}
