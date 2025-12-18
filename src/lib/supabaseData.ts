import { supabase } from "@/lib/supabaseClient";
import { products as fallbackProducts } from "@/data/products";
import type { CurriculumModule, Product } from "@/types";

type CurriculumRow = {
  id: string;
  title: string;
  grade: string;
  subject: string;
  module: string;
  description: string | null;
  asset_urls: unknown;
  price_yearly: number | null;
  published: boolean | null;
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  gallery_urls?: unknown;
  price: number;
  stock: number | null;
  delivery_eta: string | null;
  featured: boolean | null;
};

const safeArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const encodeStoragePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");
const isMissingGalleryColumn = (error: unknown) =>
  error instanceof Error && /gallery_urls/i.test(error.message) && /column/i.test(error.message);

const readCachedProducts = (): Product[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("admin-product-rows");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Product[]) : [];
  } catch {
    return [];
  }
};

const mergeFallbackProducts = (extra: Product[] = []) => {
  const seen = new Set<string>();
  const merged: Product[] = [];
  [...extra, ...fallbackProducts].forEach((p) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    merged.push(p);
  });
  return merged;
};

export const mapCurriculumRow = (row: CurriculumRow): CurriculumModule => {
  const assets = safeArray<CurriculumModule["assets"][number]>(row.asset_urls);
  return {
    id: row.id,
    title: row.title,
    grade: row.grade,
    subject: row.subject,
    module: row.module,
    description: row.description ?? "",
    assets,
    priceYearly: row.price_yearly ?? undefined,
  };
};

export const mapProductRow = (row: ProductRow): Product => {
  const image = row.image_url ?? "";
  const gallery = safeArray<string>(row.gallery_urls);
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    image,
    gallery,
    price: row.price,
    deliveryEta: row.delivery_eta ?? "3-5 days",
    expectedDelivery: "",
    stock: row.stock ?? 0,
    sku: `SKU-${row.id.slice(0, 8)}`,
    highlights: [],
    featured: row.featured ?? undefined,
  };
};

export async function fetchCurriculumModules(options?: { includeUnpublished?: boolean }) {
  const includeUnpublished = options?.includeUnpublished ?? false;
  const query = supabase
    .from("curriculum_modules")
    .select("id,title,grade,subject,module,description,asset_urls,price_yearly,published,created_at")
    .order("created_at", { ascending: false });
  const { data, error } = includeUnpublished ? await query : await query.eq("published", true);
  if (error) throw error;
  return (data as CurriculumRow[]).map(mapCurriculumRow);
}

export async function fetchProducts() {
  const query = () =>
    supabase
      .from("products")
      .select("id,name,description,image_url,gallery_urls,price,stock,delivery_eta,featured,created_at")
      .order("created_at", { ascending: false });
  const fallbackQuery = () =>
    supabase
      .from("products")
      .select("id,name,description,image_url,price,stock,delivery_eta,featured,created_at")
      .order("created_at", { ascending: false });

  const { data, error } = await query();
  if (error) {
    if (isMissingGalleryColumn(error)) {
      const { data: fallbackData, error: fallbackError } = await fallbackQuery();
      if (fallbackError) throw fallbackError;
      return (fallbackData as ProductRow[]).map(mapProductRow);
    }
    // If Supabase is unreachable, return static products so the shop still loads
    console.warn("fetchProducts fallback to static data:", (error as Error)?.message ?? error);
    return mergeFallbackProducts(readCachedProducts());
  }
  return (data as ProductRow[]).map(mapProductRow);
}

export async function fetchProductById(id: string) {
  const query = () =>
    supabase
      .from("products")
      .select("id,name,description,image_url,gallery_urls,price,stock,delivery_eta,featured,created_at")
      .eq("id", id)
      .maybeSingle();
  const fallbackQuery = () =>
    supabase
      .from("products")
      .select("id,name,description,image_url,price,stock,delivery_eta,featured,created_at")
      .eq("id", id)
      .maybeSingle();

  const { data, error } = await query();
  if (error) {
    if (isMissingGalleryColumn(error)) {
      const { data: fallbackData, error: fallbackError } = await fallbackQuery();
      if (fallbackError) throw fallbackError;
      if (!fallbackData) return null;
      return mapProductRow(fallbackData as ProductRow);
    }
    console.warn("fetchProductById fallback to static data:", (error as Error)?.message ?? error);
    const localCache = mergeFallbackProducts(readCachedProducts());
    const local = localCache.find((p) => p.id === id);
    return local ?? null;
  }
  if (!data) return null;
  return mapProductRow(data as ProductRow);
}

export async function uploadFileToBucket(params: {
  bucket: string;
  file: File;
  pathPrefix: string;
  fileName?: string;
}) {
  const safeName = (params.fileName || params.file.name || "file").replace(/[^\w.\-]+/g, "-");
  const path = `${params.pathPrefix}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(params.bucket)
    .upload(path, params.file, { contentType: params.file.type || undefined, upsert: true });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(params.bucket).getPublicUrl(path);
  const publicUrl = data?.publicUrl ?? "";
  if (publicUrl.includes("/storage/v1/object/public/")) return publicUrl;

  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl) return publicUrl;
  return `${baseUrl}/storage/v1/object/public/${params.bucket}/${encodeStoragePath(path)}`;
}

export function dataUrlToFile(dataUrl: string, fileName: string) {
  const [header, base64] = dataUrl.split(",");
  if (!header || !base64) {
    throw new Error("Invalid data URL.");
  }
  const mime = header.match(/data:(.*);base64/)?.[1] || "application/octet-stream";
  const bytes = atob(base64);
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) buf[i] = bytes.charCodeAt(i);
  return new File([buf], fileName, { type: mime });
}
