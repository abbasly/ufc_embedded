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
| `tests/run.sh` | Applies every migration to a throwaway local Postgres and runs every `tests/*_test.sql`. Runs in CI. |
| `tests/supabase_shim.sql` | The bits of Supabase the migrations rely on (roles, `auth.users`, `auth.uid()`), for plain Postgres. |

The website side is in `web/src/backend/` (the only code that knows about Supabase; a demo
backend in the same folder stands in for it during development) and `web/src/auth/`.

## Tables

| Table | Who writes | Who reads |
|---|---|---|
| `profiles` | each user, their own (display name, avatar: a fighter's id) | everyone |
| `events`, `bouts` | the data pipeline (cards, segments, results) | everyone |
| `picks` | each user, their own, until the event locks | only the owner |
| `scores` | the scoring job | everyone (`leaderboard` view) |
| `leagues`, `league_members` | through functions (create, join, leave) | members only |
| `friendships` | through functions (request, accept, remove) | the two people in it |

`delete_my_account()` removes a user and everything of theirs. `score_event(id)` scores an
event from its results (10 for the right winner, +5 for the method, +5 for an underdog); only
the pipeline (service role, or the SQL editor) may run it.

## From the command line

One-time setup, from the project root (the database password is in Supabase → Project
Settings → Database; the connection string under Connect → Session pooler):

```bash
npx supabase login                                   # opens the browser once
npx supabase init                                    # writes supabase/config.toml (answer N to the questions)
npx supabase link --project-ref bydkxilpsbfpfbbdkhds  # asks for the database password
echo 'SUPABASE_DB_URL="postgresql://postgres.bydkxilpsbfpfbbdkhds:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"' >> .env
```

Then:

```bash
npx supabase db push --remote                        # apply new migrations (and only those)
npx supabase migration list --remote                 # which are applied
npx supabase functions deploy friend-request-email --no-verify-jwt
source .env && uv run python -m ufc_embedded.pickem_sync | psql "$SUPABASE_DB_URL"   # cards + results
source .env && psql "$SUPABASE_DB_URL" -f supabase/queries/stats.sql                 # Pick'em stats
```

`db push` remembers what it applied in the database itself. Migrations applied by hand in the
SQL editor before using it are marked as applied once with
`npx supabase migration repair --remote --status applied <version> ...`. (`--remote`: the
CLI otherwise means a local Supabase in Docker, which this project doesn't use.)

## Cards and results

```bash
uv run python -m ufc_embedded.pickem_sync | pbcopy   # from the project root; paste in the SQL editor
```

A GitHub Action (`.github/workflows/pickem-sync.yml`) runs this automatically: every 15
minutes on Saturdays and Sundays (UTC), hourly otherwise, with the database's Session pooler
connection string as the `SUPABASE_DB_URL` repository secret. Results land as Wikipedia gets
them, and the Pick'em page checks back every minute while a card is being fought.

Cards come from each event's Wikipedia page (running order, main card / prelims / early
prelims, title fights), odds from the bookmakers. Run it again after an event: once every bout
on the page has a result, the same SQL writes the results and scores the event.

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

## Going live

1. **Email sender (Resend).** Supabase's built-in email is for testing only (a few emails an
   hour). At resend.com: add the domain `anarli.com`, add the DNS records it shows in
   Cloudflare (DNS only, grey cloud), wait for "Verified", and create an API key with sending
   access. In Supabase, Authentication → Emails → SMTP settings: host `smtp.resend.com`, port
   `465`, user `resend`, password the API key, sender `noreply@anarli.com`, name
   `UFC Embedded`. Then raise Authentication → Rate limits → emails per hour (e.g. 30).
2. **Google sign-in.** In Google Cloud (console.cloud.google.com): a project, an OAuth consent
   screen (External; app name, support email, authorised domain `anarli.com`; scopes `openid`,
   `email`, `profile`; publish it), and an OAuth client of type *Web application* with
   JavaScript origins `https://ufc.anarli.com` and `http://localhost:5173`, and redirect URI
   `https://<project ref>.supabase.co/auth/v1/callback` (one per Supabase project). Paste its
   client id and secret in Supabase, Authentication → Sign In / Providers → Google.
3. **Email templates.** Authentication → Emails → Templates: paste the files in
   `email-templates/` (see its README), so emails are branded and link to the site itself.
4. **Production project.** A second project, `ufc-embedded` (Frankfurt), with every migration
   applied in order, the same email, Google and URL settings, and the cards loaded
   (`uv run python -m ufc_embedded.pickem_sync`).
5. **GitHub.** Repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` with the
   *production* project's values (development keeps using `web/.env.local`). The next deploy
   from `master` switches accounts on.
6. **Friend-request emails.** The `friend-request-email` Edge Function (`functions/`) emails
   players when someone asks them to be friends. Deploy it (Edge Functions → Deploy a new
   function → Via editor, name `friend-request-email`, paste `index.ts` and `email.ts`, and
   turn off "Verify JWT": the function checks its own secret), add its secrets
   (`RESEND_API_KEY`, and `WEBHOOK_SECRET`: any long random string), then Database → Webhooks →
   Create: table `friendships`, event Insert, type Supabase Edge Functions,
   `friend-request-email`, POST, with an HTTP header `x-webhook-secret` set to the same string.
7. **Legal.** Fill in `web/src/pages/legal.ts` (Impressum); the privacy policy already covers
   accounts, Supabase, Resend and Google.
