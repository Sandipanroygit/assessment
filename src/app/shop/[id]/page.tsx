"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CART_STORAGE_KEY } from "@/data/products";
import { use, useEffect, useMemo, useState } from "react";
import { fetchProductById } from "@/lib/supabaseData";
import type { Product } from "@/types";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [qty, setQty] = useState(1);
  const [localProduct, setLocalProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<Array<{ id: string; qty: number }>>([]);
  const [storageChecked, setStorageChecked] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadProduct = async () => {
      try {
        const fromDb = await fetchProductById(id);
        if (cancelled) return;
        setLocalProduct(fromDb);
      } catch {
        if (cancelled) return;
        setLocalProduct(null);
      } finally {
        if (!cancelled) setStorageChecked(true);
      }

      if (typeof window !== "undefined") {
        const storedCart = localStorage.getItem(CART_STORAGE_KEY);
        if (storedCart) {
          try {
            const parsed = JSON.parse(storedCart);
            if (Array.isArray(parsed)) setCart(parsed);
          } catch {
            // ignore
          }
        }
      }
    };

    loadProduct();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const product = useMemo(() => localProduct, [localProduct]);
  const gallery = useMemo(() => {
    if (!product) return [];
    const list =
      product.galleryData ??
      product.gallery ??
      (product.imageData ? [product.imageData] : []);
    if (list.length === 0 && product.image) return [product.image];
    return list;
  }, [product]);
  const imageSrc =
    gallery[galleryIndex] ??
    product?.imageData ??
    product?.image ??
    "https://images.unsplash.com/photo-1508615039623-a25605d2b022?auto=format&fit=crop&w=800&q=80";
  const highlights = product?.highlights ?? [];

  if (!product && !storageChecked) {
    // wait for localStorage hydration before deciding notFound
    return null;
  }

  if (storageChecked && !product) {
    notFound();
  }

  const addToCart = () => {
    const next = (() => {
      const existing = cart.find((item) => item.id === product.id);
      if (existing) {
        return cart.map((item) => (item.id === product.id ? { ...item, qty: item.qty + qty } : item));
      }
      return [...cart, { id: product.id, qty }];
    })();
    setCart(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
    }
  };

  return (
    <main className="section-padding space-y-8">
      <nav className="text-sm text-slate-400 flex items-center gap-2">
        <Link href="/" className="hover:text-white">
          Home
        </Link>
        <span>›</span>
        <Link href="/shop" className="hover:text-white">
          Products
        </Link>
        <span>›</span>
        <span className="text-white font-semibold">{product.name}</span>
      </nav>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
        <div className="space-y-4">
          <div className="glass-panel rounded-3xl overflow-hidden border border-white/10">
            <div className="relative h-[360px] w-full bg-black/10">
              <Image
                src={imageSrc}
                alt={product.name}
                fill
                className="object-contain p-4"
                sizes="(min-width: 1024px) 60vw, 100vw"
              />
              {gallery.length > 1 && (
                <>
                  <button
                    aria-label="Previous image"
                    className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/40 text-white grid place-items-center"
                    onClick={() => setGalleryIndex((i) => (i - 1 + gallery.length) % gallery.length)}
                  >
                    ‹
                  </button>
                  <button
                    aria-label="Next image"
                    className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/40 text-white grid place-items-center"
                    onClick={() => setGalleryIndex((i) => (i + 1) % gallery.length)}
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            {gallery.length > 1 && (
              <div className="grid grid-cols-3 gap-2 p-3 bg-black/20 border-t border-white/10">
                {gallery.map((img, idx) => (
                  <button
                    key={idx}
                    className={`relative h-20 rounded-lg overflow-hidden border ${
                      idx === galleryIndex ? "border-accent" : "border-white/10"
                    }`}
                    onClick={() => setGalleryIndex(idx)}
                    aria-label={`View image ${idx + 1}`}
                  >
                    <Image src={img} alt={`${product.name} ${idx + 1}`} fill className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="glass-panel rounded-3xl p-6 space-y-3 border border-white/10">
            <p className="text-accent-strong uppercase text-xs tracking-[0.2em]">Product</p>
            <h1 className="text-3xl font-semibold text-white">{product.name}</h1>
            <p className="text-slate-200 text-sm leading-relaxed">{product.description}</p>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-accent/15 text-accent-strong px-2 py-1 border border-accent/30">
                Free shipping
              </span>
              <span className="rounded-full bg-white/10 text-white px-2 py-1 border border-white/15">
                Best price
              </span>
              {product.badge && (
                <span className="rounded-full bg-red-500/15 text-red-200 px-2 py-1 border border-red-400/30">
                  {product.badge}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-200">
              <span className="font-semibold text-white">{currency.format(product.price)}</span>
              <span className="h-1 w-1 rounded-full bg-slate-500" />
              <span>Delivery: {product.deliveryEta}</span>
            </div>
            <p className="text-sm text-green-400 font-semibold">
              {product.stock > 0 ? `${product.stock} in stock` : "Currently unavailable"}
            </p>
            <p className="text-xs text-slate-400">Expected delivery: {product.expectedDelivery}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-panel rounded-3xl p-6 space-y-4 border border-white/10">
            <h2 className="text-lg font-semibold text-white">Buy box</h2>
            <div className="space-y-1">
              {product.originalPrice && (
                <p className="text-sm text-slate-400 line-through">{currency.format(product.originalPrice)}</p>
              )}
              <div className="text-2xl font-semibold text-white">{currency.format(product.price)}</div>
              {product.originalPrice && (
                <p className="text-xs text-green-400 font-semibold">
                  Save {currency.format(product.originalPrice - product.price)}
                </p>
              )}
            </div>
            <p className="text-sm text-slate-300">Delivery: {product.deliveryEta}</p>
            <p className="text-sm text-green-400 font-semibold">
              {product.stock > 0 ? `${product.stock} in stock` : "Currently unavailable"}
            </p>
            <p className="text-xs text-slate-400">Expected by {product.expectedDelivery}</p>
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-300">Quantity:</p>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2">
                <button
                  className="text-white disabled:opacity-40"
                  onClick={() => setQty((prev) => Math.max(1, prev - 1))}
                  disabled={qty === 1}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="text-white font-semibold w-6 text-center">{qty}</span>
                <button
                  className="text-white"
                  onClick={() => setQty((prev) => prev + 1)}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>
            <div className="grid gap-2">
              <button
                className="w-full py-3 rounded-lg bg-accent text-slate-900 font-semibold shadow-glow"
                onClick={addToCart}
              >
                Add to cart
              </button>
              <button className="w-full py-3 rounded-lg border border-white/10 text-white hover:border-accent-strong transition">
                Buy now
              </button>
              <button className="w-full py-3 rounded-lg border border-white/10 text-white hover:border-accent-strong transition">
                Add to wishlist
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Ships with tracking. Returns accepted within 7 days of delivery.
            </p>
          </div>

          <div className="glass-panel rounded-3xl p-6 space-y-3 border border-white/10">
            <h3 className="text-lg font-semibold text-white">Details</h3>
            <p className="text-sm text-slate-300">SKU: {product.sku}</p>
            <ul className="text-sm text-slate-200 space-y-2 list-disc list-inside">
              <li>Delivery window: {product.deliveryEta}</li>
              <li>Expected arrival: {product.expectedDelivery}</li>
              <li>Stock available: {product.stock}</li>
              {highlights.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-100">
              Since this is a DIY kit, COD/returns/replacements are not available for this product.
            </div>
            <div className="flex gap-2">
              <Link
                href="/shop"
                className="px-4 py-2 rounded-xl border border-white/10 text-white hover:border-accent-strong"
              >
                Back to shop
              </Link>
              <Link
                href="/"
                className="px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-white hover:border-accent-strong"
              >
                Continue browsing
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
