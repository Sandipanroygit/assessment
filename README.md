## Curriculum Dashboard (Next.js + Supabase)

Full-stack dashboard to commercialize drone, AR/VR, and 3D printing curriculum for schools. Includes marketing landing, Supabase Auth login, role-based dashboards, shopping page, and Supabase schema/seed script for the default admin.

### Quickstart
1) Install deps
```
npm install
```
2) Copy env and fill keys (keys provided by you)
```
cp .env.local.example .env.local
```
3) Run dev server
```
npm run dev
```

### Supabase setup
- Apply schema: `supabase/schema.sql` (profiles, curriculum_modules, products, orders, order_items, analytics_events + RLS).
- Buckets: `curriculum-assets` for videos/code/docs, `product-images` for product photos.
- Default admin: after env is set, run  
```
npm run seed:admin
```
This uses `SUPABASE_SERVICE_ROLE_KEY` to create `sandipanroyyyyy@gmail.com / 12345678` and upsert a profile with role `admin`.

### App routes
- `/` – Marketing landing with hero, features, ads/promos (₹9,999/year curriculum, 15% off kit, free AR/VR module), testimonials, and featured modules/products.
- `/login` – Supabase Auth (login + signup). Redirects to admin/customer dashboards based on profile role. Greets with “Hi {full_name}”.
- `/admin` – Admin dashboard: manage curriculum/products, orders, promotions, and view analytics.
- `/customer` – Customer dashboard: browse curriculum by grade/subject/module, access assets, shop products, and view order history.
- `/shop` – Shopping page for drones, AR/VR kits, and 3D printer bundles.

### Tech
- Next.js (App Router, TypeScript, Tailwind, Geist fonts)
- Supabase Auth + Database + Storage
- Client Supabase helper at `src/lib/supabaseClient.ts`

### Vercel deploy
Vercel is the recommended host for Next.js.

1) Push this repo to GitHub/GitLab/Bitbucket.
2) In Vercel: **Add New -> Project** and import the repo.
3) Framework preset: **Next.js** (auto-detected).
4) Set environment variables in Vercel -> Project -> Settings -> Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_DEFAULT_ADMIN_EMAIL`
   - `NEXT_PUBLIC_SITE_URL` (used for Supabase email redirect)
   - `OPENAI_API_KEY` (only needed for the chat assistant)

Optional:
- `NEXT_PUBLIC_DEFAULT_ADMIN_NAME`
- `SUPABASE_SERVICE_ROLE_KEY` (only needed if you run `npm run seed:admin` locally)

Node version: this repo sets `engines.node` to `20.x` in `package.json`.

### Notes
- Update `next.config.ts` if you host images elsewhere (currently allows Unsplash + Supabase storage).
- If RLS blocks profile or data access, ensure your `profiles` table has the logging-in user and role set. Use the seed script or insert manually.
