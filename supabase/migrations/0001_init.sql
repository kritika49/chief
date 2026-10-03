-- Chief — initial database schema
-- Every table has user_id and Row Level Security (RLS): a user can only
-- read and write their own rows. Server-only jobs use the service role key.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.project_type as enum ('dev', 'design_pm');
create type public.person_role as enum ('dev', 'design', 'qa', 'other');
create type public.tracking_mode as enum ('slack_scan', 'manual_entry', 'none');
create type public.connection_provider as enum ('google', 'slack', 'fathom');
create type public.connection_status as enum ('connected', 'needs_attention', 'not_connected');
create type public.todo_list as enum ('later', 'today', 'done');
create type public.item_source as enum ('manual', 'client_call', 'standup');
create type public.meeting_type as enum ('client_call', 'standup', 'ignore', 'unassigned');
create type public.meeting_status as enum ('new', 'in_review', 'reviewed', 'dismissed');
create type public.meeting_item_kind as enum ('key_point', 'decision', 'action');
create type public.meeting_item_status as enum ('pending', 'accepted', 'dismissed');
create type public.task_status as enum ('open', 'done');
create type public.match_status as enum ('auto', 'suggested', 'confirmed', 'rejected', 'undone');
create type public.followup_status as enum ('open', 'done', 'cancelled');
create type public.draft_status as enum ('draft', 'posted', 'discarded');
create type public.bullet_source as enum ('eod', 'missing_eod', 'manual_entry', 'todo', 'client_call', 'standup', 'pinned', 'free_text');
create type public.rule_match_kind as enum ('title_keyword', 'attendee_domain', 'recurring_event_id');

-- ---------------------------------------------------------------------------
-- Profiles & preferences (one row per signed-in user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  slack_user_id text,
  slack_user_name text,
  starter_data_loaded boolean not null default false,
  setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id = user_id)
);

create table public.preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text,                                   -- set from browser on first login
  working_days smallint[] not null default '{1,2,3,4,5}', -- ISO weekday: 1=Mon … 7=Sun
  morning_draft_time time not null default '07:30',
  eod_cutoff_time time not null default '19:00',
  evening_reminders jsonb not null default
    '[{"days":[1,2,5],"time":"19:00"},{"days":[3,4],"time":"22:00"}]',
  pre_call_lead_minutes integer not null default 60,
  target_channel_ids text[] not null default '{}',
  watched_calendar_ids text[] not null default '{primary}',
  email_greeting text not null default 'Hi all,',
  email_signoff text not null default 'Best regards,',
  auto_gmail_draft boolean not null default true,
  blocker_keywords text[] not null default
    '{blocked,blocker,"waiting on",dependency,issue,stuck}',
  match_high_threshold numeric not null default 0.6,
  match_medium_threshold numeric not null default 0.3,
  stale_task_days integer not null default 2,
  notifications jsonb not null default
    '{"draft_ready":true,"pre_call_brief":true,"followup_due":true,"evening_reminder":true}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Connectors (credentials are encrypted by the server with ENCRYPTION_KEY)
-- ---------------------------------------------------------------------------
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider public.connection_provider not null,
  status public.connection_status not null default 'not_connected',
  account_label text,                -- e.g. the Google email or Fathom account
  credentials_encrypted text,        -- AES-GCM ciphertext; never sent to the browser
  webhook_id text unique,            -- Fathom: public id used in the webhook URL
  settings jsonb not null default '{}',
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  type public.project_type not null default 'dev',
  header jsonb not null default '{}',  -- dev: planned_vs_actual, dev_completion, launch; design_pm: status, design_started
  sort_order integer not null default 0,
  active boolean not null default true, -- false = archived
  auto_post_standup boolean not null default false,
  email_cc text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.header_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  slack_channel_id text not null,
  slack_channel_name text,
  eod_keyword text not null default 'EOD',
  active boolean not null default true,
  is_primary boolean not null default false,
  last_scanned_ts text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slack_channel_id)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  slack_user_id text,
  email text,
  role public.person_role not null default 'dev',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.person_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now()
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  tracking_mode public.tracking_mode not null default 'slack_scan',
  nudge boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, person_id)
);

create table public.call_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  meeting_type public.meeting_type not null,
  match_kind public.rule_match_kind not null,
  match_value text not null,
  created_at timestamptz not null default now()
);

create table public.pinned_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  text text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  working_days smallint[],
  eod_cutoff_time time,
  nudges_enabled boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

-- ---------------------------------------------------------------------------
-- Slack EODs
-- ---------------------------------------------------------------------------
create table public.slack_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  channel_id uuid references public.channels (id) on delete set null,
  person_id uuid references public.people (id) on delete set null,
  slack_channel_id text not null,
  slack_user_id text not null,
  slack_ts text not null,
  thread_ts text,
  permalink text,
  raw_text text not null,
  posted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, slack_channel_id, slack_ts)
);

create table public.eod_bullets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slack_message_id uuid not null references public.slack_messages (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  person_id uuid references public.people (id) on delete set null,
  text text not null,
  position integer not null default 0,
  is_blocker boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Meetings (Fathom)
-- ---------------------------------------------------------------------------
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  type public.meeting_type not null default 'unassigned',
  status public.meeting_status not null default 'new',
  title text,
  started_at timestamptz,
  calendar_event_id text,
  recurring_event_id text,
  fathom_id text,
  fathom_url text,
  attendees jsonb not null default '[]',
  summary text,
  transcript text,
  raw jsonb,
  is_manual boolean not null default false,
  next_call_at timestamptz,
  reviewed_at timestamptz,
  included_in_posted_update_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fathom_id)
);

