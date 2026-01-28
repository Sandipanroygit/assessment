export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const getClient = () => {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server credentials are missing.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const parsePage = (value: string | null) => (value && value.trim() ? value.trim() : "home");

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const page = parsePage(url.searchParams.get("page"));
    const supabase = getClient();
    const { count, error } = await supabase
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .eq("page", page);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ count: count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to fetch footfall.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { page?: string };
    const page = parsePage(body.page ?? null);
    const supabase = getClient();
    const { error: insertError } = await supabase.from("page_views").insert({ page });
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    const { count, error: countError } = await supabase
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .eq("page", page);
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }
    return NextResponse.json({ count: count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to track footfall.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
