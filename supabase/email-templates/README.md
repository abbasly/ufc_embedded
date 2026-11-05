# Email templates

Supabase sends these (Authentication → Emails → Templates); paste each file's HTML into its
template there. They live here so they're versioned with the site.

| Template in Supabase | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Confirm your email for UFC Embedded |
| Reset password | `reset-password.html` | Set a new password for UFC Embedded |

The links point at the site itself (`{{ .SiteURL }}/?token_hash=...&type=...`, with the site URL
set to https://ufc.anarli.com), not at Supabase's own address: shorter, clearly ours, and they
work on any device. The site finishes them (`finishEmailLink` in web/src/backend/supabase.ts).
