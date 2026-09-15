create table if not exists pl_teaching_progress (
 cohort_id uuid not null references pl_cohorts(id) on delete cascade,
 instructor_id uuid not null references pl_students(id) on delete cascade,
 revision integer not null default 1 check (revision > 0),
 state jsonb not null,
 updated_at timestamptz not null default now(),
 primary key(cohort_id,instructor_id)
);
alter table pl_teaching_progress enable row level security;
revoke all on pl_teaching_progress from anon, authenticated;
grant select,insert,update,delete on pl_teaching_progress to service_role;
notify pgrst, 'reload schema';
