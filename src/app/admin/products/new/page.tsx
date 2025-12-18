"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { uploadFileToBucket } from "@/lib/supabaseData";
import type { Product } from "@/types";

export default function NewProductPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    deliveryEta: "",
    expectedDelivery: "",
    stock: "",
    sku: "",
    imageData: "",
    imageName: "",
    galleryData: [] as string[],
    galleryNames: [] as string[],
    galleryFiles: [] as File[],
  });
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("Saving to database...");
    const priceNum = Number(form.price) || 0;
    const stockNum = Number(form.stock) || 0;
    const newProduct: Product = {
      id: crypto.randomUUID(),
      name: form.name,
      description: form.description,
      highlights: [],
      price: priceNum,
      deliveryEta: form.deliveryEta || "3-5 days",
      expectedDelivery: form.expectedDelivery || "",
      stock: stockNum,
      sku: form.sku || `SKU-${Date.now()}`,
      image: form.galleryData[0] || form.imageData || "",
      imageData: form.galleryData[0] || form.imageData || undefined,
      galleryData: form.galleryData.length ? form.galleryData : undefined,
      gallery: form.galleryData.length ? form.galleryData : undefined,
    };

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setStatus("You must be signed in to create products.");
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
        setStatus("Only admins can create products. Run `npm run seed:admin` to create an admin profile, then log in.");
        return;
      }

      let imageUrl: string | null = null;
      const primaryFile = form.galleryFiles[0];
      if (primaryFile) {
        imageUrl = await uploadFileToBucket({
          bucket: "product-images",
          file: primaryFile,
          pathPrefix: `${authData.user.id}`,
          fileName: primaryFile.name,
        });
      }

      const { error } = await supabase.from("products").insert({
        name: newProduct.name,
        description: newProduct.description,
        image_url: imageUrl,
        price: newProduct.price,
        stock: newProduct.stock,
        delivery_eta: newProduct.deliveryEta,
        featured: false,
      });

      if (error) {
        setStatus(`Unable to save to database: ${error.message}`);
        return;
      }

      setStatus(`Saved ${form.name || "product"} to shared catalogue.`);
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
          <p className="text-accent-strong uppercase text-xs tracking-[0.2em]">Products</p>
          <h1 className="text-3xl font-semibold text-white">List new product</h1>
          <p className="text-slate-300 text-sm mt-2">Add details and an image; it will appear in the shop.</p>
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
            Name
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              required
            />
          </label>
          <label className="block text-sm text-slate-300 space-y-2">
            SKU
            <input
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              placeholder="Optional"
            />
          </label>
        </div>

        <label className="block text-sm text-slate-300 space-y-2">
          Description
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
            rows={3}
            required
          />
        </label>

        <div className="grid md:grid-cols-3 gap-4">
          <label className="block text-sm text-slate-300 space-y-2">
            Price (INR)
            <input
              type="number"
              min="0"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              required
            />
          </label>
          <label className="block text-sm text-slate-300 space-y-2">
            Delivery ETA
            <input
              value={form.deliveryEta}
              onChange={(e) => setForm((f) => ({ ...f, deliveryEta: e.target.value }))}
              className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              placeholder="e.g., 3-5 days"
            />
          </label>
          <label className="block text-sm text-slate-300 space-y-2">
            Expected delivery date
            <input
              value={form.expectedDelivery}
              onChange={(e) => setForm((f) => ({ ...f, expectedDelivery: e.target.value }))}
              className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              placeholder="e.g., Arrives by Fri, Dec 27"
            />
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="block text-sm text-slate-300 space-y-2">
            Stock
            <input
              type="number"
              min="0"
              value={form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none"
              required
            />
          </label>
          <label className="block text-sm text-slate-300 space-y-2">
            Upload up to 3 images
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files).slice(0, 3) : [];
                if (!files.length) {
                  setForm((f) => ({
                    ...f,
                    imageData: "",
                    imageName: "",
                    galleryData: [],
                    galleryNames: [],
                    galleryFiles: [],
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
                  setForm((prev) => {
                    const mergedData = [...(prev.galleryData || []), ...dataUrls].slice(0, 3);
                    const mergedNames = [...(prev.galleryNames || []), ...files.map((f) => f.name)].slice(0, 3);
                    const mergedFiles = [...(prev.galleryFiles || []), ...files].slice(0, 3);
                    return {
                      ...prev,
                      imageData: mergedData[0] ?? "",
                      imageName: mergedNames[0] ?? "",
                      galleryData: mergedData,
                      galleryNames: mergedNames,
                      galleryFiles: mergedFiles,
                    };
                  });
                });
              }}
              className="w-full rounded-xl border border-slate-400/60 bg-white/5 px-3 py-2 text-white focus:border-accent focus:outline-none file-accent"
            />
            {form.galleryNames.length > 0 && (
              <p className="text-xs text-slate-400">
                Selected ({form.galleryNames.length}/3): {form.galleryNames.join(", ")}
              </p>
            )}
            {form.galleryData.length > 0 && (
              <div className="flex gap-2 mt-2">
                {form.galleryData.map((img, idx) => (
                  <div key={idx} className="relative h-16 w-16 rounded-lg overflow-hidden border border-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={`Preview ${idx + 1}`} className="object-cover h-full w-full" />
                  </div>
                ))}
              </div>
            )}
          </label>
        </div>

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
            Save product
          </button>
          <button
            type="button"
            onClick={() => {
              setForm({
                name: "",
                description: "",
                price: "",
                deliveryEta: "",
                expectedDelivery: "",
                stock: "",
                sku: "",
                imageData: "",
                imageName: "",
                galleryData: [],
                galleryNames: [],
                galleryFiles: [],
              });
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
