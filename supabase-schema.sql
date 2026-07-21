-- Promote & Lead Solutions — Admin CRM schema
-- Run this in your Supabase project: SQL Editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE).
--
-- NOTE: this Supabase project is shared with other data, so every object here is
-- prefixed with `pl_` to avoid collisions.
--
-- Security model: all access is server-side from Cloudflare Pages Functions using
-- the SERVICE ROLE / secret key (which bypasses RLS). The browser never talks to
-- Supabase directly. RLS is enabled with no policies so the public/anon key reads nothing.

-- ------------------------------------------------------------------ mailing list
create table if not exists pl_subscribers (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  source       text,
  referrer     text,
  country      text,
  region       text,                      -- state / province
  city         text,
  status       text not null default 'active',
  unsubscribed boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------ contact form leads
create table if not exists pl_contacts (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  email      text,
  topic      text,
  message    text,
  referrer   text,
  country    text,
  region     text,
  city       text,
  status     text not null default 'new',   -- new | contacted | won | closed
  notes      text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ cohorts + members
create table if not exists pl_cohorts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,        -- e.g. 'Jul 2026'
  code         text,                        -- student access / prep training code, e.g. 'OUTEY'
  session_date date,
  capacity     int  not null default 6,
  status       text not null default 'open',-- open | full | completed
  notes        text,
  created_at   timestamptz not null default now()
);
-- If the table already exists from an earlier run, add the new column:
alter table pl_cohorts add column if not exists code text;

create table if not exists pl_cohort_members (
  id           uuid primary key default gen_random_uuid(),
  cohort_id    uuid references pl_cohorts(id) on delete cascade,
  name         text,
  email        text,
  rblp_type    text,                          -- RBLP | RBLP-C | RBLP-T
  payment_type text,                          -- CA | Normal | Affirm
  branch       text,                          -- Army | Air Force (drives the CA eligibility window)
  ca_submitted_on date,                       -- date the Credentialing Assistance request was sent to CA
  status       text not null default 'applied',-- applied | paid | scheduled | passed
  notes        text,
  created_at   timestamptz not null default now()
);
-- If the table already exists from an earlier run, add the new columns:
alter table pl_cohort_members add column if not exists payment_type text;
alter table pl_cohort_members add column if not exists branch text;
alter table pl_cohort_members add column if not exists ca_submitted_on date;

-- ------------------------------------------------------------------ analytics
create table if not exists pl_visits (
  id         bigint generated always as identity primary key,
  path       text,
  referrer   text,
  country    text,
  region     text,
  city       text,
  ua         text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ key/value settings (instructor notes, etc.)
create table if not exists pl_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ email campaigns log
create table if not exists pl_campaigns (
  id              uuid primary key default gen_random_uuid(),
  subject         text,
  body            text,
  audience        text,                     -- 'list' | 'cohort:<id>' | 'custom'
  recipient_count int not null default 0,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------------ indexes
create index if not exists idx_pl_subscribers_created on pl_subscribers (created_at desc);
create index if not exists idx_pl_contacts_created    on pl_contacts (created_at desc);
create index if not exists idx_pl_members_cohort      on pl_cohort_members (cohort_id);
create index if not exists idx_pl_visits_created      on pl_visits (created_at desc);
create index if not exists idx_pl_visits_region       on pl_visits (region);
create index if not exists idx_pl_visits_referrer     on pl_visits (referrer);

-- ------------------------------------------------------------------ stats views
create or replace view pl_stats_top_states as
  select region as state, country, count(*)::int as visits
  from pl_visits where region is not null and region <> ''
  group by region, country order by visits desc;

create or replace view pl_stats_top_cities as
  select city, region, country, count(*)::int as visits
  from pl_visits where city is not null and city <> ''
  group by city, region, country order by visits desc;

create or replace view pl_stats_top_referrers as
  select referrer, count(*)::int as visits
  from pl_visits
  where referrer is not null and referrer <> '' and referrer <> 'direct'
  group by referrer order by visits desc;

create or replace view pl_stats_countries as
  select country, count(*)::int as visits
  from pl_visits where country is not null and country <> ''
  group by country order by visits desc;

-- ------------------------------------------------------------------ lock down (RLS on, no policies; service role bypasses)
alter table pl_subscribers    enable row level security;
alter table pl_contacts       enable row level security;
alter table pl_cohorts        enable row level security;
alter table pl_cohort_members enable row level security;
alter table pl_visits         enable row level security;
alter table pl_campaigns      enable row level security;
alter table pl_settings       enable row level security;
