-- per-user column-order preference for a given table (e.g. drag-reordered
-- columns on the cases list). Distinct from case_type_column_presets (which
-- controls WHICH extra columns a manager exposes per case type): this only
-- controls the ORDER any single user sees their own columns in, and is
-- entirely self-served (no manager involvement needed).

create table public.profile_column_orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  table_key text not null,
  column_order text[] not null,
  updated_at timestamptz not null default now(),
  unique (profile_id, table_key)
);

alter table public.profile_column_orders enable row level security;

create policy profile_column_orders_select on public.profile_column_orders
  for select using (profile_id = auth.uid());

create policy profile_column_orders_insert on public.profile_column_orders
  for insert with check (profile_id = auth.uid());

create policy profile_column_orders_update on public.profile_column_orders
  for update using (profile_id = auth.uid());

create policy profile_column_orders_delete on public.profile_column_orders
  for delete using (profile_id = auth.uid());
