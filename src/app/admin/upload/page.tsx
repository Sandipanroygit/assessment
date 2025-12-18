"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { uploadFileToBucket } from "@/lib/supabaseData";
import type { CurriculumModule } from "@/types";

const grades = ["Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const subjects = ["Physics", "Maths", "Computer Science", "Environment System & Society (ESS)", "Design Technology"];

export default function UploadCurriculumPage() {
  const router = useRouter();
  const [grade, setGrade] = useState(grades[0]);
  const [subject, setSubject] = useState(subjects[0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoFileName, setVideoFileName] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [pythonCode, setPythonCode] = useState("");
  const [pythonFileName, setPythonFileName] = useState("");
  const [pythonFile, setPythonFile] = useState<File | null>(null);
  const [manualFileName, setManualFileName] = useState("");
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("Saving to database...");
    let finalCode = pythonCode;
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setStatus("You must be signed in to upload curriculum.");
        return;
      }
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (profileError) {
        const message = profileError.message ?? "Unknown error";
        const setupHint = message.toLowerCase().includes("schema cache")
          ? "Supabase tables are not created yet. Apply `supabase/schema.sql` in your Supabase SQL editor, then retry."
          : null;
        setStatus(`Unable to verify permissions: ${message}${setupHint ? ` — ${setupHint}` : ""}`);
        return;
      }
      if (profileData?.role !== "admin") {
        setStatus("Only admins can upload curriculum. Run `npm run seed:admin` to create an admin profile, then log in.");
        return;
      }

      const assets: CurriculumModule["assets"] = [];

      if (videoFile) {
        const url = await uploadFileToBucket({
          bucket: "curriculum-assets",
          file: videoFile,
          pathPrefix: `videos/${authData.user.id}`,
        });
        assets.push({ type: "video", url, label: videoFileName || videoFile.name });
      }

      const codeFileToUpload =
        pythonFile ||
        (finalCode
          ? new File([finalCode], pythonFileName || `${title.replace(/[^\w\-]+/g, "-").toLowerCase() || "code"}.py`, {
              type: "text/plain",
            })
          : null);

      if (codeFileToUpload) {
        const url = await uploadFileToBucket({
          bucket: "curriculum-assets",
          file: codeFileToUpload,
          pathPrefix: `code/${authData.user.id}`,
          fileName: pythonFileName || codeFileToUpload.name,
        });
        assets.push({ type: "code", url, label: pythonFileName || codeFileToUpload.name || "Python code" });
      }

      if (manualFile) {
        const url = await uploadFileToBucket({
          bucket: "curriculum-assets",
          file: manualFile,
          pathPrefix: `docs/${authData.user.id}`,
        });
        assets.push({ type: "doc", url, label: manualFileName || manualFile.name });
      }

      const { error } = await supabase.from("curriculum_modules").insert({
        title,
        grade,
        subject,
        module: "Drone Module",
        description,
        asset_urls: assets,
        published: true,
      });

      if (error) {
        setStatus(`Unable to save to database: ${error.message}`);
        return;
      }

      setStatus(`Saved "${title}" to the shared curriculum database.`);
      setTimeout(() => router.push("/admin"), 600);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Unable to save to database: ${message}`);
    }
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

      <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-6 space-y-4 border border-white/20">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block text-sm text-slate-300 space-y-2">
            Grade
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
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
              className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
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
            className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
            placeholder="Drone activity title"
            required
          />
        </label>

        <label className="block text-sm text-slate-300 space-y-2">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
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
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setVideoFile(file);
                setVideoFileName(file?.name ?? "");
              }}
              className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none file-accent"
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
              setManualFile(file ?? null);
              setManualFileName(file?.name ?? "");
            }}
            className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none file-accent"
          />
          {manualFileName && <p className="text-xs text-slate-400">Selected: {manualFileName}</p>}
        </label>
        </div>

        <label className="block text-sm text-slate-300 space-y-2">
          Python code (paste or link)
          <textarea
            value={pythonCode}
            onChange={(e) => setPythonCode(e.target.value)}
            className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none font-mono"
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
              setPythonFile(file ?? null);
              setPythonFileName(file?.name ?? "");
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === "string") {
                  setPythonCode(reader.result);
                }
              };
              reader.readAsText(file);
            }}
            className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none file-accent"
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
            className="px-4 py-3 rounded-xl bg-accent text-true-white font-semibold shadow-glow hover:translate-y-[-1px] transition-transform"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={() => {
              setTitle("");
              setDescription("");
              setVideoFileName("");
              setVideoFile(null);
              setPythonCode("");
              setPythonFileName("");
              setPythonFile(null);
              setManualFileName("");
              setManualFile(null);
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
