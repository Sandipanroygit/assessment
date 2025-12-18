import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.NEXT_PUBLIC_DEFAULT_ADMIN_EMAIL || "sandipanroyyyyy@gmail.com";
const password = process.env.DEFAULT_ADMIN_PASSWORD || "12345678";
const fullName = process.env.NEXT_PUBLIC_DEFAULT_ADMIN_NAME || "Sandipan";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env vars. Check .env.local.");
  process.exit(1);
}

const client = createClient(supabaseUrl, serviceRoleKey);

async function ensureAdmin() {
  console.log(`Checking for admin account ${email}...`);
  const emailNormalized = email.toLowerCase();
  const { data: usersData, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    console.error("Lookup failed:", listError.message);
    process.exit(1);
  }

  const existingUser = usersData?.users?.find((u) => (u.email ?? "").toLowerCase() === emailNormalized);
  let userId = existingUser?.id;

  if (!existingUser) {
    console.log("Admin not found. Creating...");
    const { data: createData, error: createError } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "admin" },
    });
    if (createError || !createData?.user) {
      console.error("User creation failed:", createError?.message);
      process.exit(1);
    }
    userId = createData.user.id;
  } else {
    const { error: updateError } = await client.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: fullName, role: "admin" },
    });
    if (updateError) {
      console.warn("Unable to update existing admin metadata:", updateError.message);
    }
  }

  if (!userId) {
    console.error("Unable to resolve admin user id.");
    process.exit(1);
  }

  console.log("Upserting profile row...");
  const { error: profileError } = await client
    .from("profiles")
    .upsert({ id: userId, full_name: fullName, role: "admin" }, { onConflict: "id" });

  if (profileError) {
    console.error("Profile upsert failed (create tables first):", profileError.message);
    process.exit(1);
  }

  console.log("✅ Admin ready. You can now log in via /login");
}

ensureAdmin();
