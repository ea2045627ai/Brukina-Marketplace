-- Production support and AI assistant foundation.
-- Run after schema.sql, dispatch.sql, operations.sql, and sourcing.sql.

create table if not exists public.support_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_language text not null default 'en-GH',
  voice_enabled boolean not null default true,
  phone_number text,
  consent_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.support_callback_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  phone_number text not null,
  preferred_language text not null default 'en-GH',
  role text not null default 'customer' check (role in ('customer', 'vendor', 'driver', 'rider', 'admin')),
  topic text not null default 'marketplace support',
  status text not null default 'queued' check (status in ('queued', 'contacted', 'completed', 'cancelled', 'failed')),
  provider text,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  channel text not null check (channel in ('web_voice', 'web_text', 'phone')),
  language text not null default 'en-GH',
  transcript jsonb not null default '[]'::jsonb,
  provider text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists callback_queue_idx on public.support_callback_requests(status, created_at);
create index if not exists support_conversations_user_idx on public.support_conversations(user_id, started_at desc);

alter table public.support_preferences enable row level security;
alter table public.support_callback_requests enable row level security;
alter table public.support_conversations enable row level security;

drop policy if exists "support preferences own access" on public.support_preferences;
create policy "support preferences own access" on public.support_preferences for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
drop policy if exists "callback own create" on public.support_callback_requests;
create policy "callback own create" on public.support_callback_requests for insert with check (auth.uid() = user_id or user_id is null);
drop policy if exists "callback own read" on public.support_callback_requests;
create policy "callback own read" on public.support_callback_requests for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "callback admin update" on public.support_callback_requests;
create policy "callback admin update" on public.support_callback_requests for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "conversation own access" on public.support_conversations;
create policy "conversation own access" on public.support_conversations for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or user_id is null);

-- Phone/AI providers must be configured in a trusted server environment.
-- Never put telephony credentials or model keys in app.js.
