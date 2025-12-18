"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { CurriculumModule } from "@/types";
import { fetchCurriculumModules } from "@/lib/supabaseData";

export default function CustomerPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("Customer");
  const [role, setRole] = useState<string>("customer");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [userGrade, setUserGrade] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [modules, setModules] = useState<CurriculumModule[]>([]);
  const [selectedModule, setSelectedModule] = useState<CurriculumModule | null>(null);
  const [signingOut, startSignOut] = useTransition();
  const [codeDisplay, setCodeDisplay] = useState("Select a module to view code.");
  const [codeExpanded, setCodeExpanded] = useState(false);
  const [docExpanded, setDocExpanded] = useState(false);
  const [dataStatus, setDataStatus] = useState<string | null>(null);

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

  const encodeToBase64 = useCallback((text: string) => {
    if (typeof window === "undefined") {
      return Buffer.from(text, "utf-8").toString("base64");
    }
    try {
      return btoa(unescape(encodeURIComponent(text)));
    } catch {
      return btoa(text);
    }
  }, []);

  const enhanceModule = useCallback((module: CurriculumModule): CurriculumModule => {
    let codeSnippet = module.codeSnippet;
    let assets = module.assets ?? [];
    const codeIndex = assets.findIndex((a) => a.type === "code");
    const codeAsset = codeIndex >= 0 ? assets[codeIndex] : undefined;

    if (!codeSnippet && codeAsset?.url) {
      const decoded = decodeDataUrl(codeAsset.url);
      if (decoded) codeSnippet = decoded;
    }

    if (codeSnippet) {
      const dataUrl = `data:text/plain;base64,${encodeToBase64(codeSnippet)}`;
      if (codeIndex >= 0) {
        assets = assets.map((a, i) => (i === codeIndex ? { ...a, url: dataUrl } : a));
      } else {
        assets = [...assets, { type: "code", url: dataUrl, label: codeAsset?.label || "Python code" }];
      }
    }

    return { ...module, codeSnippet, assets };
  }, [decodeDataUrl, encodeToBase64]);

  useEffect(() => {
    const loadProfile = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, role, grade")
        .eq("id", user.id)
        .maybeSingle();
      const derivedRole = profileData?.role ?? user.user_metadata.role ?? "customer";
      setRole(derivedRole);
      setFullName(profileData?.full_name ?? user.user_metadata.full_name ?? user.email ?? "Customer");
      const gradeFromMeta = (profileData as { grade?: string } | null)?.grade ?? user.user_metadata?.grade ?? null;
      if (gradeFromMeta) {
        setGradeFilter(gradeFromMeta);
        setUserGrade(gradeFromMeta);
      }

      // If an admin somehow lands here, redirect to the admin control room.
      if (derivedRole === "admin") {
        router.replace("/admin");
      }
    };
    loadProfile();
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    const loadCurriculum = async () => {
      try {
        setDataStatus("Loading curriculum...");
        const rows = await fetchCurriculumModules({ includeUnpublished: false });
        if (cancelled) return;
        setModules(rows.map((m) => enhanceModule(m)));
        setDataStatus(null);
      } catch {
        if (cancelled) return;
        setModules([]);
        setDataStatus("Database not reachable. No curriculum available.");
      }
    };

    loadCurriculum();
    return () => {
      cancelled = true;
    };
  }, [enhanceModule]);

  const gradeOptions = useMemo(() => {
    if (userGrade) return [userGrade];
    const uniqueGrades = Array.from(new Set(modules.map((m) => m.grade)));
    return ["all", ...uniqueGrades];
  }, [modules, userGrade]);

  const filteredModules = useMemo(() => {
    return modules.filter((m) => {
      const effectiveGrade = userGrade ?? gradeFilter;
      const gradeMatch = effectiveGrade === "all" || m.grade === effectiveGrade;
      const subjectMatch = subjectFilter === "all" || m.subject === subjectFilter;
      return gradeMatch && subjectMatch;
    });
  }, [gradeFilter, subjectFilter, modules, userGrade]);

  const formatSubject = (subject: string) => (subject.toLowerCase() === "maths" ? "Mathematics" : subject);

  const roleLabel = role === "teacher" ? "Teacher" : "Student";
  const roleSubline = "Browse curriculum for your grade. View code and download files.";

  useEffect(() => {
    const loadCode = async () => {
      if (!selectedModule) {
        setCodeDisplay("Select a module to view code.");
        return;
      }
      if (selectedModule.codeSnippet) {
        setCodeDisplay(selectedModule.codeSnippet);
        return;
      }
      const codeAsset = selectedModule.assets.find((a) => a.type === "code");
      if (codeAsset?.url) {
        const url = codeAsset.url;
        const dataDecoded = decodeDataUrl(url);
        if (dataDecoded) {
          setCodeDisplay(dataDecoded);
          return;
        }
        const canFetch =
          url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:") || url.startsWith("blob:");
        if (canFetch) {
          try {
            const res = await fetch(url);
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
  }, [selectedModule, decodeDataUrl]);

  useEffect(() => {
    // reset expanded views when switching modules
    setCodeExpanded(false);
    setDocExpanded(false);
  }, [selectedModule]);

  const triggerDownload = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    }
  };

  const downloadCode = async () => {
    if (!selectedModule) return;
    if (selectedModule.codeSnippet) {
      const blob = new Blob([selectedModule.codeSnippet], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedModule.title.replace(/\s+/g, "-").toLowerCase()}.py`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const codeAsset = selectedModule.assets.find((a) => a.type === "code");
    if (codeAsset?.url) {
      await triggerDownload(codeAsset.url, codeAsset.label || "code.py");
    }
  };

  const downloadDoc = async () => {
    if (!selectedModule) return;
    const docAsset = selectedModule.assets.find((a) => a.type === "doc");
    if (docAsset?.url) {
      await triggerDownload(docAsset.url, docAsset.label || "document");
    }
  };

  const codeFileName =
    selectedModule?.assets.find((a) => a.type === "code")?.label ||
    selectedModule?.assets.find((a) => a.type === "code")?.url?.split("/").pop() ||
    (selectedModule ? `${selectedModule.title}.py` : "");

  const isExpanded = codeExpanded || docExpanded;
  const panelSize = (expanded: boolean) =>
    expanded ? "aspect-auto max-h-[1155px] min-h-[630px]" : "aspect-[210/297] max-h-[907px] min-h-[378px]";

  const toggleCodeExpanded = () => {
    if (codeExpanded) {
      setCodeExpanded(false);
    } else {
      setCodeExpanded(true);
      setDocExpanded(false);
    }
  };

  const toggleDocExpanded = () => {
    if (docExpanded) {
      setDocExpanded(false);
    } else {
      setDocExpanded(true);
      setCodeExpanded(false);
    }
  };

  return (
    <main className="section-padding space-y-8">
      {dataStatus && (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          {dataStatus}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-accent-strong uppercase text-xs tracking-[0.2em]">{roleLabel}</p>
          <h1 className="text-3xl font-semibold text-white leading-tight">Hi {fullName}</h1>
          <p className="text-slate-300 text-sm">{roleSubline}</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/"
            className="px-4 py-2 rounded-xl border border-white/10 text-sm text-slate-900 text-center hover:border-accent-strong"
          >
            Back to Home
          </Link>
          <button
            onClick={() =>
              startSignOut(async () => {
                await supabase.auth.signOut();
                router.push("/login");
              })
            }
            className="px-4 py-2 rounded-xl bg-accent text-true-white font-semibold shadow-glow disabled:opacity-60"
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Browse curriculum</h2>
        <div className="glass-panel rounded-2xl p-4 grid sm:grid-cols-3 gap-3">
          <label className="text-sm text-slate-200 space-y-1">
            Grade
            <select
              className="w-full rounded-lg bg-white/5 border border-slate-400/60 px-3 py-2"
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              disabled={!!userGrade}
            >
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-200 space-y-1">
            Subject
            <select
              className="w-full rounded-lg bg-white/5 border border-slate-400/60 px-3 py-2"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="all">All</option>
              {Array.from(new Set(modules.map((m) => m.subject))).map((s) => (
                <option key={s} value={s}>
                  {formatSubject(s)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <div className="w-full rounded-xl border border-white/10 p-3 bg-white/5 text-sm text-slate-300">
              Filter modules by grade and subject; pick one to view and download code.
            </div>
          </div>
        </div>
      </div>

      <section id="curriculum" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Curriculum</h2>
          <p className="text-sm text-slate-400">Showing {filteredModules.length} modules</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {filteredModules.map((module) => (
            <div key={module.id} className="glass-panel rounded-2xl p-5 space-y-3 hover:border-accent-strong">
              <div className="flex items-center justify-between text-xs text-accent-strong uppercase tracking-[0.2em]">
                <span>Grade {module.grade}</span>
                <span>{formatSubject(module.subject)}</span>
              </div>
              <h3 className="text-lg font-semibold text-white">{module.title}</h3>
              <button
                className="w-full mt-2 py-2 rounded-lg bg-accent text-true-white font-semibold"
                onClick={() => {
                  if (selectedModule && selectedModule.id === module.id) {
                    setSelectedModule(null);
                  } else {
                    setSelectedModule(module);
                    document.getElementById("code")?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              >
                {selectedModule && selectedModule.id === module.id ? "Hide curriculum/code" : "Show curriculum/code"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {selectedModule && (
        <section id="code" className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-white mb-2">MODULE MATERIALS</h2>
            <p className="text-xl text-slate-100 mb-1">{selectedModule.title}</p>
            <p className="text-lg text-slate-300">{selectedModule.description}</p>
          </div>
          <div className={`grid gap-4 items-stretch ${isExpanded ? "md:grid-cols-1" : "md:grid-cols-2"}`}>
            {!docExpanded && (
              <div className={`glass-panel rounded-2xl p-4 border border-white/10 h-full ${panelSize(codeExpanded)} flex flex-col`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-white">Code</h3>
                    <p className="text-xs text-slate-400">{codeFileName}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-accent-strong underline disabled:text-accent-strong/40 disabled:opacity-70"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadCode();
                      }}
                      disabled={!selectedModule.codeSnippet && !selectedModule.assets.find((a) => a.type === "code")}
                    >
                      Download
                    </button>
                    <button className="text-xs text-accent-strong underline" onClick={toggleCodeExpanded}>
                      {codeExpanded ? "Collapse" : "Expand"}
                    </button>
                  </div>
                </div>
                <div className="bg-black rounded-xl border border-white/15 shadow-inner overflow-hidden flex-1">
                  <pre className="p-4 text-sm text-true-white overflow-auto h-full whitespace-pre-wrap">
                    <code>{codeDisplay || "No code available."}</code>
                  </pre>
                </div>
              </div>
            )}
            {!codeExpanded && (
              <div className={`glass-panel rounded-2xl p-4 border border-white/10 h-full ${panelSize(docExpanded)} flex flex-col`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-white">SOP</h3>
                    <p className="text-xs text-slate-400">
                      {selectedModule.assets.find((a) => a.type === "doc")?.label || "Document"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-slate-900 underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadDoc();
                      }}
                    >
                      Download
                    </button>
                    <button className="text-xs text-accent-strong underline" onClick={toggleDocExpanded}>
                      {docExpanded ? "Collapse" : "Expand"}
                    </button>
                  </div>
                </div>
                <div className="bg-black/20 rounded-xl border border-white/10 shadow-inner overflow-hidden flex-1">
                  {selectedModule.assets.filter((a) => a.type === "doc").length > 0 ? (
                    <iframe
                      src={selectedModule.assets.find((a) => a.type === "doc")?.url}
                      title={selectedModule.assets.find((a) => a.type === "doc")?.label}
                      className="w-full h-full"
                    />
                  ) : (
                    <div className="p-4 text-sm text-slate-300">No documents available.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}








