-- Promote & Lead Solutions — /classroom schema
-- Run AFTER supabase-schema.sql: Supabase → SQL Editor → New query → paste → Run.
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--
-- Same security model as the rest of the project: every object is `pl_` prefixed, RLS is ON
-- with no policies, and all access is server-side from Cloudflare Pages Functions using the
-- service-role key. The browser never talks to Supabase directly — it talks to
-- /api/classroom/*, which authorises each request from the signed session cookie.
--
-- NOTE ON CURRICULUM: no RBLP module text is stored anywhere in here. Students' own written
-- answers live in pl_worksheet_responses; the official modules stay on rblp.com behind the
-- month password in pl_module_passwords.

-- ------------------------------------------------------------------ classroom accounts
create table if not exists pl_students (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  display_name    text,
  role            text not null default 'student',   -- student | instructor | admin
  track           text,                              -- RBLP | RBLP-C | RBLP-T (self-selected pre-enrollment)
  payment_source  text,                              -- army_ca | af_ca | navy_cool | usmc_cool | cg_cool | self_pay | affirm | other
  branch          text,                              -- Army | Air Force | Navy | USMC | Coast Guard
  rblp_applied_at timestamptz,                       -- student confirmed they filed the free RBLP application
  ca_submitted_on date,                              -- date they sent both invoices to their CA office (drives the 45-day clock)
  purchase_claimed_at timestamptz,                   -- student says they already bought prep on rblp.com; admin confirms
  referral_code   text unique,                       -- instructors only: the code in their share link
  referred_by     uuid references pl_students(id),   -- which instructor brought this student
  referred_via    text,                              -- link | named | admin — how the attribution was made
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz
);
create index if not exists idx_pl_students_email on pl_students (lower(email));

-- ------------------------------------------------------------------ email one-time codes
-- Codes are stored HMAC-hashed; a leak of this table hands out no live logins.
create table if not exists pl_login_codes (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  code_hash    text not null,
  attempts     int  not null default 0,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_pl_login_codes_lookup on pl_login_codes (email, created_at desc);

-- ------------------------------------------------------------------ visual pipeline
create table if not exists pl_pipeline_events (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references pl_students(id) on delete cascade,
  step         text not null,        -- account | rblp_apply | funding | enrolled | worksheets | attend | certificate | exam
  completed_at timestamptz not null default now(),
  unique (student_id, step)
);

-- ------------------------------------------------------------------ worksheets
-- One row per student per leader task. What / Why / Why it matters to my life / Story —
-- the RBLP oral exam answer shape.
create table if not exists pl_worksheet_responses (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references pl_students(id) on delete cascade,
  module_num int  not null,
  task_key   text not null,
  what_text  text,
  why_text   text,
  life_text  text,
  story_text text,
  -- RBLP's oral tests six things: factual (what), conceptual (why), procedural (how/story),
  -- then Analyze, Evaluate and Create. The first four fields cover through Analyze; these two
  -- are Evaluate ("what shouldn't a leader do") and Create ("what would I do with this team").
  notdo_text text,
  plan_text  text,
  status     text not null default 'draft',  -- empty | draft | ready | expanded
  updated_at timestamptz not null default now(),
  unique (student_id, task_key)
);
create index if not exists idx_pl_worksheets_student on pl_worksheet_responses (student_id);

-- ------------------------------------------------------------------ cohorts: classroom columns
-- Extends the existing admin-CRM pl_cohorts table rather than starting a second roster.
alter table pl_cohorts add column if not exists slug               text;   -- e.g. '26-002'
alter table pl_cohorts add column if not exists teams_url          text;
alter table pl_cohorts add column if not exists instructor_email   text;
alter table pl_cohorts add column if not exists tracks_allowed     text[];
alter table pl_cohorts add column if not exists classroom_status   text;   -- draft | open | in_progress | complete
alter table pl_cohorts add column if not exists password_month_key text;   -- 'YYYY-MM' override
alter table pl_cohorts add column if not exists instructor_notes   text;

create table if not exists pl_cohort_sessions (
  id                    uuid primary key default gen_random_uuid(),
  cohort_id             uuid not null references pl_cohorts(id) on delete cascade,
  label                 text,
  starts_at             timestamptz not null,
  ends_at               timestamptz,
  instructional_minutes int,
  created_at            timestamptz not null default now()
);
create index if not exists idx_pl_sessions_cohort on pl_cohort_sessions (cohort_id, starts_at);

-- Attendance keys on email so a roster row can be marked present before the student has
-- ever signed in (pl_cohort_members is email-keyed too).
create table if not exists pl_attendance (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references pl_cohort_sessions(id) on delete cascade,
  student_email text not null,
  present       boolean not null default true,
  minutes       int,
  marked_by     text,
  updated_at    timestamptz not null default now(),
  unique (session_id, student_email)
);

-- ------------------------------------------------------------------ month-rotated module password
-- The ATP Academy password for the official RBLP modules. One per month, not per student.
create table if not exists pl_module_passwords (
  year_month text primary key,        -- 'YYYY-MM'
  password   text,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ lock down
alter table pl_students           enable row level security;
alter table pl_login_codes        enable row level security;
alter table pl_pipeline_events    enable row level security;
alter table pl_worksheet_responses enable row level security;
alter table pl_cohort_sessions    enable row level security;
alter table pl_attendance         enable row level security;
alter table pl_module_passwords   enable row level security;

alter table pl_worksheet_responses add column if not exists notdo_text text;
alter table pl_worksheet_responses add column if not exists plan_text  text;
alter table pl_students add column if not exists purchase_claimed_at timestamptz;
alter table pl_students add column if not exists referral_code text;
alter table pl_students add column if not exists referred_by uuid references pl_students(id);
alter table pl_students add column if not exists referred_via text;
create unique index if not exists pl_students_referral_code_idx on pl_students (referral_code) where referral_code is not null;
