import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = "curriculum-assets";

const getAdminClient = () => {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const sanitizeFileName = (name: string) => (name || "file").replace(/[^\w.\-]+/g, "-");
const buildPath = (userId: string, moduleId: string, fileName: string) =>
  `submissions/${userId}/${moduleId}/${Date.now()}-${sanitizeFileName(fileName)}`;

const uploadAndGetUrl = async (params: { client: ReturnType<typeof getAdminClient>; file: File; path: string }) => {
  const { client, file, path } = params;
  const { error: uploadError } = await client.storage
    .from(bucketName)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: true });
  if (uploadError) throw uploadError;
  const { data } = client.storage.from(bucketName).getPublicUrl(path);
  return data?.publicUrl ?? "";
};

const getUserFromToken = async (client: ReturnType<typeof getAdminClient>, accessToken: string) => {
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error("Invalid or expired session.");
  }
  return data.user;
};

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const accessToken = form.get("access_token");
    const moduleId = form.get("module_id");
    const logFile = form.get("log");
    const plotFile = form.get("plot");

    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Missing access token." }, { status: 401 });
    }
    if (typeof moduleId !== "string" || !moduleId) {
      return NextResponse.json({ error: "Missing module id." }, { status: 400 });
    }
    if (!(logFile instanceof File) || !(plotFile instanceof File)) {
      return NextResponse.json({ error: "Both log and plot files are required." }, { status: 400 });
    }

    const client = getAdminClient();
    const user = await getUserFromToken(client, accessToken);

    const logPath = buildPath(user.id, moduleId, logFile.name || "log.txt");
    const plotPath = buildPath(user.id, moduleId, plotFile.name || "plot");

    const [logUrl, plotUrl] = await Promise.all([
      uploadAndGetUrl({ client, file: logFile, path: logPath }),
      uploadAndGetUrl({ client, file: plotFile, path: plotPath }),
    ]);

    const { error: upsertError } = await client.from("activity_submissions").upsert(
      {
        user_id: user.id,
        module_id: moduleId,
        log_url: logUrl,
        log_name: logFile.name || "log",
        plot_url: plotUrl,
        plot_name: plotFile.name || "plot",
        plot_type: plotFile.type || null,
        report_status: "pending",
      },
      { onConflict: "user_id,module_id" },
    );
    if (upsertError) throw upsertError;

    return NextResponse.json({
      logUrl,
      plotUrl,
      logName: logFile.name || "log",
      plotName: plotFile.name || "plot",
      plotType: plotFile.type || null,
      uploadedAt: new Date().toISOString(),
      userId: user.id,
      moduleId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      access_token?: string;
      module_id?: string;
      report?: unknown;
      report_html?: string;
      log_url?: string;
      plot_url?: string;
      log_name?: string;
      plot_name?: string;
      plot_type?: string | null;
    };

    if (!body?.access_token) {
      return NextResponse.json({ error: "Missing access token." }, { status: 401 });
    }
    if (!body.module_id) {
      return NextResponse.json({ error: "Missing module id." }, { status: 400 });
    }

    const client = getAdminClient();
    const user = await getUserFromToken(client, body.access_token);

    const { error: upsertError } = await client.from("activity_submissions").upsert(
      {
        user_id: user.id,
        module_id: body.module_id,
        log_url: body.log_url ?? null,
        plot_url: body.plot_url ?? null,
        log_name: body.log_name ?? null,
        plot_name: body.plot_name ?? null,
        plot_type: body.plot_type ?? null,
        report_json: body.report ?? null,
        report_html: body.report_html ?? null,
        report_status: body.report ? "ready" : "pending",
      },
      { onConflict: "user_id,module_id" },
    );
    if (upsertError) throw upsertError;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
