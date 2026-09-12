# Connect your Supabase DB to a Claude Code session

A reusable recipe to give a Claude Code (CC) session **direct SQL access** to a
Supabase project's Postgres — so it can run `pg_policies`/`pg_class` audits, apply
migrations, and verify fixes against the live DB. Works on macOS with no `psql` and
no Homebrew installs (uses the pure-Python `pg8000` driver).

> **Why not just the anon key?** The anon/publishable key only exercises RLS as an
> anonymous user. A direct DB connection (role `postgres`) lets CC read the real
> schema, run privileged queries, and apply migrations. Treat it as root — hand it
> over deliberately and revoke when done.

---

## Security principles (read first)
- The connection string contains your **DB password = full access**. Keep it out of
  chat and out of git.
- Put it in a **gitignored file** (`.sbconn`), never paste it into the chat.
- Ask CC to do a **read-only sanity check first** (`select current_database()`), and
  to **never print** the connection string.
- When finished: **delete `.sbconn`** and **reset the DB password** in Supabase.
- Prefer resetting the DB password to a fresh value for the session — resetting it
  does **not** break your app (the app connects via the anon/service **keys**
  through PostgREST, not this password).

---

## Step 1 — get the connection string
Supabase dashboard → your project → **Connect** (top center) → choose a mode:

- **Session pooler** (recommended): host `…pooler.supabase.com`, port `5432`,
  user `postgres.<project-ref>`. It's **IPv4**, so it works from any machine.
- **Direct connection**: host `db.<project-ref>.supabase.co`, port `5432`, user
  `postgres`. Often **IPv6-only** now — if your machine has no IPv6 route it will
  time out. Use the pooler if unsure.
- **Transaction pooler** (port `6543`): fine for simple queries, but avoid it for
  DDL/migrations (no session state, no prepared statements). Use Session pooler for
  applying migrations.

Copy the URI and replace `[YOUR-PASSWORD]` with your **database password**
(Settings → Database → Database password → **Reset** if you don't have it).

## Step 2 — save it to a gitignored file
In the project root (a Terminal already `cd`'d there):

```bash
# make sure it can never be committed/deployed
grep -qx '.sbconn' .gitignore 2>/dev/null || echo '.sbconn' >> .gitignore

# write the string (SINGLE quotes so special chars in the password survive)
echo 'postgresql://postgres.<project-ref>:<PASSWORD>@aws-1-<region>.pooler.supabase.com:5432/postgres' > .sbconn

# confirm it saved (does NOT print the password)
wc -c .sbconn
```

`.sbconn` is a hidden dotfile — in Finder press **⌘⇧.** to see it.

## Step 3 — tell CC to connect
Say: *"the connection string is in `.sbconn` — connect (read-only sanity check first)
and never print it."* CC will use a helper like the one below.

---

## The helper (what CC runs — copy/paste-able)

One-time setup of a pure-Python Postgres driver (no Homebrew, no `psql`):

```bash
python3 -m venv .dbenv && ./.dbenv/bin/pip install -q pg8000
```

A tiny SQL runner that reads `.sbconn`, connects over TLS, and runs SQL from stdin —
without ever echoing the connection string:

```python
# sbq.py  — usage:  echo "select 1;" | ./.dbenv/bin/python sbq.py
import sys, ssl, json, urllib.parse
import pg8000.native
u = urllib.parse.urlparse(open(".sbconn").read().strip())
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
con = pg8000.native.Connection(
    user=urllib.parse.unquote(u.username or "postgres"),
    password=urllib.parse.unquote(u.password or ""),
    host=u.hostname, port=u.port or 5432,
    database=(u.path or "/postgres").lstrip("/") or "postgres",
    ssl_context=ctx, timeout=20)
sql = sys.stdin.read()
rows = con.run(sql)
cols = [c["name"] for c in con.columns] if con.columns else []
print(json.dumps({"columns": cols, "rows": rows}, default=str))
```

Examples:

```bash
# sanity check
echo "select current_database(), current_user;" | ./.dbenv/bin/python sbq.py

# RLS state — any table with RLS OFF?
echo "select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity=false;" | ./.dbenv/bin/python sbq.py

# every live policy predicate
echo "select tablename, policyname, roles::text, cmd, qual, with_check from pg_policies where schemaname='public' order by tablename;" | ./.dbenv/bin/python sbq.py

# apply a migration file (whole file; comments are ignored)
./.dbenv/bin/python sbq.py < supabase/migrations/00XX_something.sql
```

**Test writes without mutating** (RLS/trigger verification): wrap in a transaction
and roll back, simulating an authenticated user:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<a-real-user-uuid>","role":"authenticated"}', true);
-- ... your insert/update ...
rollback;   -- proves permission, changes nothing
```

---

## Common errors
- **`28P01 password authentication failed`** → wrong/forgotten DB password. Reset it
  (Settings → Database → Database password) and rewrite `.sbconn`. Won't break the app.
- **Connection times out / hangs** → you used the **Direct** (IPv6-only) string on an
  IPv4-only network. Switch to the **Session pooler** string.
- **Password has special characters** (`@ : / ?`) → URL-encode them, or better, reset
  to a password with only letters/digits/`-`/`_` for the session.
- **`syntax error` applying a migration** → feed the **whole file** (don't slice it);
  dollar-quoted function bodies (`$$ … $$`) break if cut mid-statement.

## Cleanup (do this when finished)
```bash
rm -f .sbconn
```
Then in Supabase, **reset the DB password** again so the one CC saw is dead, and
delete the throwaway `.dbenv`/`sbq.py` if you like.

---

## Alternative — the Supabase CLI (`supabase db diff`, `db push`)
If you want the official tooling instead of raw SQL:
```bash
supabase login              # paste a personal access token from
                            #   supabase.com/dashboard/account/tokens
supabase link --project-ref <project-ref>   # prompts for the DB password
supabase db diff --linked   # schema drift vs your migrations
supabase db push            # apply pending migrations (records them in
                            #   supabase_migrations.schema_migrations)
```
This needs **two** secrets (access token + DB password) and grants management-API
access to your whole account, so it's higher-privilege than the `.sbconn` route.
Use it when you specifically want `db diff`/`db push`; use `.sbconn` for a quick,
lower-privilege, project-scoped SQL session.
