# `/classroom` — Setup Guide

The student classroom at **promoteandlead.com/classroom**. Students sign in with an emailed
one-time code, work through a visual pipeline (apply → funding → cohort → worksheets → exam),
fill What / Why / Why-it-matters-to-my-life / Story worksheets for every RBLP leader task, and
see their cohort card (Teams link, sessions, hours). Instructors get a console; Tommy is admin.

Same stack as the rest of the site: static HTML + Cloudflare Pages Functions + Supabase + Resend.

---

## Licence boundary — read this first

RBLP owns the curriculum. **We never republish module HTML, PDFs, or body prose.** The app ships:

- the leader-task **outline** (titles/order) so worksheets line up with the official modules,
- Tommy's own coaching starters and glossary one-liners (from his study notes),
- **deep links** to each module on rblp.com plus the month-rotated Academy password.

Two consequences to keep in mind:

1. `functions/_lib/curriculum.js` is the only place task text lives. Don't paste module prose into it.
2. **`P-and-L-classroom-CC-pack/` is gitignored on purpose.** Cloudflare Pages serves the repo root
   as static files, so anything committed is publicly fetchable — committing the pack would publish
   RBLP-derived coach notes at `promoteandlead.com/P-and-L-classroom-CC-pack/…`. Keep it local.

`node tests/classroom.e2e.mjs` asserts both of these.

---

## 1. Database

### First-time setup on a fresh Supabase project

Promote & Lead runs on its **own** Supabase project, separate from any other work. That's
deliberate: instructors get logins, and an instructor must not be able to reach anything but
P&L. With a separate project that's structural, not a permissions rule that can be got wrong.

Run these **in order** — the classroom schema extends `pl_cohorts`, so the base schema has to
exist first:

1. **SQL Editor → New query** → paste `supabase-schema.sql` → Run.
   Creates `pl_subscribers`, `pl_contacts`, `pl_cohorts`, `pl_cohort_members`, `pl_visits`,
   `pl_settings`, `pl_campaigns`.
2. **New query** → paste `supabase-classroom-schema.sql` → Run.
   Adds the seven classroom tables and the classroom columns on `pl_cohorts`.

Both are safe to re-run.

**Check before moving on:** Table Editor should show 14 `pl_` tables, and every one should be
marked **RLS enabled**. There are deliberately **no policies** — the browser never talks to
Supabase, only our Pages Functions do, using the service-role key, which bypasses RLS. If you
ever add a policy you are opening a door nobody needs.

Then take **Project Settings → API**:

| Copy this | Into this Pages variable |
|---|---|
| Project URL | `SUPABASE_URL` |
| `service_role` key (not `anon`) | `SUPABASE_SERVICE_ROLE_KEY` |

New project means **new keys** — don't carry the old ones over. The `anon` key is never used by
this app; if you find yourself pasting it somewhere, something is wrong.

> Worth having daily backups on this project. It holds student records, attendance and the
> certificates you send RBLP to get paid — losing a cohort's attendance means reconstructing a
> funding claim by hand.

---

## 1b. Schema reference

In Supabase → **SQL Editor → New query**, run `supabase-classroom-schema.sql`
(after `supabase-schema.sql`, which it builds on). Safe to re-run.

It adds `pl_students`, `pl_login_codes`, `pl_pipeline_events`, `pl_worksheet_responses`,
`pl_cohort_sessions`, `pl_attendance`, `pl_module_passwords`, and extends the existing
`pl_cohorts` with classroom columns (`slug`, `teams_url`, `instructor_email`, …).

**The roster is not duplicated.** The classroom reads `pl_cohort_members` — the same table the
`/admin` CRM already manages — matched on email. Add a student there and they're enrolled; the
`rblp_type` you set there becomes their track.

---

## 2. Environment variables

Already set for the site: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`NOTIFY_FROM`, `NOTIFY_TO`. Two new ones:

```
CLASSROOM_SESSION_SECRET=<long random string>      # signs session cookies
CLASSROOM_ADMINS=tommy@promoteandlead.com          # comma-separated; the ONLY source of admin
```

Generate the secret with `openssl rand -base64 48`.

`CLASSROOM_SESSION_SECRET` falls back to `SUPABASE_SERVICE_ROLE_KEY` if unset, so the classroom
works before you set it — but set it, so rotating the Supabase key doesn't log everyone out.
Rotating `CLASSROOM_SESSION_SECRET` signs everyone out immediately (useful in an incident).

