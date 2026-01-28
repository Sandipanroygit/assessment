"use client";

/* eslint-disable @typescript-eslint/no-unused-vars */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, DragEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CurriculumModule, Product } from "@/types";
import { useRouter } from "next/navigation";
import { dataUrlToFile, fetchCurriculumModules, fetchProducts, uploadFileToBucket } from "@/lib/supabaseData";
type AdminUser = { id: string; full_name: string; role: string; displayRole: string; created_at?: string | null };

const orderActions = ["Track status", "View receipts", "Export reports"];

const gradeOptions = ["Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const subjectOptions = ["Physics", "Mathematics", "Computer Science", "Environment System & Society (ESS)", "Design Technology"];

const isMissingTableSchemaCacheError = (message: string) =>
  message.toLowerCase().includes("schema cache") && message.toLowerCase().includes("could not find the table");

const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    value,
  );

const formatJoinedDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString() : "-");
const sanitizeSegment = (value: string) =>
  value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "item";
const studentLabelFromFile = (fileName: string) => {
  const base = fileName.replace(/\.json$/i, "");
  const parts = base.split("-");
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) parts.pop();
  const label = parts.join(" ").replace(/-+/g, " ").trim();
  return label || "Student";
};
const mapRoleLabel = (role?: string | null) => {
  if (role === "admin") return "Admin";
  if (role === "teacher") return "Teacher";
  if (role === "student") return "Student";
  return "Student"; // default display for legacy "customer" roles
};
const shortId = (id: string) => (id.length <= 8 ? id : `${id.slice(0, 6)}...${id.slice(-4)}`);