create table public.meeting_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  kind public.meeting_item_kind not null,
  status public.meeting_item_status not null default 'pending',
  text text not null,
  position integer not null default 0,
  is_decision boolean not null default false,
  destinations text[] not null default '{}',  -- todo | followup | slack
  owner_person_id uuid references public.people (id) on delete set null,
  owner_name text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  meeting_id uuid references public.meetings (id) on delete set null,
  assignee_person_id uuid references public.people (id) on delete set null,
  assignee_raw text,
  text text not null,
  due_date date,
  status public.task_status not null default 'open',
  source public.item_source not null default 'standup',
  slack_ts text,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.action_items (id) on delete cascade,
  eod_bullet_id uuid not null references public.eod_bullets (id) on delete cascade,
  score numeric not null,
  status public.match_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, eod_bullet_id)
);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  meeting_id uuid references public.meetings (id) on delete set null,
  text text not null,
  owner_person_id uuid references public.people (id) on delete set null,
  owner_name text,
  due_date date,
  status public.followup_status not null default 'open',
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  meeting_id uuid references public.meetings (id) on delete set null,
  text text not null,
  decided_on date not null default current_date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- To-dos
-- ---------------------------------------------------------------------------
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  text text not null,
  list public.todo_list not null default 'later',
  sort_order integer not null default 0,
  source public.item_source not null default 'manual',
  meeting_id uuid references public.meetings (id) on delete set null,
  is_blocker boolean not null default false,
  done_at timestamptz,
  archived_at timestamptz,
  included_in_posted_update_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Drafts & posted updates
-- ---------------------------------------------------------------------------
create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  for_date date not null,
  status public.draft_status not null default 'draft',
  since timestamptz,              -- start of window (last posted update)
  header_snapshot jsonb not null default '{}',
  manual_entries jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.draft_bullets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  draft_id uuid not null references public.drafts (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  text text not null,
  position integer not null default 0,
  source public.bullet_source not null default 'free_text',
  source_ref text,                -- id of eod bullet / todo / meeting item
  source_url text,                -- Slack permalink or meeting link
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.posted_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  draft_id uuid references public.drafts (id) on delete set null,
  text text not null,
  slack_channel_ids text[] not null default '{}',
  slack_ts jsonb not null default '{}',
  posted_at timestamptz not null default now()
);

create table public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  gmail_draft_id text not null,
  subject text,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (meeting_id)
);

-- ---------------------------------------------------------------------------
-- Jobs & nudges
-- ---------------------------------------------------------------------------
create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  person_id uuid references public.people (id) on delete set null,
  kind text not null default 'missing_eod',
  for_date date not null,
  sent_at timestamptz not null default now(),
  slack_ts text
);

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_key text not null,          -- e.g. morning_draft:2026-10-03
  status text not null default 'done',
  detail jsonb,
  ran_at timestamptz not null default now(),
  unique (user_id, job_key)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index on public.projects (user_id, sort_order);
create index on public.channels (user_id);
create index on public.channels (slack_channel_id);
create index on public.people (user_id);
create index on public.person_aliases (user_id);
create index on public.project_members (user_id);
create index on public.slack_messages (user_id, project_id, posted_at);
create index on public.eod_bullets (user_id, project_id);
create index on public.meetings (user_id, started_at);
create index on public.meeting_items (meeting_id);
create index on public.action_items (user_id, status);
create index on public.followups (user_id, status);
create index on public.decisions (user_id, decided_on);
create index on public.todos (user_id, project_id, list);
create index on public.drafts (user_id, for_date);
create index on public.draft_bullets (draft_id);
create index on public.posted_updates (user_id, posted_at);
create index on public.header_history (project_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','preferences','connections','projects','channels','people',
    'project_members','pinned_lines','schedule_overrides','meetings',
    'meeting_items','action_items','task_matches','followups','todos',
    'drafts','draft_bullets'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security: every table, own rows only
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.preferences enable row level security;
alter table public.connections enable row level security;
alter table public.projects enable row level security;
alter table public.header_history enable row level security;
alter table public.channels enable row level security;
alter table public.people enable row level security;
alter table public.person_aliases enable row level security;
alter table public.project_members enable row level security;
alter table public.call_rules enable row level security;
alter table public.pinned_lines enable row level security;
alter table public.schedule_overrides enable row level security;
alter table public.slack_messages enable row level security;
alter table public.eod_bullets enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_items enable row level security;
alter table public.action_items enable row level security;
alter table public.task_matches enable row level security;
alter table public.followups enable row level security;
alter table public.decisions enable row level security;
alter table public.todos enable row level security;
alter table public.drafts enable row level security;
alter table public.draft_bullets enable row level security;
alter table public.posted_updates enable row level security;
alter table public.email_drafts enable row level security;
alter table public.nudges enable row level security;
alter table public.job_runs enable row level security;

create policy "own rows" on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.connections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.projects for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.header_history for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.channels for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.people for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.person_aliases for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.project_members for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.call_rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.pinned_lines for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.schedule_overrides for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.slack_messages for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.eod_bullets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.meetings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.meeting_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.action_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.task_matches for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.followups for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.decisions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.todos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.drafts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.draft_bullets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.posted_updates for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.email_drafts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.nudges for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.job_runs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Connections hold encrypted secrets: signed-in users may only READ the
-- non-secret columns. All writes happen on the server with the service role.
revoke all on public.connections from anon, authenticated;
grant select (id, user_id, provider, status, account_label, webhook_id,
              settings, last_sync_at, last_error, created_at, updated_at)
  on public.connections to authenticated;

-- Job bookkeeping is server-only too.
revoke insert, update, delete on public.job_runs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- New user → create profile + default preferences
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, user_id, email, full_name, avatar_url)
  values (
    new.id, new.id, coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