`CLASSROOM_ADMINS` is the **only** source of admin. A stored role of `admin` grants nothing, and
the API refuses to assign it — so the company owner's authority follows this variable and nothing
else. Tommy signs in as **tommy@promoteandlead.com**; that address must be here or he's a student.

If this is wrong, nobody is admin. That's the safer failure: you fix the variable, not find a
back door.

```bash
printf '%s' "<value>" | npx wrangler pages secret put CLASSROOM_SESSION_SECRET --project-name=promoteandlead-preview
printf '%s' "<value>" | npx wrangler pages secret put CLASSROOM_ADMINS          --project-name=promoteandlead-preview
# repeat for the production project
```

---

## 3. Local development

```bash
cat >> .dev.vars <<'VARS'
CLASSROOM_SESSION_SECRET=local-dev-secret
CLASSROOM_ADMINS=you@example.com
VARS

npx wrangler pages dev . --compatibility-date=2025-06-01 --port 8788
# → http://localhost:8788/classroom
```

Sign-in emails go through Resend, so you need a real `RESEND_API_KEY` locally to receive a code.
To exercise the logic without email, run the test suite instead (below).

---

## 4. Cloudflare Access — leave `/classroom` alone

Access protects `/admin` and `/api/admin`. **Do not** add `/classroom` or `/api/classroom` to an
Access application: students authenticate with their own one-time codes. If you add classroom
paths to Access, students will be locked out.

---

## 5. Running a cohort

1. **`/admin`** — create the cohort and add members (name, email, RBLP type, payment type).
   That roster drives everything.
2. **`/classroom` → Admin tab** — set the cohort's classroom fields:
   - **Cohort id / slug** — e.g. `26-002` (what the student sees)
   - **Teams join URL** — the student's join button
   - **Instructor email** — the classroom account that gets the instructor console for this cohort
   - **Tracks allowed**, **classroom status**
   - **Sessions** — start/end and instructional minutes
3. **Admin tab → Module password** — set this month's Academy password (`YYYY-MM`). It's what
   students use to open the modules on rblp.com. Rotate it monthly.
4. **Admin tab → Classroom accounts** — set someone's role to `instructor`, or manually unlock a
   pipeline step for a student who's ahead of the paperwork.
5. **Instructor tab** — roster, worksheet completion %, attendance, SOP, cohort notes.
6. **Teaching guide tab** — what you actually teach from: see below.

### One cohort, one day, planned for Trainers

**A cohort is mixed.** A single Saturday might hold two Ps, two Cs and a T. Everyone starts at
09:00 and learns together; students leave as their credential completes. There is no separate
RBLP day and no separate Coach day — there is the **Trainer day**, and people peel off it.

| | | |
|---|---|---|
| 09:00–10:00 | Module 1 — Team Climate | |
| 10:00–11:00 | Module 2 — Team Cohesion | |
| 11:00–11:15 | **Morning break** | *the turn from team to individual* |
| 11:15–12:15 | Module 3 — Individual Purpose | **← RBLP finish** |
| 12:15–13:15 | **Lunch** | *end of the RBLP core; the afternoon is Coach/Trainer material* |
| 13:15–14:15 | Module 4 — Team Learning | **← RBLP-C finish** |
| 14:15–14:30 | **Afternoon break** | *the turn from team to organization* |
| 14:30–15:30 | Module 5 — Organizational Learning | **← RBLP-T finish** |

390 minutes of wall clock: 300 taught (5 × 60) + 15 + 60 lunch + 15.

| Track | Taught | Their day | Published window |
|-------|--------|-----------|------------------|
| RBLP | 3h | 09:00–12:15 | 09:00–12:30 |
| RBLP-C | 4h | 09:00–14:15 | 09:00–14:30 |
| RBLP-T | 5h | 09:00–15:30 | 09:00–15:30 |

Every track gets exactly its `paybackHours` and finishes at or inside its published window.

**The constraint to preserve:** each break is also a departure point. A P's last module ends as
lunch begins; a C's ends as the afternoon break begins. Nobody packs up and walks out mid-session.
If the breaks ever move, that is what must not break — and a test enforces it.

Students see the whole day on **My cohort** with their own blocks marked and "You finish here" on
their last module; the rest is greyed rather than hidden, so they understand why the person beside
them is staying. Instructors see the same day on **Teaching guide** with each track's departure
flagged, a per-track roster count, and a reminder that the room shrinks after lunch.

### The public site publishes these too

