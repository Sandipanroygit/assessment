"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CurriculumModule, Product } from "@/types";
import { useRouter } from "next/navigation";
import { dataUrlToFile, fetchCurriculumModules, fetchProducts, uploadFileToBucket } from "@/lib/supabaseData";

type Profile = { full_name?: string; role?: string };

const orderActions = ["Track status", "View receipts", "Export reports"];

const gradeOptions = ["Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const subjectOptions = ["Physics", "Maths", "Computer Science", "Environment System & Society (ESS)", "Design Technology"];

const isMissingTableSchemaCacheError = (message: string) =>
  message.toLowerCase().includes("schema cache") && message.toLowerCase().includes("could not find the table");

const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    value,
  );

export default function AdminPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [signingOut, startSignOut] = useTransition();
  const router = useRouter();
  const [curriculumRows, setCurriculumRows] = useState<CurriculumModule[]>([]);
  const [productRows, setProductRows] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCurriculumId, setEditingCurriculumId] = useState<string | null>(null);
  const curriculumEditRef = useRef<HTMLDivElement | null>(null);
  const [dataStatus, setDataStatus] = useState<string | null>(null);
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
      { label: "Revenue (₹)", value: "₹0", delta: "Start selling to track" },
    ],
    [curriculumRows.length, productRows.length],
  );

  useEffect(() => {
    const loadProfile = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        setAuthStatus("Please sign in to access the admin dashboard.");
        setIsAdmin(false);
        setProfile(null);
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
        setAuthStatus(`Unable to verify admin access: ${error.message}${setupHint ? ` — ${setupHint}` : ""}`);
        setIsAdmin(false);
        setProfile({ full_name: user.user_metadata?.full_name ?? user.email ?? "User", role: undefined });
        return;
      }
      const fallbackName = profileData?.full_name ?? user.user_metadata?.full_name ?? user.email ?? "User";
      const role = profileData?.role;
      setProfile(profileData ? { ...profileData, full_name: fallbackName } : { full_name: fallbackName, role });
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
        const [nextCurriculum, nextProducts] = await Promise.all([
          fetchCurriculumModules({ includeUnpublished: true }),
          fetchProducts(),
        ]);
        if (cancelled) return;
        setCurriculumRows(nextCurriculum);
        setProductRows(nextProducts);
        setDataStatus(null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to load data";
        setCurriculumRows([]);
        setProductRows([]);
        setDataStatus(`Database not reachable (${message}).`);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  return (
    <main className="section-padding space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-accent-strong uppercase text-xs tracking-[0.2em]">Admin</p>
          <h1 className="text-3xl font-semibold text-white">
            Hi {profile?.full_name ?? "Sandipan"}, here&apos;s your control room
          </h1>
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
                    No curriculum uploaded yet. Click “Upload content” to add your first drone activity.
                  </td>
                </tr>
              ) : (
                curriculumRows.map((item) => (
                  <tr key={item.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 font-semibold text-white">{item.title}</td>
                    <td className="py-2 pr-3 text-slate-300">{item.grade}</td>
                    <td className="py-2 pr-3 text-slate-300">{item.subject}</td>
                    <td className="py-2 pr-3 text-slate-300">
                      {item.assets.map((asset) => asset.label).join(", ")}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
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
                              setDataStatus(`Delete failed: ${error.message}`);
                              return;
                            }
                            setProductRows((prev) => prev.filter((p) => p.id !== product.id));
                            if (editingId === product.id) {
                              setEditingId(null);
                            }
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
              ))}
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
              Price (₹)
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
                  const hasNewImages = editForm.galleryData.length > 0;

                  if (editForm.removeImage) {
                    nextImageUrl = null;
                  } else if (hasNewImages) {
                    const { data: authData } = await supabase.auth.getUser();
                    const userId = authData.user?.id ?? "anonymous";
                    const fileName = editForm.galleryNames[0] || editForm.imageName || "product-image.jpg";
                    const file = dataUrlToFile(editForm.galleryData[0]!, fileName);
                    nextImageUrl = await uploadFileToBucket({
                      bucket: "product-images",
                      file,
                      pathPrefix: userId,
                      fileName,
                    });
                  }

                  if (typeof nextImageUrl !== "undefined") {
                    payload.image_url = nextImageUrl;
                  }

                  const { error } = await supabase.from("products").update(payload).eq("id", editingId);
                  if (error) {
                    setDataStatus(`Save failed: ${error.message}`);
                    return;
                  }

                  setProductRows((prev) =>
                    prev.map((p) => {
                      if (p.id !== editingId) return p;
                      const nextImage = nextImageUrl === null ? "" : nextImageUrl || p.image;
                      return {
                        ...p,
                        name: editForm.name,
                        price: Number(editForm.price) || 0,
                        deliveryEta: editForm.deliveryEta,
                        expectedDelivery: editForm.expectedDelivery,
                        stock: Number(editForm.stock) || 0,
                        image: nextImage,
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
