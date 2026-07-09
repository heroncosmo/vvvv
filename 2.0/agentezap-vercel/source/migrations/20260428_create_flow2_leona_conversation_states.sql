create table if not exists public.flow2_leona_conversation_states (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid references public.flow2_leona_flows(id) on delete cascade,
  user_id uuid not null,
  conversation_id text not null,
  current_node_id text,
  status text not null default 'active'
    check (status in ('active', 'waiting_input', 'ai_handoff', 'completed')),
  context jsonb not null default '{}'::jsonb,
  last_input text,
  last_input_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow2_leona_conversation_states_unique unique (user_id, conversation_id)
);

create index if not exists idx_flow2_leona_states_user_conversation
  on public.flow2_leona_conversation_states(user_id, conversation_id);

create index if not exists idx_flow2_leona_states_flow
  on public.flow2_leona_conversation_states(flow_id);

alter table public.flow2_leona_conversation_states enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'flow2_leona_conversation_states'
      and policyname = 'flow2_leona_states_select_own'
  ) then
    create policy flow2_leona_states_select_own
      on public.flow2_leona_conversation_states
      for select to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'flow2_leona_conversation_states'
      and policyname = 'flow2_leona_states_insert_own'
  ) then
    create policy flow2_leona_states_insert_own
      on public.flow2_leona_conversation_states
      for insert to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'flow2_leona_conversation_states'
      and policyname = 'flow2_leona_states_update_own'
  ) then
    create policy flow2_leona_states_update_own
      on public.flow2_leona_conversation_states
      for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

grant select, insert, update on public.flow2_leona_conversation_states to authenticated;

comment on table public.flow2_leona_conversation_states is
  'Estado isolado por conversa para o Fluxo 2.0 estilo Leona.';