`index.html`'s cohort card carries each track's window and instructional hours, and the
certification cards carry the oral exam lengths. Students book a Saturday off work around those
numbers, so the test suite checks the site against `TRACKS` directly — change a window here and
the site fails until it's updated to match.

**Cohort dates** live in the `#cohortList` markup in `index.html` — one `<li>` per cohort with a
`data-date`. They're in the HTML (not generated) so they're crawlable and correct with JS off;
the script only marks which one is next, greys out the ones that have run, and keeps the hero
badge in step. To announce a cohort, add an `<li>`. Tests check every date is a Saturday and
that they're in order.

**Army CA is gated.** `CA_REOPENS` (2026-09-14) and `CA_WINDOW_DAYS` in `index.html` drive the
banner in the military section. Before the reopening it says CA reopens on that date; after, it
says CA is open. `CA_WINDOW_DAYS` mirrors the same constant in `admin/index.html` — the CRM
places CA students with it — and a test fails if the two drift apart, because the site would
otherwise promise a cohort the CRM then refuses to place them in.

The banner names the first cohort far enough out to clear the lead time **and the date the
request has to be in by**, both computed. When every announced cohort is inside the lead time it
stops naming one rather than leaving a date that has quietly gone stale.

> The gate is client-side, so it follows the visitor's clock. That's fine for marketing copy;
> don't use this pattern for anything that needs enforcing.

### Attendance in a mixed cohort

The session row's `instructional_minutes` is the **whole** Trainer day, which is more than a P or
a C actually sits. Ticking "Present" without typing a number credits the student's **own track**
(3 / 4 / 5 hours), not the length of the room — otherwise an RBLP student banks 5 hours for a
3-hour day and the ATP claim is overstated. Typing a number always wins; that's the instructor
recording a real late arrival or early exit. The attendance table shows each student's track
beside their name and pre-fills the placeholder with their figure.

### 60 on the clock, ~75 prepared

The SOP says budget ~75 minutes a module, and the day gives 60. Both are right: prepare 75
minutes of material and land it in 60. The extra is depth to spend where the discussion
actually goes, not slides to rush through. The per-module teach sequences in `MODULE_TEACHING`
are timeboxed to the 60 you really have.

To change any of it, edit `COHORT_DAY` in `functions/_lib/curriculum.js`. Tests assert the day
is contiguous, fills 09:00–15:30, every track's taught minutes equal its `paybackHours`, no
break lands inside a module, and each track leaves into a break — so an edit that doesn't add
up fails rather than shipping.

## 6. The journey (how a student moves through)

One visible path from "I'm interested" to "I'm certified". Most students fund this with Army
Credentialing Assistance, so the **CA route is the main line**, not a branch.

Every step declares **whose court the ball is in** — `you` / `pls` / `rblp` / `ca`. Five of the
steps are handoffs to people who don't work here, and a student staring at a checkbox that isn't
moving needs to know whether to chase someone or just wait.

| Phase | Step | Whose move | How it gets marked |
|---|---|---|---|
| Get started | Create your account | you | signing in |
| | Credential + how you're paying | you | they answer |
| Get funded | Apply free at RBLP | you | they tick it |
| | RBLP confirms your application | RBLP | **admin** |
| | RBLP emails two invoices *(CA)* | RBLP | they tick it |
| | Upload both invoices to the branch CA portal, select **RLS** *(CA)* | you | they enter the date |
| | CA funding approved *(CA)* | CA office | **admin** |
| | Pay for your exam prep *(non-CA)* | you | **admin** |
| Train | We put you in a cohort | P&L | roster |
| | Do your prep work | you | worksheets complete |
| | Attend your live session | you | attendance |
| | Training certificate | P&L | `certified_on` |
| Get certified | Schedule and sit the oral exam | you | they tick it |
| | RBLP awards your credential | RBLP | **admin** |

Self-pay and Affirm students skip the invoice/approval line entirely — they pay and go into the
next available cohort. `routeFor()` decides, keyed off `FUNDING[...].paymentType`.

### The CA upload step

Students don't post anything to an office — they **upload both invoices on their branch's CA
website**. We deliberately don't document that portal: it changes, and RBLP already maintains a
step-by-step walkthrough per branch. The step links straight to it (`fundingGuidance(...).link`,
Army or Air Force depending on their funding source) and tells them to read it first.