type SentimentFile = {
  moduleId: string;
  moduleTitle: string;
  studentLabel: string;
  fileName: string;
  path: string;
  url: string;
  createdAt?: string | null;
};

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [signingOut, startSignOut] = useTransition();
  const router = useRouter();
  const [curriculumRows, setCurriculumRows] = useState<CurriculumModule[]>([]);
  const [productRows, setProductRows] = useState<Product[]>([]);
  const [userRows, setUserRows] = useState<AdminUser[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [sentimentFiles, setSentimentFiles] = useState<SentimentFile[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCurriculumId, setEditingCurriculumId] = useState<string | null>(null);
  const [deletingSentimentPath, setDeletingSentimentPath] = useState<string | null>(null);
  const curriculumEditRef = useRef<HTMLDivElement | null>(null);
  const [dataStatus, setDataStatus] = useState<string | null>(null);
  const [sentimentStatus, setSentimentStatus] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    price: "",
    deliveryEta: "",
    expectedDelivery: "",
    stock: "",
    imageData: "",
    imageName: "",
    removeImage: false,
    galleryData: [] as string[],
    galleryNames: [] as string[],
  });
  const [curriculumForm, setCurriculumForm] = useState({
    title: "",
    grade: "",
    subject: "",
    module: "",
    description: "",
    assets: "",
  });
  const stats = useMemo(
    () => [
      { label: "Active modules", value: String(curriculumRows.length), delta: "Manage drone modules" },
      { label: "Products live", value: String(productRows.length), delta: "Ready in shop" },
      { label: "Orders this week", value: "0", delta: "No orders yet" },
      { label: "Registered users", value: String(userRows.length), delta: "Total signups to date" },
    ],
    [curriculumRows.length, productRows.length, userRows.length],
  );

  const reorderCurriculum = (sourceId: string, targetId: string) => {
    setCurriculumRows((prev) => {
      const from = prev.findIndex((item) => item.id === sourceId);
      const to = prev.findIndex((item) => item.id === targetId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleDragStart = (id: string) => setDraggingId(id);
  const handleDragEnd = () => setDraggingId(null);
  const handleDragOver = (event: DragEvent<HTMLTableRowElement>) => event.preventDefault();
  const handleDropOn = (targetId: string) => {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    reorderCurriculum(draggingId, targetId);
    setDraggingId(null);
  };

  useEffect(() => {
    const loadProfile = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        setAuthStatus("Please sign in to access the admin dashboard.");
        setIsAdmin(false);
        router.push("/login");
        return;
      }
      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        const setupHint = isMissingTableSchemaCacheError(error.message)
          ? "Supabase tables are not created yet. Apply `supabase/schema.sql` in your Supabase SQL editor, then retry."
          : null;
        setAuthStatus(`Unable to verify admin access: ${error.message}${setupHint ? ` â€” ${setupHint}` : ""}`);
        setIsAdmin(false);
        return;
      }
      const role = profileData?.role;
      const nextIsAdmin = role === "admin";
      setIsAdmin(nextIsAdmin);
      setAuthStatus(
        nextIsAdmin
          ? null
          : "Admin access is restricted by database RLS. Run `npm run seed:admin` to create an admin profile, then log in with that account.",
      );
    };
    loadProfile();
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!isAdmin) return;
      setDataStatus("Loading shared data...");
      try {
        const [nextCurriculum, nextProducts, usersResponse] = await Promise.all([
          fetchCurriculumModules({ includeUnpublished: true }),
          fetchProducts(),
          supabase.from("profiles").select("id,full_name,role,created_at").order("created_at", { ascending: false }),
        ]);
        if (cancelled) return;

        if (usersResponse.error) {
          throw usersResponse.error;
        }

        const users = (usersResponse.data ?? []).map((user) => ({
          id: user.id,
          full_name: user.full_name ?? "Unnamed user",
          role: user.role ?? "customer",
          displayRole: mapRoleLabel(user.role),
          created_at: user.created_at,
        }));
        setCurriculumRows(nextCurriculum);
        setProductRows(nextProducts);
        setUserRows(users);
        setDataStatus(null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to load data";
        setCurriculumRows([]);
        setProductRows([]);
        setUserRows([]);
        setDataStatus(`Database not reachable (${message}).`);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    const loadSentiment = async () => {
      if (!isAdmin) return;
      if (curriculumRows.length === 0) {
        setSentimentFiles([]);
        setSentimentStatus("No activities found yet.");
        return;
      }
      setSentimentStatus("Loading sentiment summaries...");
      try {
        const bucket = supabase.storage.from("curriculum-assets");
        const collected: SentimentFile[] = [];
        // Fetch sentiment files per activity folder
        for (const mod of curriculumRows) {
          const folder = `sentiment-metrics/${sanitizeSegment(mod.title)}-${sanitizeSegment(mod.id)}`;
          const { data, error } = await bucket.list(folder, { limit: 100, offset: 0, sortBy: { column: "name", order: "desc" } });
          if (error || !data) continue;
          data
            .filter((item) => item.name.toLowerCase().endsWith(".json"))
            .forEach((item) => {
              const path = `${folder}/${item.name}`;
              const { data: publicUrl } = bucket.getPublicUrl(path);
              collected.push({
                moduleId: mod.id,
                moduleTitle: mod.title,
                studentLabel: studentLabelFromFile(item.name),
                fileName: item.name,
                path,
                url: publicUrl.publicUrl,
                createdAt: (item as { created_at?: string; updated_at?: string }).created_at || (item as { updated_at?: string }).updated_at,
              });
            });
        }
        if (cancelled) return;
        const sorted = collected.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        setSentimentFiles(sorted);
        setSentimentStatus(sorted.length ? null : "No sentiment summaries yet.");
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to load sentiment files";
        setSentimentFiles([]);
        setSentimentStatus(message);
      }
    };
    void loadSentiment();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, curriculumRows]);

  const handleDeleteSentimentFile = async (file: SentimentFile) => {
    if (deletingSentimentPath) return;
    setDeletingSentimentPath(file.path);
    setSentimentStatus(`Deleting ${file.fileName}...`);
    try {
      const { error } = await supabase.storage.from("curriculum-assets").remove([file.path]);
      if (error) throw error;
      setSentimentFiles((prev) => prev.filter((item) => item.path !== file.path));
      setSentimentStatus(`Deleted ${file.fileName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete file";
      setSentimentStatus(`Delete failed: ${message}`);
    } finally {
      setDeletingSentimentPath(null);
    }
  };

  return (
    <main className="section-padding space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-accent-strong uppercase text-xs tracking-[0.2em]">Admin</p>
          <h1 className="text-3xl font-semibold text-white">Welcome Admin to your Control Room</h1>
          <p className="text-slate-300 text-sm mt-2">
            Manage curriculum, products, orders, and promotions in one dashboard.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/"
            className="px-4 py-2 rounded-xl border border-white/10 text-sm text-slate-900 hover:border-accent-strong"
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

      {dataStatus && (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          {dataStatus}
        </div>
      )}
      {authStatus && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {authStatus}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((item) => (
          <div key={item.label} className="glass-panel rounded-2xl p-4 space-y-2">
            <p className="text-sm text-slate-400">{item.label}</p>
            <p className="text-2xl font-semibold text-white">{item.value}</p>
            <p className="text-xs text-accent-strong">{item.delta}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Drone Activities</h2>
          <div className="flex gap-2">
            <Link
              href="/admin/questions"
              className="text-sm px-3 py-2 rounded-lg font-semibold border border-accent/40 text-accent-strong hover:border-accent hover:text-true-white transition"
            >
              Manage questions
            </Link>
            <Link
              href="/admin/upload"
              className={`text-sm px-3 py-2 rounded-lg font-semibold shadow-glow ${
                isAdmin ? "bg-accent text-true-white" : "bg-white/5 text-slate-400 pointer-events-none"
              }`}
            >
              Upload content
            </Link>
          </div>
        </div>
        <p className="text-sm text-slate-300">
          List every drone activity with grade and subject before publishing to students.
        </p>
        <div className="overflow-auto">
          <table className="min-w-full text-sm text-slate-200">
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/10">
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3">Grade</th>
                <th className="py-2 pr-3">Subject</th>
                <th className="py-2 pr-3">Assets</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {curriculumRows.length === 0 ? (
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-3 text-slate-300" colSpan={5}>
                    No curriculum uploaded yet. Click â€œUpload contentâ€ to add your first drone activity.
                  </td>
                </tr>
              ) : (
                curriculumRows.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-white/5 ${draggingId === item.id ? "opacity-60" : ""}`}
                    draggable
                    onDragStart={() => handleDragStart(item.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(event) => handleDragOver(event)}
                    onDrop={() => handleDropOn(item.id)}
                  >
                    <td className="py-2 pr-3 font-semibold text-white">{item.title}</td>
                    <td className="py-2 pr-3 text-slate-300">{item.grade}</td>
                    <td className="py-2 pr-3 text-slate-300">{item.subject}</td>
                    <td className="py-2 pr-3 text-slate-300">
                      {item.assets.map((asset) => asset.label).join(", ")}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="px-3 py-1 rounded-lg bg-white/10 border border-white/15 text-white text-xs"
                          onClick={() => {
                            setEditingCurriculumId(item.id);
                            setCurriculumForm({
                              title: item.title,
                              grade: item.grade,
                              subject: item.subject,
                              module: item.module,
                              description: item.description,
                              assets: item.assets.map((a) => a.label).join(", "),
                            });
                            requestAnimationFrame(() => {
                              curriculumEditRef.current?.scrollIntoView({ behavior: "smooth" });
                            });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="px-3 py-1 rounded-lg border border-red-600/70 text-red-400 text-xs hover:bg-red-600/25 transition"
                          onClick={async () => {
                            try {
                              if (!isAdmin) {
                                setDataStatus("Admin access is required to delete curriculum.");
                                return;
                              }
                              setDataStatus("Deleting curriculum item...");
                              const { error } = await supabase.from("curriculum_modules").delete().eq("id", item.id);
                              if (error) {
                                setDataStatus(`Delete failed: ${error.message}`);
                                return;
                              }
                              setCurriculumRows((prev) => prev.filter((c) => c.id !== item.id));
                              setDataStatus(null);
                            } catch (err) {
                              const message = err instanceof Error ? err.message : "Unknown error";
                              setDataStatus(`Delete failed: ${message}`);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Product catalogue</h2>
          <Link href="/shop" className="text-sm text-accent-strong hover:underline">
            View shop
          </Link>
        </div>
        <p className="text-sm text-slate-300">
          List every shop item and trigger edit or delete actions directly from the control room.
        </p>
        <div className="flex justify-end">
          <Link
            href="/admin/products/new"
            className={`text-sm px-3 py-2 rounded-lg font-semibold shadow-glow ${
              isAdmin ? "bg-accent text-true-white" : "bg-white/5 text-slate-400 pointer-events-none"
            }`}
          >
            List new product
          </Link>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm text-slate-200">
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/10">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">SKU</th>
                <th className="py-2 pr-3">Price</th>
                <th className="py-2 pr-3">Delivery</th>
                <th className="py-2 pr-3">Expected</th>
                <th className="py-2 pr-3">Stock</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {productRows.map((product) => (
                <tr key={product.id} className="border-b border-white/5">
                  <td className="py-2 pr-3 font-semibold text-white">{product.name}</td>
                  <td className="py-2 pr-3 text-slate-300">{product.sku}</td>
                  <td className="py-2 pr-3">{formatPrice(product.price)}</td>
                  <td className="py-2 pr-3">{product.deliveryEta}</td>
                  <td className="py-2 pr-3">{product.expectedDelivery}</td>
                  <td className="py-2 pr-3">{product.stock}</td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-2">
                      <Link
                        href={`/shop/${product.id}`}
                className="px-3 py-1 rounded-lg border border-white/15 text-white text-xs hover:border-accent-strong"
              >
                View
              </Link>
              <button
                className="px-3 py-1 rounded-lg bg-white/10 border border-white/15 text-white text-xs"
                onClick={() => {
                  setEditingId(product.id);
                  setEditForm({
                    name: product.name,
                    price: String(product.price),
                            deliveryEta: product.deliveryEta,
                            expectedDelivery: product.expectedDelivery,
                            stock: String(product.stock),
                            imageData: "",
                            imageName: "",
                            removeImage: false,
                            galleryData:
                              product.galleryData ??
                              product.gallery ??
                              (product.imageData ? [product.imageData] : product.image ? [product.image] : []),
                            galleryNames:
                              product.galleryData?.map((_, idx) => `Image ${idx + 1}`) ??
                              product.gallery?.map((_, idx) => `Image ${idx + 1}`) ??
                              (product.image ? ["Image 1"] : []),
                          });
                        }}
                      >
                        Edit
                      </button>
              <button
                        className="px-3 py-1 rounded-lg border border-red-600/70 text-red-400 text-xs hover:bg-red-600/25 transition"
                        onClick={async () => {
                          try {
                            if (!isAdmin) {
                              setDataStatus("Admin access is required to delete products.");
                              return;
                            }
                            setDataStatus("Deleting product...");
                            const { error } = await supabase.from("products").delete().eq("id", product.id);
                            if (error) {
                              // If DB delete fails, fall back to local removal so the UI remains usable.
                              setDataStatus(`Delete failed (using local fallback): ${error.message}`);
                            } else {
                              setDataStatus(null);
                            }
                            setProductRows((prev) => prev.filter((p) => p.id !== product.id));
                            if (editingId === product.id) {
                              setEditingId(null);
                            }
                          } catch (err) {
                            const message = err instanceof Error ? err.message : "Unknown error";
                            // Last-resort fallback: remove locally so the button isn't a no-op.
                            setProductRows((prev) => prev.filter((p) => p.id !== product.id));
                            if (editingId === product.id) {
                              setEditingId(null);
                            }
                            setDataStatus(`Delete failed (local fallback applied): ${message}`);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Sentiment summaries</h2>
          <span className="text-sm text-slate-400">{sentimentFiles.length} files</span>
        </div>
        <p className="text-sm text-slate-300">JSON summaries from MoodAI guided questions, grouped by activity.</p>
        {sentimentStatus && (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">{sentimentStatus}</div>
        )}
        <div className="overflow-auto">
          <table className="min-w-full text-sm text-slate-200">
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/10">
                <th className="py-2 pr-3">Activity</th>
                <th className="py-2 pr-3">Student</th>
                <th className="py-2 pr-3">File</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sentimentFiles.length === 0 ? (
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-3 text-slate-300" colSpan={4}>
                    No sentiment summaries yet.
                  </td>
                </tr>
              ) : (
                sentimentFiles.map((file) => (
                  <tr key={file.path} className="border-b border-white/5">
                    <td className="py-2 pr-3 font-semibold text-white">{file.moduleTitle}</td>
                    <td className="py-2 pr-3 text-slate-300">{file.studentLabel}</td>
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
                      <button
                        type="button"
                        onClick={() => void handleDeleteSentimentFile(file)}
                        disabled={deletingSentimentPath === file.path}
                        className="ml-2 px-3 py-1 rounded-lg bg-rose-600 text-true-white font-semibold text-xs border border-rose-500 hover:bg-rose-500 hover:border-rose-400 disabled:opacity-50"
                      >
                        {deletingSentimentPath === file.path ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Registered users</h2>
          <span className="text-sm text-slate-400">{userRows.length} total</span>
        </div>
        <p className="text-sm text-slate-300">See everyone who has signed up for the platform.</p>
        <div className="overflow-auto">
          <table className="min-w-full text-sm text-slate-200">
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/10">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">User ID</th>
                <th className="py-2 pr-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {userRows.length === 0 ? (
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-3 text-slate-300" colSpan={3}>
                    No users found yet. New accounts will appear here automatically after signup.
                  </td>
                </tr>
              ) : (
                userRows.map((user) => (
                  <tr key={user.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 font-semibold text-white">{user.full_name}</td>
                    <td className="py-2 pr-3 text-slate-300">{user.displayRole}</td>
                    <td className="py-2 pr-3 text-slate-400 font-mono">{shortId(user.id)}</td>
                    <td className="py-2 pr-3 text-slate-300">{formatJoinedDate(user.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingId && (
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Edit product</h3>
            <button
              className="text-sm px-3 py-1 rounded-lg border border-white/10 text-white hover:border-accent-strong"
              onClick={() => setEditingId(null)}
            >
              Cancel
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block text-sm text-slate-300 space-y-2">
              Name
              <input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block text-sm text-slate-300 space-y-2">
              Price (â‚¹)
              <input
                type="number"
                value={editForm.price}
                onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))}
                className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block text-sm text-slate-300 space-y-2">
              Delivery window
              <input
                value={editForm.deliveryEta}
                onChange={(e) => setEditForm((f) => ({ ...f, deliveryEta: e.target.value }))}
                className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block text-sm text-slate-300 space-y-2">
              Expected delivery
              <input
                value={editForm.expectedDelivery}
                onChange={(e) => setEditForm((f) => ({ ...f, expectedDelivery: e.target.value }))}
                className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block text-sm text-slate-300 space-y-2">
              Stock
              <input
                type="number"
                value={editForm.stock}
                onChange={(e) => setEditForm((f) => ({ ...f, stock: e.target.value }))}
                className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block text-sm text-slate-300 space-y-2">
              Replace images (up to 3)
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = e.target.files ? Array.from(e.target.files).slice(0, 3) : [];
                  if (!files.length) {
                    setEditForm((f) => ({
                      ...f,
                      imageData: "",
                      imageName: "",
                      galleryData: [],
                      galleryNames: [],
                      removeImage: false,
                    }));
                    return;
                  }
                  const readers = files.map(
                    (file) =>
                      new Promise<string>((resolve) => {
                        const r = new FileReader();
                        r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
                        r.readAsDataURL(file);
                      }),
                  );
                  Promise.all(readers).then((dataUrls) => {
                    setEditForm((f) => ({
                      ...f,
                      imageData: dataUrls[0] ?? "",
                      imageName: files[0]?.name ?? "",
                      galleryData: dataUrls,
                      galleryNames: files.map((f) => f.name),
                      removeImage: false,
                    }));
                  });
                }}
                className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none file-accent"
              />
              {editForm.galleryNames.length > 0 && (
                <p className="text-xs text-slate-400">
                  Selected ({editForm.galleryNames.length}/3): {editForm.galleryNames.join(", ")}
                </p>
              )}
              {editForm.galleryData.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {editForm.galleryData.map((img, idx) => (
                    <div key={idx} className="relative h-14 w-14 rounded-lg overflow-hidden border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={`Preview ${idx + 1}`} className="object-cover h-full w-full" />
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="text-xs text-red-200 underline"
                onClick={() =>
                  setEditForm((f) => ({
                    ...f,
                    imageData: "",
                    imageName: "",
                    galleryData: [],
                    galleryNames: [],
                    removeImage: true,
                  }))
                }
              >
                Remove image(s)
              </button>
            </label>
          </div>
          <div className="flex gap-3">
            <button
              className="px-4 py-2 rounded-xl bg-accent text-slate-900 font-semibold shadow-glow hover:translate-y-[-1px] transition-transform"
              onClick={async () => {
                if (!editingId) return;
                try {
                  if (!isAdmin) {
                    setDataStatus("Admin access is required to edit products.");
                    return;
                  }
                  setDataStatus("Saving product changes...");

                  const payload: Record<string, unknown> = {
                    name: editForm.name,
                    price: Number(editForm.price) || 0,
                    delivery_eta: editForm.deliveryEta,
                    stock: Number(editForm.stock) || 0,
                  };

                  let nextImageUrl: string | null | undefined = undefined;
                  let nextGalleryUrls: string[] | undefined = undefined;
                  const hasNewImages = editForm.galleryData.length > 0;

                  if (editForm.removeImage) {
                    nextImageUrl = null;
                    nextGalleryUrls = [];
                  } else if (hasNewImages) {
                    const { data: authData } = await supabase.auth.getUser();
                    const userId = authData.user?.id ?? "anonymous";
                    const files = editForm.galleryData.slice(0, 3).map((dataUrl, idx) => {
                      const name = editForm.galleryNames[idx] || editForm.galleryNames[0] || editForm.imageName || `product-image-${idx + 1}.jpg`;
                      return dataUrlToFile(dataUrl, name);
                    });
                    const uploaded = await Promise.all(
                      files.map((file) =>
                        uploadFileToBucket({
                          bucket: "product-images",
                          file,
                          pathPrefix: userId,
                          fileName: file.name,
                        }),
                      ),
                    );
                    nextGalleryUrls = uploaded;
                    nextImageUrl = uploaded[0] ?? "";
                  }

                  if (typeof nextImageUrl !== "undefined") {
                    payload.image_url = nextImageUrl;
                  }
                  if (typeof nextGalleryUrls !== "undefined") {
                    payload.gallery_urls = nextGalleryUrls;
                  }

                  const { error } = await supabase.from("products").update(payload).eq("id", editingId);
                  if (error) {
                    const isGalleryErr = /gallery_urls/i.test(error.message || "");
                    const isBadReq = (error as { status?: number })?.status === 400;
                    if (isGalleryErr || isBadReq) {
                      const retryPayload = { ...payload };
                      delete (retryPayload as Record<string, unknown>).gallery_urls;
                      const { error: retryError } = await supabase.from("products").update(retryPayload).eq("id", editingId);
                      if (retryError) {
                        // fallback to local update so the UI responds even if DB rejects
                        setDataStatus(`Save failed (local update only): ${retryError.message}`);
                      }
                    } else {
                      setDataStatus(`Save failed (local update only): ${error.message}`);
                    }
                  }

                  setProductRows((prev) =>
                    prev.map((p) => {
                      if (p.id !== editingId) return p;
                      const nextImage = nextImageUrl === null ? "" : nextImageUrl || p.image;
                      const nextGallery = nextGalleryUrls ?? p.gallery ?? [];
                      return {
                        ...p,
                        name: editForm.name,
                        price: Number(editForm.price) || 0,
                        deliveryEta: editForm.deliveryEta,
                        expectedDelivery: editForm.expectedDelivery,
                        stock: Number(editForm.stock) || 0,
                        image: nextImage,
                        gallery: nextGallery,
                        galleryData: nextGallery,
                      };
                    }),
                  );

                  setEditingId(null);
                  setEditForm({
                    name: "",
                    price: "",
                    deliveryEta: "",
                    expectedDelivery: "",
                    stock: "",
                    imageData: "",
                    imageName: "",
                    removeImage: false,
                    galleryData: [],
                    galleryNames: [],
                  });
                  setDataStatus(null);
                } catch (err) {
                  const message = err instanceof Error ? err.message : "Unknown error";
                  setDataStatus(`Save failed: ${message}`);
                }
              }}
            >
              Save changes
            </button>
            <button
              className="px-4 py-2 rounded-xl border border-white/10 text-white hover:border-accent-strong"
              onClick={() => setEditingId(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {editingCurriculumId && (
        <div className="glass-panel rounded-2xl p-6 space-y-4" ref={curriculumEditRef}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Edit curriculum</h3>
            <button
              className="text-sm px-3 py-1 rounded-lg border border-white/10 text-white hover:border-accent-strong"
              onClick={() => setEditingCurriculumId(null)}
            >
              Cancel
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block text-sm text-slate-300 space-y-2">
              Title
              <input
                value={curriculumForm.title}
                onChange={(e) => setCurriculumForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block text-sm text-slate-300 space-y-2">
              Grade
              <select
                value={curriculumForm.grade}
                onChange={(e) => setCurriculumForm((f) => ({ ...f, grade: e.target.value }))}
                className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              >
                {gradeOptions.map((g) => (
                  <option key={g} value={g} className="text-black">
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-300 space-y-2">
              Subject
              <select
                value={curriculumForm.subject}
                onChange={(e) => setCurriculumForm((f) => ({ ...f, subject: e.target.value }))}
                className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              >
                {subjectOptions.map((s) => (
                  <option key={s} value={s} className="text-black">
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-300 space-y-2">
              Module
              <input
                value={curriculumForm.module}
                onChange={(e) => setCurriculumForm((f) => ({ ...f, module: e.target.value }))}
                className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              />
            </label>
          </div>
          <label className="block text-sm text-slate-300 space-y-2">
            Description
            <textarea
              value={curriculumForm.description}
              onChange={(e) => setCurriculumForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              rows={3}
            />
          </label>
          <label className="block text-sm text-slate-300 space-y-2">
            Assets (comma separated labels)
            <input
              value={curriculumForm.assets}
              onChange={(e) => setCurriculumForm((f) => ({ ...f, assets: e.target.value }))}
              className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
            />
          </label>
          <div className="flex gap-3">
            <button
              className="px-4 py-2 rounded-xl bg-accent text-slate-900 font-semibold shadow-glow hover:translate-y-[-1px] transition-transform"
              onClick={async () => {
                if (!editingCurriculumId) return;
                try {
                  if (!isAdmin) {
                    setDataStatus("Admin access is required to edit curriculum.");
                    return;
                  }
                  setDataStatus("Saving curriculum changes...");

                  const assetLabels = curriculumForm.assets
                    .split(",")
                    .map((a) => a.trim())
                    .filter(Boolean);

                  const existing = curriculumRows.find((c) => c.id === editingCurriculumId);
                  const nextAssets =
                    assetLabels.length === 0
                      ? existing?.assets ?? []
                      : (existing?.assets?.length ?? 0) > 0
                        ? (existing?.assets ?? []).map((asset, idx) => ({
                            ...asset,
                            label: assetLabels[idx] ?? asset.label,
                          }))
                        : assetLabels.map((label) => ({ type: "doc" as const, url: label, label }));

                  const { error } = await supabase
                    .from("curriculum_modules")
                    .update({
                      title: curriculumForm.title,
                      grade: curriculumForm.grade,
                      subject: curriculumForm.subject,
                      module: curriculumForm.module,
                      description: curriculumForm.description,
                      asset_urls: nextAssets,
                    })
                    .eq("id", editingCurriculumId);

                  if (error) {
                    setDataStatus(`Save failed: ${error.message}`);
                    return;
                  }

                  setCurriculumRows((prev) =>
                    prev.map((c) =>
                      c.id === editingCurriculumId
                        ? {
                            ...c,
                            title: curriculumForm.title,
                            grade: curriculumForm.grade,
                            subject: curriculumForm.subject,
                            module: curriculumForm.module,
                            description: curriculumForm.description,
                            assets: nextAssets,
                          }
                        : c,
                    ),
                  );

                  setEditingCurriculumId(null);
                  setCurriculumForm({
                    title: "",
                    grade: "",
                    subject: "",
                    module: "",
                    description: "",
                    assets: "",
                  });
                  setDataStatus(null);
                } catch (err) {
                  const message = err instanceof Error ? err.message : "Unknown error";
                  setDataStatus(`Save failed: ${message}`);
                }
              }}
            >
              Save changes
            </button>
            <button
              className="px-4 py-2 rounded-xl border border-white/10 text-white hover:border-accent-strong"
              onClick={() => setEditingCurriculumId(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-2xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Orders</h2>
          <button className="text-sm px-3 py-1 rounded-lg bg-white/10 border border-white/15 text-white">
            View all
          </button>
        </div>
        <ul className="list-disc list-inside text-sm text-slate-200 space-y-1">
          {orderActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
        <div className="rounded-xl border border-white/10 p-3 text-sm text-slate-300">
          Live status: 0 pending, 0 processing, 0 delivered.
        </div>
      </div>
    </main>
  );
}

