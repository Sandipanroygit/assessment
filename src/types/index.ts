export type UserRole = "admin" | "customer";

export interface CurriculumModule {
  id: string;
  title: string;
  grade: string;
  subject: string;
  module: string;
  description: string;
  assets: Array<{ type: "video" | "code" | "doc"; url: string; label: string }>;
  codeSnippet?: string;
  priceYearly?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  image: string;
  imageData?: string;
  gallery?: string[]; // urls
  galleryData?: string[]; // data URLs
  price: number;
  originalPrice?: number;
  deliveryEta: string;
  expectedDelivery: string;
  stock: number;
  sku: string;
  highlights: string[];
  featured?: boolean;
  badge?: string;
}

export interface Order {
  id: string;
  status: "pending" | "processing" | "shipped" | "delivered";
  total: number;
  createdAt: string;
  items: Array<{ name: string; qty: number }>;
}
