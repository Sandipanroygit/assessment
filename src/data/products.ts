import type { Product } from "@/types";

export const PRODUCT_STORAGE_KEY = "admin-product-rows";
export const CART_STORAGE_KEY = "shop-cart";

export const products: Product[] = [
  {
    id: "p1",
    name: "Classroom Drone Kit",
    description: "Quadcopter, spares, and safety curriculum alignment.",
    image: "https://images.unsplash.com/photo-1508615039623-a25605d2b022?auto=format&fit=crop&w=800&q=80",
    price: 24999,
    originalPrice: 30999,
    deliveryEta: "4-6 days",
    badge: "15% OFF",
    expectedDelivery: "Arrives by Tue, Dec 30",
    stock: 18,
    sku: "DRN-CLASS-001",
    highlights: [
      "FPV-ready drone with classroom-safe guards",
      "Includes spares (blades, motors) and battery set",
      "One-key return and altitude hold for easy flights",
      "LED beacons for indoor/outdoor visibility",
    ],
  },
  {
    id: "p2",
    name: "Hands-on Starter Pack",
    description: "Headsets, controllers, and device management onboarding.",
    image: "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=800&q=80",
    price: 18499,
    originalPrice: 20999,
    deliveryEta: "5-7 days",
    featured: true,
    expectedDelivery: "Arrives by Thu, Jan 02",
    stock: 32,
    sku: "IMM-STRT-201",
    highlights: [
      "Ready-to-use headsets with classroom device profiles",
      "Controller bundle with rechargeable cells",
      "Onboarding playbook and support desk access",
      "Warranty-backed hardware replacement program",
    ],
  },
  {
    id: "p3",
    name: "Edu Lab Toolkit",
    description: "Reliable tools, filaments, and maintenance recipes for makers.",
    image: "https://images.unsplash.com/photo-1477453557867-4a5f6464cafe?auto=format&fit=crop&w=800&q=80",
    price: 29999,
    originalPrice: 32999,
    deliveryEta: "3-5 days",
    expectedDelivery: "Arrives by Mon, Dec 29",
    stock: 11,
    sku: "LAB-KIT-310",
    highlights: [
      "Includes calibrated tools and safety PPE",
      "Assorted filaments with tuning presets",
      "Maintenance checklist and quick-fix guide",
      "Bundled with printable practice models",
    ],
  },
  {
    id: "p4",
    name: "Drone Spares Pack",
    description: "Blades, batteries, motors, and quick-swap tools.",
    image: "https://images.unsplash.com/photo-1508615039623-a25605d2b022?auto=format&fit=crop&w=800&q=80",
    price: 4999,
    originalPrice: 5999,
    deliveryEta: "3-4 days",
    expectedDelivery: "Arrives by Fri, Dec 27",
    stock: 44,
    sku: "DRN-SPR-410",
    highlights: [
      "10x balanced blades and 4x motors",
      "2x fast-charge batteries with safety pouch",
      "Quick-release tools and hex set",
      "Label kit for classroom inventory tracking",
    ],
  },
];

export const productMap: Record<string, Product> = products.reduce((acc, product) => {
  acc[product.id] = product;
  return acc;
}, {} as Record<string, Product>);
