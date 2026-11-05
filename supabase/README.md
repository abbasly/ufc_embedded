# Accounts backend (Supabase)

Accounts and Pick'em live in a [Supabase](https://supabase.com) project: Supabase Auth for
sign-in (Google, or a one-time email link: no passwords) and Postgres for the data. The site
talks to it straight from the browser with the public *anon* key; what each visitor may read
and write is enforced by the database's row level security, not by the website.

```
browser ── sign-in, own profile, own picks ──► Supabase (Auth + Postgres + RLS)
pipeline / scoring job ── service-role key ──► Supabase   (never in the site)
```

## Layout

| Path | What |
|---|---|
| `migrations/` | The schema and its security rules, in order. Never edit an applied migration: add a new one. |
| `tests/run.sh` | Applies every migration to a throwaway local Postgres and runs `tests/rls_test.sql`. Runs in CI. |
| `tests/supabase_shim.sql` | The bits of Supabase the migrations rely on (roles, `auth.users`, `auth.uid()`), for plain Postgres. |

The website side is in `web/src/backend/` (the only code that knows about Supabase; a demo
backend in the same folder stands in for it during development) and `web/src/auth/`.

## Tables

| Table | Who writes | Who reads |
|---|---|---|
| `profiles` | each user, their own (display name only) | everyone |
| `events`, `bouts` | the data pipeline | everyone |
| `picks` | each user, their own, until the event locks | only the owner |
| `scores` | the scoring job | everyone (`leaderboard` view) |

`delete_my_account()` removes a user and everything of theirs.

## Testing

```bash
supabase/tests/run.sh          # needs initdb / pg_ctl / psql, e.g. brew install postgresql
```

Each test signs in as a user (or a visitor) and checks what the database lets them do.

## Trying the account screens locally

```bash
cd web && VITE_ACCOUNTS=demo npm run dev
```

The demo backend keeps everything in the browser: "signing in" makes you a demo user.

## Setting up the real project

1. Create two projects at supabase.com, `ufc-embedded-dev` and `ufc-embedded` (production).
2. Apply the migrations: SQL editor, run each file in `migrations/` in order (or
   `npx supabase db push` with the CLI).
3. Authentication → Providers: enable Google (OAuth client from Google Cloud) and email.
   Authentication → URL configuration: site URL `https://ufc.anarli.com`, plus
   `http://localhost:5173` as a redirect URL for development.
4. GitHub repository variables: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Project settings →
   API). The *service-role* key goes only into GitHub **secrets**, for the pipeline and the
   scoring job, never into the site.