The one thing we do state ourselves is the bit people get wrong: when the portal asks for the
**training company, select RLS** — the government-approved partner CA pays through — while their
instructor of record with RBLP stays Promote and Lead Solutions, LLC.

### The gate

**Prep work does not open until the money is confirmed** — CA approval for CA students, payment
received for everyone else. That's deliberate: the prep work is what we sell, and it comes with
the month password into RBLP's own material. Nobody starts it before their funding is real.

### What only Tommy can mark

Four facts reach us by email, not through the site: **RBLP confirmed**, **CA approved**, **Paid**,
**Certified**. They're buttons on the Admin tab's student table, and marking one moves the student
on *and emails them what happens next* (see `ADMIN_STEPS` in
`functions/api/classroom/action.js` for the copy). The buttons show their own state, so there's no
guessing whether you already told someone.

To change the journey, edit `JOURNEY` in `functions/_lib/classroom.js`. Steps are stored as rows in
`pl_pipeline_events`, so adding one is not a migration.

---

## 7. Roles: one admin, several instructors

**Admin is granted by `CLASSROOM_ADMINS` and nothing else.** Not by the `role` column, not by the
UI. A stored role of `admin` grants nothing — `effectiveRole()` only ever returns `admin` for an
address in that variable, and `student.role` rejects `admin` outright. The company owner sets up
cohorts, fills them and handles the money, so that authority follows a setting only he can change.

The safer failure is built in: if `CLASSROOM_ADMINS` is wrong, nobody is admin. Getting back in
means fixing the variable, not finding a back door.

Instructors are assigned from the Admin tab's staff table and get the Teaching guide and their own
cohorts — never the student journey, never other instructors' cohorts.

### Finishing a class

At the end of the day the instructor marks attendance, then presses **Complete the class for
everyone present**. That issues the training certificate for every attendee in one go; students
refresh and download their own.

Completing the class writes `certified_on` and `status: "completed"`. It deliberately does **not**
mean they passed RBLP's exam — that's the separate `certified` step, which only the company admin
marks when RBLP awards the credential. (This was a real bug: `member.certify` used to write
`status: "passed"`, which would have jumped every attendee to the end of their journey on the day
of the class.)

### The admin's copies

Every certificate issued is listed on the Admin tab with a **Download** button, because those
certificates go to RBLP and are what triggers our invoice. The company admin should never have to
ask a student for a copy.

### Instructor pay

The instructor console explains it, so it doesn't get asked by email every cohort: paid per
student, rate depending on how each student is funded; nothing is invoiced until the class is
complete and the certificates are with RBLP; RBLP pays us a week or two later; we pay the
instructor to their chosen method once those funds land. Edit `INSTRUCTOR_PAY` in
`functions/_lib/curriculum.js`.

---

## 8. What the research changed

`Classroom resources/RBLP-CANDID-FEEDBACK-RESEARCH.md` (12 Sep 2026) is the evidence base for the
copy below. Its own headline finding is worth keeping in mind: **there is almost no independent
first-person account of sitting this exam** — no fail stories, three thin Reddit threads. So the
app is built around the pain that *is* evidenced (published policy, process tripwires, a handful
of real user lines) rather than an invented "students say the oral is brutal" narrative.

**Exam mechanics** (`EXAM_FACTS`, `EXAM_BOOKING` in `curriculum.js`) now come from rblp.com:
results on the third business day, 09:00/11:00 starts, computer or tablet not a phone, cut score
in *every* domain, reschedule and no-show fees. Booking is a sequenced checklist because two
steps are known failure modes — booking while logged out causes checkout errors, and clicking
"add to cart" twice double-books you. The completion certificate is a **hard gate**: RBLP will
not schedule an exam without it, which is why the instructor issues certificates the same day.

> An older policy page on `resiliencebuildingleader.com` still describes a 180-day retake wait.
> It is out of date. Use rblp.com only. A test fails if "180" appears in the student payload.

**Not passing** is addressed rather than avoided: a one-hour second attempt, 30–90 days out, and
we go back over the missed domains with them. RBLP sells a retake product, so people do miss.

**CA packet warnings** (`CA_WARNINGS`) exist one-per-published-"don't": two separate requests,
vendor name must match **RLS** exactly, don't pay out of pocket to hold a seat, don't start before
funding, supervisor approval since March 2026, 45–90 day window. Shown only on the CA route.

