-- Extensions required by this schema
create extension if not exists "pgcrypto";

-- Core tables
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text check (role in ('admin', 'customer')) default 'customer',
  created_at timestamp with time zone default now()
);

create table if not exists public.curriculum_modules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  grade text not null,
  subject text not null,
  module text not null,
  description text,
  asset_urls jsonb default '[]',
  price_yearly numeric,
  published boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  gallery_urls jsonb default '[]',
  price numeric not null,
  stock integer default 0,
  delivery_eta text,
  featured boolean default false,
  created_at timestamp with time zone default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  status text check (status in ('pending', 'processing', 'shipped', 'delivered')) default 'pending',
  total numeric default 0,
  created_at timestamp with time zone default now()
);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  qty integer not null default 1,
  price numeric not null
);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id),
  event_type text not null,
  payload jsonb,
  created_at timestamp with time zone default now()
);

-- RLS
alter table public.profiles enable row level security;
alter table public.curriculum_modules enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.analytics_events enable row level security;

-- Helper: admin check (used by multiple policies)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Profiles: users can read/update their own profile
drop policy if exists "Profiles are self-readable" on public.profiles;
drop policy if exists "Profiles are self-updatable" on public.profiles;
drop policy if exists "Profiles are self-insertable" on public.profiles;
drop policy if exists "Admins manage profiles" on public.profiles;
create policy "Profiles are self-readable" on public.profiles
  for select using (auth.uid() = id);
create policy "Profiles are self-updatable" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id and role = 'customer');
create policy "Profiles are self-insertable" on public.profiles
  for insert with check (auth.uid() = id and role = 'customer');
create policy "Admins manage profiles" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Curriculum: everyone can read published; only admins can write
drop policy if exists "Published curriculum readable" on public.curriculum_modules;
drop policy if exists "Admins manage curriculum" on public.curriculum_modules;
create policy "Published curriculum readable" on public.curriculum_modules
  for select using (published is true);
create policy "Admins manage curriculum" on public.curriculum_modules
  for all using (public.is_admin()) with check (public.is_admin());

-- Products: everyone can read; only admins can write
drop policy if exists "Products readable" on public.products;
drop policy if exists "Admins manage products" on public.products;
create policy "Products readable" on public.products
  for select using (true);
create policy "Admins manage products" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- Orders: users see their own; admins see all
drop policy if exists "Users read own orders" on public.orders;
drop policy if exists "Admins read orders" on public.orders;
drop policy if exists "Customers insert orders" on public.orders;
create policy "Users read own orders" on public.orders
  for select using (auth.uid() = user_id);
create policy "Admins read orders" on public.orders
  for select using (public.is_admin());
create policy "Customers insert orders" on public.orders
  for insert with check (auth.role() = 'authenticated');

-- Order items follow parent orders
drop policy if exists "Order items readable via orders" on public.order_items;
create policy "Order items readable via orders" on public.order_items
  for select using (
    exists (
      select 1
      from public.orders o
      where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())
    )
  );

-- Analytics: admins only
drop policy if exists "Admins manage analytics" on public.analytics_events;
create policy "Admins manage analytics" on public.analytics_events
  for all using (public.is_admin()) with check (public.is_admin());

-- Hint PostgREST to refresh its schema cache
notify pgrst, 'reload schema';
