create table if not exists public.flow2_leona_flows (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  name text not null default 'Fluxo 2.0',
  is_active boolean not null default false,
  is_archived boolean not null default false,
  definition jsonb not null default '{"nodes": [], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}}'::jsonb,
  selected_node_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow2_leona_flows_user_unique unique (user_id)
);

create index if not exists idx_flow2_leona_flows_user_id on public.flow2_leona_flows(user_id);
create index if not exists idx_flow2_leona_flows_active
  on public.flow2_leona_flows(user_id, is_active)
  where is_active = true and is_archived = false;

alter table public.flow2_leona_flows enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'flow2_leona_flows'
      and policyname = 'flow2_leona_flows_select_own'
  ) then
    create policy flow2_leona_flows_select_own
      on public.flow2_leona_flows
      for select
      to authenticated
      using ((select auth.uid())::text = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'flow2_leona_flows'
      and policyname = 'flow2_leona_flows_insert_own'
  ) then
    create policy flow2_leona_flows_insert_own
      on public.flow2_leona_flows
      for insert
      to authenticated
      with check ((select auth.uid())::text = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'flow2_leona_flows'
      and policyname = 'flow2_leona_flows_update_own'
  ) then
    create policy flow2_leona_flows_update_own
      on public.flow2_leona_flows
      for update
      to authenticated
      using ((select auth.uid())::text = user_id)
      with check ((select auth.uid())::text = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'flow2_leona_flows'
      and policyname = 'flow2_leona_flows_delete_own'
  ) then
    create policy flow2_leona_flows_delete_own
      on public.flow2_leona_flows
      for delete
      to authenticated
      using ((select auth.uid())::text = user_id);
  end if;
end $$;

grant select, insert, update, delete on public.flow2_leona_flows to authenticated;

comment on table public.flow2_leona_flows is
  'Fluxo 2.0 estilo Leona, isolado do fluxo visual atual em ai_agent_config.flow_script.';