**Worksheets gained two fields.** RBLP's oral tests factual, conceptual and procedural knowledge
*plus* Analyze, Evaluate and Create. What/Why/Why-to-my-life/Story covers through Analyze; the new
**"What would a leader get wrong here?"** (Evaluate) and **"If I ran this team tomorrow…"**
(Create) cover the rest. They're grouped under *Where the examiner will push* and print on the
exam packet.

**Instructors get mock-examiner prompts** (`MOCK_EXAMINER`) — "give me a different example",
"that's climate, not cohesion". Public praise for every ATP is 90% about the individual
instructor, so consistency is the differentiator, and a student who has only ever said an answer
once unchallenged meets follow-up for the first time in the exam.

**Site correction:** Navy, Marine Corps and Coast Guard COOL fund the **exam, not the prep**. The
site implied otherwise by listing them alongside Army/AF CA under "$0 out of pocket". Tested.

### Known gaps in the research

No first-person fail account, no published pass rate, no independent confirmation of the
interview-transfer value story, and USMC steps unverified (treated as Navy). Don't publish pass
rates or invented testimonials. The research recommends a post-cohort three-question pulse
(exam confidence, actual vs expected reflection hours, would-you-recommend-this-instructor) as
the way to get the candid feedback the public web doesn't have. **Not built yet.**

---

## 9. The teaching guide (instructor tab)

Instructors get a **Teaching guide** tab — the thing to have open while running a session. For
every leader task in every module it gives three lines:

- **Open with** — how to frame the task in a sentence, before any discussion.
- **Model it** — one of Tommy's own stories, so the instructor hears what *"in my experience…"*
  sounds like and can reach for their own. It is a prompt, not a script: the instructor's own
  story beats Tommy's in their room, and the page says so.
- **Ask the room** — the single merged, applied question to put to the group. Per the SOP we
  don't read the canned questions, because reading them makes people recite prepared lines.

Each module also carries the craft from the instructor Teaching Guide: the **75-minute
timebox**, **workplace translations** (the civilian register for mixed cohorts), **common
student misses**, and the **likely oral angles** as a coverage check. The session rhythm and
the facilitation quick-reference cards sit at the top of the tab.

Modules shown are limited to what the instructor's cohorts actually cover, so an RBLP cohort
isn't scrolling past module 5.

**This is instructor-only material.** It is served from `/api/classroom/console`, which is
role-gated, and never enters the student `/me` payload — students get their own worksheets, not
Tommy's answers. The tests assert that boundary.

To edit it, change `COACHING` (per task), `MODULE_OPENINGS` or `MODULE_TEACHING` (per module)
in `functions/_lib/curriculum.js`. Every task key must have an entry — a test fails if one is
missing. The same licence rule applies as everywhere else: this is Tommy's coaching *around*
the module, never a restatement of RBLP's module text.

### Which tabs an instructor sees

Home / My steps / Worksheets / My cohort / Oral exam are one person's journey through their own
certification. An instructor who isn't on a cohort roster has none of those, so those tabs are
hidden and they land on the Teaching guide. Enrol that same person as a student — Tommy working
through RBLP-T, say — and their student tabs come back automatically. Nothing to configure.

---

## 10. What the student sees for exam prep

From the student Learning Guide, alongside the worksheets:

- **How to study** (a toggle on the Worksheets tab) — habits for terms, stories, worksheets and
  the live session, plus **how the modules build**, with the student's own track highlighted.
- **Per module** — what "ready for the oral" looks like, what a good worksheet holds, and a
  **self-check** of the near-neighbour pairs that trip candidates (climate vs culture, social vs
  task cohesion, single- vs double-loop). Deliberately no answer key.
- **Oral exam tab** — exam-day mindset and a prep checklist.

### Exam length is per track

`TRACKS[...].examHours` carries rblp.com's operational oral lengths — **RBLP ≈1.5h, RBLP-C ≈2h,
RBLP-T ≈2.5h**. The exam page used to state 2.5 hours for everyone. ACE's National Guide lists
longer Coach/Trainer orals; that record is for credit conversations, **not** for scheduling, so
don't "correct" these against it. The candidate's confirmation from RBLP is the authority, and
the page says so.

We also don't tell candidates what they may have in front of them during the oral — RBLP's
current exam rules govern, and the page defers to them. A test enforces that.

### Day shapes are settled

Saturday windows are the academy-locked shapes: RBLP 09:00–12:30, RBLP-C 09:00–14:30, RBLP-T
09:00–15:30, breaks and lunch inside those end times. An earlier note put Trainer at 8h
instructional — that was **withdrawn**, and the tests pin the locked values so it can't drift
back.

