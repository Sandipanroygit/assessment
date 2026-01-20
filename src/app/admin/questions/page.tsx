"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchCurriculumModules, uploadFileToBucket } from "@/lib/supabaseData";
import type { CurriculumModule } from "@/types";

const sanitizeSegment = (value: string) =>
  value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "item";

type QuestionFile = {
  path: string;
  fileName: string;
  url: string;
  createdAt?: string | null;
  moduleTitle?: string;
  grade?: string;
};

export default function AdminQuestionsPage() {
  const [modules, setModules] = useState<CurriculumModule[]>([]);
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [selectedModuleId, setSelectedModuleId] = useState<string>("");
  const [questionsText, setQuestionsText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [questionFiles, setQuestionFiles] = useState<QuestionFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const grades = useMemo(() => {
    const set = new Set<string>();
    modules.forEach((m) => set.add(m.grade));
    return ["all", ...Array.from(set)];
  }, [modules]);

  const filteredModules = useMemo(
    () => modules.filter((m) => gradeFilter === "all" || m.grade === gradeFilter),
    [modules, gradeFilter],
  );

  useEffect(() => {
    let cancelled = false;
    const loadModules = async () => {
      setStatus("Loading activities...");
      try {
        const data = await fetchCurriculumModules({ includeUnpublished: true });
        if (cancelled) return;
        setModules(data);
        setStatus(null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to load activities";
        setStatus(message);
      }
    };
    void loadModules();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadQuestionFiles = async () => {
      if (modules.length === 0) return;
      setLoadingFiles(true);
      try {
        const bucket = supabase.storage.from("curriculum-assets");
        const collected: QuestionFile[] = [];
        const filtered = modules.filter((m) => gradeFilter === "all" || m.grade === gradeFilter);
        for (const mod of filtered) {
          const prefix = `question-banks/${sanitizeSegment(mod.grade)}/${sanitizeSegment(mod.module || mod.title)}`;
          const { data, error } = await bucket.list(prefix, {
            limit: 100,
            offset: 0,
            sortBy: { column: "name", order: "desc" },
          });
          if (error || !data) continue;
          data.forEach((item) => {
            if (!item.name.toLowerCase().endsWith(".json")) return;
            const path = `${prefix}/${item.name}`;
            const { data: urlData } = bucket.getPublicUrl(path);
            collected.push({
              path,
              fileName: item.name,
              url: urlData.publicUrl,
              createdAt:
                (item as { created_at?: string; updated_at?: string }).created_at ||
                (item as { updated_at?: string }).updated_at,
              moduleTitle: mod.title,
              grade: mod.grade,
            });
          });
        }
        if (cancelled) return;
        setQuestionFiles(collected.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
      } finally {
        if (!cancelled) setLoadingFiles(false);
      }
    };
    void loadQuestionFiles();
    return () => {
      cancelled = true;
    };
  }, [modules, gradeFilter]);

  const handleUpload = async () => {
    if (!selectedModuleId) {
      setStatus("Select an activity first.");
      return;
    }
    if (!questionsText.trim()) {
      setStatus("Add some questions before uploading.");
      return;
    }
    const selectedModule = modules.find((m) => m.id === selectedModuleId);
    if (!selectedModule) {
      setStatus("Invalid activity selection.");
      return;
    }
    setUploading(true);
    setStatus("Uploading questions...");
    try {
      const payload = {
        moduleId: selectedModule.id,
        moduleTitle: selectedModule.title,
        grade: selectedModule.grade,
        subject: selectedModule.subject,
        createdAt: new Date().toISOString(),
        questions: questionsText.trim(),
      };
      const gradeSegment = sanitizeSegment(selectedModule.grade);
      const moduleSegment = sanitizeSegment(selectedModule.module || selectedModule.title);
      const fileName = `${moduleSegment}-${Date.now()}.json`;
      await uploadFileToBucket({
        bucket: "curriculum-assets",
        file: new File([JSON.stringify(payload, null, 2)], fileName, { type: "application/json" }),
        pathPrefix: `question-banks/${gradeSegment}/${moduleSegment}`,
        fileName,
      });
      setStatus("Uploaded questions.");
      setQuestionsText("");
      setSelectedModuleId("");
      // refresh list
      setQuestionFiles((prev) => [
        {
          path: `question-banks/${gradeSegment}/${moduleSegment}/${fileName}`,
          fileName,
          url: supabase.storage.from("curriculum-assets").getPublicUrl(
            `question-banks/${gradeSegment}/${moduleSegment}/${fileName}`,
          ).data.publicUrl,
          createdAt: payload.createdAt,
          moduleTitle: selectedModule.title,
          grade: selectedModule.grade,
        },
        ...prev,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setStatus(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="section-padding space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">Admin</p>
          <h1 className="text-2xl font-semibold text-white">Activity Questions</h1>
          <p className="text-sm text-slate-300">Upload and manage grade-wise activity question sets for students.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin"
            className="px-3 py-2 rounded-lg border border-white/10 text-sm text-slate-200 hover:border-accent-strong"
          >
            Back to admin
          </Link>
        </div>
      </div>

      {status && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">{status}</div>
      )}

      <div className="glass-panel rounded-2xl p-5 space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <label className="space-y-2 text-sm text-slate-200">
            Grade
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white"
            >
              {grades.map((g) => (
                <option key={g} value={g} className="text-black">
                  {g === "all" ? "All grades" : g}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-200 md:col-span-2">
            Activity
            <select
              value={selectedModuleId}
              onChange={(e) => setSelectedModuleId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white"
            >
              <option value="" className="text-black">
                Select activity
              </option>
              {filteredModules.map((m) => (
                <option key={m.id} value={m.id} className="text-black">
                  {m.title} — {m.grade} — {m.subject}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-2 text-sm text-slate-200">
          Questions (paste JSON or plain text)
          <textarea
            value={questionsText}
            onChange={(e) => setQuestionsText(e.target.value)}
            rows={8}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white focus:border-accent focus:outline-none"
            placeholder='e.g. [{"q":"...","options":["A","B","C","D"],"answer":"A"}]'
          />
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="px-4 py-2 rounded-xl bg-accent text-true-white font-semibold shadow-glow disabled:opacity-60"
          >
            {uploading ? "Uploading..." : "Upload questions"}
          </button>
          <p className="text-xs text-slate-400">
            Files are saved to storage under grade/activity for student delivery later.
          </p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Question files</h2>
          <span className="text-sm text-slate-400">
            {loadingFiles ? "Loading..." : `${questionFiles.length} file${questionFiles.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm text-slate-200">
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/10">
                <th className="py-2 pr-3">Activity</th>
                <th className="py-2 pr-3">Grade</th>
                <th className="py-2 pr-3">File</th>
                <th className="py-2 pr-3">Download</th>
              </tr>
            </thead>
            <tbody>
              {questionFiles.length === 0 ? (
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-3 text-slate-300" colSpan={4}>
                    {loadingFiles ? "Loading files..." : "No question files yet."}
                  </td>
                </tr>
              ) : (
                questionFiles.map((file, idx) => (
                  <tr key={`${file.path}-${idx}`} className="border-b border-white/5">
                    <td className="py-2 pr-3 font-semibold text-white">{file.moduleTitle ?? "-"}</td>
                    <td className="py-2 pr-3 text-slate-300">{file.grade ?? "-"}</td>
                    <td className="py-2 pr-3 text-slate-300">{file.fileName}</td>
                    <td className="py-2 pr-3">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-900 font-semibold text-xs border border-emerald-400 hover:bg-emerald-400 hover:border-emerald-300"
                      >
                        Open
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
