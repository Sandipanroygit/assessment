"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CART_STORAGE_KEY } from "@/data/products";
import { fetchProducts } from "@/lib/supabaseData";
import type { Product } from "@/types";

export default function ShopPage() {
  const [query, setQuery] = useState("");
  const [productRows, setProductRows] = useState<Product[]>([]);
  const [cart, setCart] = useState<Array<{ id: string; qty: number }>>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [dataStatus, setDataStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      try {
        setDataStatus("Loading products...");
        const rows = await fetchProducts();
        if (cancelled) return;
        setProductRows(rows);
        setDataStatus(null);
      } catch {
        if (cancelled) return;
        setProductRows([]);
        setDataStatus("Database not reachable. No products available.");
      }
    };

    loadProducts();

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

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return productRows;
    return productRows.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  }, [productRows, query]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const addToCart = (id: string) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === id);
      if (existing) {
        return prev.map((item) => (item.id === id ? { ...item, qty: item.qty + 1 } : item));
      }
      return [...prev, { id, qty: 1 }];
    });
  };

  const cartItems = cart
    .map((item) => {
      const product = productRows.find((p) => p.id === item.id);
      if (!product) return null;
      return { ...product, qty: item.qty };
    })
    .filter(Boolean) as Array<(typeof productRows)[number] & { qty: number }>;

  const primaryImage = (product: (typeof productRows)[number]) =>
    product.galleryData?.[0] ||
    product.gallery?.[0] ||
    product.imageData ||
    product.image ||
    "https://images.unsplash.com/photo-1508615039623-a25605d2b022?auto=format&fit=crop&w=800&q=80";

  return (
    <>
      <main className="section-padding space-y-8">
        {dataStatus && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            {dataStatus}
          </div>
        )}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-accent-strong uppercase text-xs tracking-[0.2em]">Shop</p>
            <h1 className="text-3xl font-semibold text-white">Browse drones and hands-on kits</h1>
            <p className="text-slate-300 text-sm mt-2">
              Add items to cart and proceed to checkout. Orders sync to your dashboard for tracking.
            </p>
        </div>
        <Link href="/" className="px-4 py-2 rounded-xl bg-accent text-true-white font-semibold shadow-glow">
          Go to homepage
        </Link>
      </div>

      <div className="glass-panel rounded-2xl p-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search products"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[220px] rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white"
        />
        <p className="text-sm text-slate-400">Featured: 15% off Drone Kit this month</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {filtered.map((product) => (
          <div key={product.id} className="glass-panel rounded-2xl overflow-hidden">
            <div className="relative h-48 w-full">
            {product.badge && (
              <span className="absolute top-3 left-3 bg-accent text-slate-900 text-xs font-semibold px-3 py-1 rounded-full">
                {product.badge}
              </span>
            )}
            <Image
                src={primaryImage(product)}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 33vw, 100vw"
              />
            </div>
            <div className="p-4 space-y-2">
              <h3 className="text-lg font-semibold text-white">{product.name}</h3>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white font-semibold">₹{product.price.toLocaleString()}</span>
                <span className="text-slate-400">{product.deliveryEta}</span>
              </div>
              <p className="text-xs text-slate-400">Expected: {product.expectedDelivery}</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  className="w-full py-2 rounded-lg bg-accent text-true-white font-semibold shadow-glow"
                  onClick={() => addToCart(product.id)}
                >
                  Add to cart
                </button>
                <Link
                  href={`/shop/${product.id}`}
                  className="w-full py-2 rounded-lg border border-white/10 text-center text-white hover:border-accent-strong transition"
                >
                  View
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
      </main>
      <>
        <button
          className="fixed bottom-6 right-6 h-12 px-4 rounded-full bg-accent text-true-white font-semibold shadow-glow flex items-center gap-2"
          onClick={() => setCartOpen(true)}
        >
          Cart ({cart.reduce((sum, item) => sum + item.qty, 0)})
        </button>
        {cartOpen && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setCartOpen(false)}
            />
            <div className="absolute right-0 top-0 bottom-0 w-80 bg-surface border-l border-white/10 shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold text-white">Your Cart</p>
                <button
                  className="h-8 w-8 rounded-full border border-white/10 text-white grid place-items-center"
                  onClick={() => setCartOpen(false)}
                >
                  ✕
                </button>
              </div>
              {cartItems.length === 0 ? (
                <p className="text-sm text-slate-300">Cart is empty.</p>
              ) : (
                <div className="space-y-3">
                  {cartItems.map((item) => (
                    <div key={item.id} className="border border-white/10 rounded-xl p-3 text-sm text-white">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{item.name}</span>
                        <button
                          className="text-xs text-red-200 underline"
                          onClick={() => setCart((prev) => prev.filter((p) => p.id !== item.id))}
                        >
                          Remove
                        </button>
                      </div>
                      <p className="text-slate-300">Qty: {item.qty}</p>
                      <p className="text-slate-300">₹{(item.price * item.qty).toLocaleString()}</p>
                    </div>
                  ))}
                  <p className="text-white font-semibold">
                    Total: ₹
                    {cartItems.reduce((sum, item) => sum + item.price * item.qty, 0).toLocaleString()}
                  </p>
                  <button className="w-full py-3 rounded-lg bg-accent text-slate-900 font-semibold shadow-glow">
                    Checkout
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    </>
  );
}