---

## 11. The completion certificate

Students who pay with **Credentialing Assistance** have to hand their CA office proof they
completed the training. `/classroom` renders that certificate on the **Receive your completion
certificate** step: the student clicks **Download certificate** and prints to PDF.

It reproduces `Cert templates/CA Pay Cert Template.pptx` — same layout, same wording — but fills
itself in from the student's record instead of being retyped:

| On the certificate | Comes from |
|---|---|
| Name | the student's "name as it should appear on your certificate" |
| Level + module count | the cohort roster's `rblp_type` — RBLP 3, RBLP-C 4, RBLP-T 5 |
| Contact hours | the track's `paybackHours` — 3 / 4 / 5 |
| Cohort | the cohort `slug` |
| Date | `pl_cohort_members.certified_on`, else the last session they attended |
| Organisation + letterhead | **RLS** for CA-funded students, **Promote and Lead Solutions, LLC** for everyone else |

**Why the organisation changes.** CA money is processed by RLS, the government-approved ATP, so
a CA student's certificate has to name RLS or it won't match the claim paperwork. Self-pay,
Affirm and COOL students are trained and certified by PLS directly. This keys off
`FUNDING[...].paymentType === "CA"`, so a new CA source is picked up automatically.

**To issue one:** set `certified_on` on the student's `pl_cohort_members` row in `/admin` (or
tick the `certificate` step in the classroom Admin tab). Until then the step just says the
certificate follows the live session. If the student never filled in their name, the step asks
them for it rather than printing a certificate no CA office would accept.

The blank PowerPoint template is **gitignored** for the same reason as the content pack: Pages
serves the repo root, so committing it would publish a fillable, seal-bearing certificate.

---

## 12. Security model

- **Sessions** — `pl_classroom` cookie: `HttpOnly; Secure; SameSite=Lax`, HMAC-SHA256 signed,
  30-day expiry. The cookie carries only student id + email + expiry; the **role is re-read from
  the database on every request**, so a promotion or demotion takes effect immediately.
- **One-time codes** — 6 digits, 15-minute expiry, single use, max 5 wrong attempts, max 5 codes
  per address per hour. Stored **HMAC-hashed**, never in the clear.
- **Authorization** — the student id always comes from the cookie, never the request body.
  Students can only touch their own row and their own worksheet responses. Instructors are scoped
  to cohorts where `instructor_email` matches them. Admin-only actions check the role explicitly.
- **Student privacy** — the instructor console returns **completion percentages only**. Students'
  written answers are never sent to instructors or admins.
- **Supabase** — unchanged: RLS on, no policies, service-role access server-side only. The browser
  never talks to Supabase; it talks to `/api/classroom/*`.

### Why not Supabase Auth's built-in OTP

Supabase's own OTP would need the anon key in the browser and its built-in SMTP, which is limited
to ~2 emails/hour on the default sender and sends unbranded mail. This site already sends branded
mail through Resend and keeps Supabase strictly server-side, so Supabase stays the store, Resend
delivers the code, and the session is a signed cookie. Same user experience, better deliverability,
no new key in the browser.

---

## 13. Tests

```bash
node tests/classroom.e2e.mjs
```

261 assertions, no dependencies and no network: the real Pages Functions run in Node against an
in-memory PostgREST stand-in with Resend captured. Covers the sign-in flow, code expiry/replay/
rate-limiting, the pipeline gates, per-track worksheets, the cohort card, attendance, every
authorization boundary, and the two licence guards above.

---

## 14. Files

```
classroom/index.html                 ← the whole student/instructor/admin UI (incl. the certificate)
assets/cert/                         ← certificate letterhead + RBLP ATP seal
functions/_lib/curriculum.js         ← module outline, starters, glossary, rblp.com links,
                                       COACHING + MODULE_OPENINGS (instructor teaching guide)
functions/_lib/classroom.js          ← pipeline, funding copy, progress + hours logic
functions/_lib/session.js            ← one-time codes + signed cookie sessions
functions/_lib/email.js              ← branded email shells (shared with the admin sender)
functions/api/classroom/auth.js      ← request-code / verify-code / logout
functions/api/classroom/me.js        ← student bootstrap payload
functions/api/classroom/action.js    ← every mutation, role-gated
functions/api/classroom/console.js   ← instructor + admin data
supabase-classroom-schema.sql        ← the schema
tests/classroom.e2e.mjs              ← end-to-end suite
```
