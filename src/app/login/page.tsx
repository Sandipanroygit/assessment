"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type AuthMode = "login" | "signup";
type UserRole = "admin" | "teacher" | "student";
type Profile = { full_name?: string; role?: string };

const gradeOptions = ["Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];

export default function LoginPage() {
  const router = useRouter();
  const defaultAdminEmail = process.env.NEXT_PUBLIC_DEFAULT_ADMIN_EMAIL ?? "";
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("teacher");
  const [grade, setGrade] = useState(gradeOptions[0]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.warn("Profile fetch error", error.message);
      return null;
    }
    return data;
  }, []);

  const routeByRole = useCallback(
    (roleValue?: string, emailOverride?: string | null) => {
      const isDefaultAdmin = (emailOverride ?? email).toLowerCase() === defaultAdminEmail.toLowerCase();
      const computedRole = roleValue ?? (isDefaultAdmin ? "admin" : undefined);
      if (computedRole === "admin" || isDefaultAdmin) {
        router.push("/admin");
      } else {
        router.push("/customer");
      }
    },
    [defaultAdminEmail, email, router]
  );

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (user) {
        const profile = await fetchProfile(user.id);
        routeByRole(profile?.role ?? user.user_metadata.role, user.email);
      }
    };
    checkSession();
  }, [fetchProfile, routeByRole]);

  const handleRoleChange = (nextRole: UserRole) => {
    setRole(nextRole);
    setEmail("");
    setPassword("");
    if (nextRole === "student" && !grade) {
      setGrade(gradeOptions[0]);
    }
  };

  const handleLogin = async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setStatus("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    if (!email.trim() || !password.trim()) {
      setStatus("Email and password are required.");
      return;
    }
    setLoading(true);
    setStatus(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setStatus(error?.message ?? "Unable to sign in. Check credentials.");
      setLoading(false);
      return;
    }
    const profile = await fetchProfile(data.user.id);
    setStatus(`Hi ${profile?.full_name ?? data.user.email}! Redirecting...`);
    routeByRole(profile?.role ?? data.user.user_metadata.role, data.user.email);
  };

  const handleSignup = async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setStatus("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    setLoading(true);
    setStatus(null);
    if (!email.trim() || !password.trim()) {
      setStatus("Email and password are required.");
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setStatus("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }
    if (role === "student" && !grade) {
      setStatus("Please select your grade to continue.");
      setLoading(false);
      return;
    }
    const metadata: Record<string, string> = { full_name: fullName, role };
    if (role === "student") {
      metadata.grade = grade;
    }
    const redirectTo =
      process.env.NEXT_PUBLIC_SITE_URL ??
      (typeof window !== "undefined" ? `${window.location.origin}/login` : undefined);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: redirectTo,
      },
    });
    if (error || !data.user) {
      setStatus(error?.message ?? "Unable to sign up.");
      setLoading(false);
      return;
    }
    setStatus("Account created. Check your email to confirm, then sign in.");
    setMode("login");
    setLoading(false);
  };

  return (
    <main className="min-h-screen section-padding flex items-center justify-center">
      <div className="relative max-w-3xl w-full">
        <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-accent/10 via-accent-strong/5 to-transparent blur-3xl" />
        <div className="rounded-3xl border border-white/12 bg-surface/90 shadow-glow p-8 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Access</p>
              <h2 className="text-2xl font-semibold text-white">Login or create account</h2>
            </div>
            <Link
              href="/"
              className="text-xs px-3 py-1 rounded-full border border-white/10 text-slate-200 hover:border-accent-strong"
            >
              Back to home
            </Link>
          </div>

          <div className="flex gap-2 bg-white/5 p-1 rounded-xl">
            <button
              onClick={() => setMode("login")}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                  mode === "login" ? "bg-accent text-true-white shadow-glow" : "text-white"
                }`}
              >
              Log In
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                mode === "signup" ? "bg-accent text-true-white shadow-glow" : "text-white"
              }`}
            >
              Sign Up
            </button>
          </div>

          {mode === "signup" && (
            <label className="block text-sm text-slate-300 space-y-2">
              Role
              <select
                className="w-full rounded-xl border border-slate-500/70 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
                value={role}
                onChange={(e) => handleRoleChange(e.target.value as UserRole)}
              >
                <option value="teacher" className="text-black">
                  Teacher
                </option>
                <option value="student" className="text-black">
                  Student
                </option>
              </select>
            </label>
          )}

          {mode === "signup" && (
            <label className="block text-sm text-slate-300 space-y-2">
              Full name
              <input
                type="text"
                className="w-full rounded-xl border border-slate-500/70 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
                placeholder="Your name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>
          )}

          {role === "student" && mode === "signup" && (
            <label className="block text-sm text-slate-300 space-y-2">
              Grade
              <select
                className="w-full rounded-xl border border-slate-500/70 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              >
                {gradeOptions.map((option) => (
                  <option key={option} value={option} className="text-black">
                    {option}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-sm text-slate-300 space-y-2">
            Email
            <input
              type="email"
              className="w-full rounded-xl border border-slate-500/70 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="block text-sm text-slate-300 space-y-2">
            Password
            <input
              type="password"
              className="w-full rounded-xl border border-slate-500/70 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {status && (
            <div className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent-strong">
              {status}
            </div>
          )}

          <button
            onClick={mode === "login" ? handleLogin : handleSignup}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-accent text-true-white font-semibold shadow-glow hover:translate-y-[-1px] transition-transform disabled:opacity-70"
          >
            {loading ? "Please wait..." : mode === "login" ? "Log In" : "Create account"}
          </button>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1">
            <p className="text-xs text-slate-400 uppercase tracking-[0.14em]">What happens next</p>
            <p className="text-sm text-slate-200">
              Admins land on the admin suite (curriculum uploads, products, analytics). Teachers land on review and publish. Students get read-only browsing.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
