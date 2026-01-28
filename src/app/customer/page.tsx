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
  const [signingOut, startSignOut] = useTransition();
  const [dataStatus, setDataStatus] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, { completed?: boolean; score?: number; total?: number; completedAt?: string }>>({});

  useEffect(() => {
    const loadProgress = () => {
      try {
        const stored = localStorage.getItem("activityProgress");
        if (!stored) {
          setProgressMap({});
          return;
        }
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          setProgressMap(parsed);
        } else {
          setProgressMap({});
        }
      } catch {
        setProgressMap({});
      }
    };
    loadProgress();
    const onStorage = (event: StorageEvent) => {
      if (event.key === "activityProgress") {
        loadProgress();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
      if (!user) {
        setIsAuthenticated(false);
        setAuthChecked(true);
        router.replace("/login");
        return;
      }
      setIsAuthenticated(true);
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

      setAuthChecked(true);

      // If an admin somehow lands here, redirect to the admin control room.
      if (derivedRole === "admin") {
        router.replace("/admin");
      }
    };
    loadProfile();
  }, [router]);

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    let cancelled = false;

    const loadCurriculum = async () => {
      try {
        setDataStatus("Loading activities...");
        const rows = await fetchCurriculumModules({ includeUnpublished: false });
        if (cancelled) return;
        setModules(rows.map((m) => enhanceModule(m)));
        setDataStatus(null);
      } catch {
        if (cancelled) return;
        setModules([]);
        setDataStatus("Database not reachable. No activities available.");
      }
    };

    loadCurriculum();
    return () => {
      cancelled = true;
    };
  }, [authChecked, isAuthenticated, enhanceModule]);

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
  const roleSubline = "Browse activities for your grade. View code and download files.";

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
        <h2 className="text-xl font-semibold text-white">Browse activities</h2>
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
              Filter activities by grade and subject; pick one to view and download code.
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">System requirements</h2>
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-base font-semibold text-slate-100">
              For first-time users, it is recommended to install all dependencies using the Windows installer before performing the activity.
            </p>
            <a
              href="https://1drv.ms/u/c/d5c868b4d9600368/IQCspO91wHTLQINVFln61jdhAaeVZC9a_i_Tl8Xd-bU4AW4?e=gqzZN6"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-true-white shadow-glow hover:opacity-90"
              download
            >
              Download installer
            </a>
          </div>
        </div>
      </section>

      <section id="curriculum" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Activities</h2>
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
              {progressMap[String(module.id)]?.completed ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-emerald-700 font-semibold">Completed</span>
                  {typeof progressMap[String(module.id)].score === "number" && (
                    <span className="px-2 py-1 rounded-full bg-white/10 text-slate-200 border border-white/15">
                      Score {progressMap[String(module.id)].score}/{progressMap[String(module.id)].total || 5}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Not completed</p>
              )}
              <Link
                href={`/customer/activity/${module.id}`}
                className="block w-full text-center mt-2 py-2 rounded-lg bg-accent text-true-white font-semibold"
              >
                Show activity/code
              </Link>
            </div>
          ))}
        </div>
      </section>

    </main>
  );
}









