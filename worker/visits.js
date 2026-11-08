// Cloudflare Worker (ufc-visits, on workers.dev): the site's visits for the admin panel, per
// day and per country, from Cloudflare Web Analytics.
//
// Cloudflare only shares analytics through its API, with a token that must never reach the
// browser. So the token lives here, as an encrypted Worker secret. Only signed-in admins get an
// answer: the panel sends the user's Supabase token and the database says whether they're one.
// Nothing secret is in this file or in the repo.
//
// Setup (Cloudflare dashboard): paste this file as the Worker's code, then under the Worker's
// Settings -> Variables and Secrets add:
//   CF_API_TOKEN      (type Secret) - an API token with only Account > Account Analytics > Read
//   ACCOUNT_ID        (type Text)   - the account id (in the dashboard URL)
//   SITE_TAG          (type Text)   - the Web Analytics site tag of ufc.anarli.com (siteTag in the
//                                      Web Analytics URL)
//   SUPABASE_URL      (type Text)   - the project's URL, as the site uses it
//   SUPABASE_ANON_KEY (type Text)   - the project's public anon key, as the site uses it
// On a *.workers.dev address the cache isn't available, so answers are kept in memory instead.
//
// GET /?days=7|30|90, with "Authorization: Bearer <Supabase access token>".

const RANGES = [7, 30, 90];
const CACHE_SECONDS = 600; // ask Cloudflare's API at most every 10 minutes
const ALLOWED_ORIGINS = ["https://ufc.anarli.com", "https://beta.anarli.com", "http://localhost:5173"];
const API = "https://api.cloudflare.com/client/v4/graphql";
const DAY = 86400e3;
// Workers may make 50 outgoing requests per run; each piece of the range takes two.
const MAX_PIECES = 22;

// The analytics API caps how long a time range one query may cover, and how far back it goes;
// read those, then ask for the days in pieces of that size.
const SETTINGS = `query ($account: string!) {
  viewer { accounts(filter: { accountTag: $account }) {
    settings { rumPageloadEventsAdaptiveGroups { maxDuration notOlderThan } }
  } }
}`;
const byDimension = (dimension) => `query ($account: string!, $site: string!, $from: Time!, $to: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    rumPageloadEventsAdaptiveGroups(
      limit: 1000
      filter: { siteTag: $site, datetime_geq: $from, datetime_lt: $to }
    ) { count sum { visits } dimensions { ${dimension} } }
  } }
}`;

async function graphql(env, query, variables) {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors?.length) {
    // Only the API's own message (never the request or the token).
    throw new Error(body.errors?.[0]?.message ?? `analytics API answered ${res.status}`);
  }
  return body.data.viewer.accounts[0];
}

async function limits(env) {
  try {
    const settings = await graphql(env, SETTINGS, { account: env.ACCOUNT_ID });
    const s = settings.settings?.rumPageloadEventsAdaptiveGroups;
    const row = Array.isArray(s) ? s[0] : s;
    return { step: row?.maxDuration > 0 ? row.maxDuration * 1000 : 7 * DAY, oldest: row?.notOlderThan > 0 ? row.notOlderThan * 1000 : Infinity };
  } catch {
    return { step: 7 * DAY, oldest: Infinity }; // if the caps can't be read, 7 days is allowed everywhere
  }
}

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

async function stats(env, days) {
  const end = Date.now();
  const { step, oldest } = await limits(env);
  const start = Math.max(end - days * DAY, end - oldest + 60e3, end - MAX_PIECES * step);
  const pieces = [];
  for (let t = start; t < end; t += step) pieces.push([new Date(t).toISOString(), new Date(Math.min(t + step, end)).toISOString()]);

  const groups = (dimension) =>
    Promise.all(
      pieces.map(async ([from, to]) => {
        const data = await graphql(env, byDimension(dimension), { account: env.ACCOUNT_ID, site: env.SITE_TAG, from, to });
        return data.rumPageloadEventsAdaptiveGroups;
      }),
    ).then((rows) => rows.flat());
  const [perDay, perCountry] = await Promise.all([groups("date"), groups("countryName")]);

  // Every day in the range, including the ones nobody visited.
  const series = new Map();
  for (let t = start; isoDay(t) <= isoDay(end); t += DAY) series.set(isoDay(t), { date: isoDay(t), visits: 0, pageViews: 0 });
  for (const row of perDay) {
    const day = series.get(row.dimensions.date);
    if (day) {
      day.visits += row.sum?.visits ?? 0;
      day.pageViews += row.count ?? 0;
    }
  }
  const countries = new Map();
  for (const row of perCountry) {
    const code = row.dimensions.countryName || "";
    const c = countries.get(code) ?? { country: code, visits: 0 };
    c.visits += row.sum?.visits ?? 0;
    countries.set(code, c);
  }
  const days_ = [...series.values()];
  return {
    days,
    visits: days_.reduce((n, d) => n + d.visits, 0),
    pageViews: days_.reduce((n, d) => n + d.pageViews, 0),
    series: days_,
    countries: [...countries.values()].filter((c) => c.visits > 0).sort((a, b) => b.visits - a.visits),
    updated: new Date(end).toISOString(),
  };
}

/** Asks the database, as the person making this request, whether they're an admin. */
async function isAdmin(env, authorization) {
  if (!authorization?.startsWith("Bearer ")) return false;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization, "Content-Type": "application/json" },
    body: "{}",
  });
  return res.ok && (await res.json()) === true;
}

// Also kept in memory, for when the cache isn't available (on *.workers.dev).
const memo = new Map(); // days -> { at: ms, body: string }

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store", // admins only: browsers and proxies don't keep a copy
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Headers": "Authorization",
      Vary: "Origin",
    };
    const answer = (body, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "GET") return answer({ error: "method not allowed" }, 405);
    if (!(await isAdmin(env, request.headers.get("Authorization")))) return answer({ error: "not allowed" }, 403);

    const days = Number(new URL(request.url).searchParams.get("days") ?? 7);
    if (!RANGES.includes(days)) return answer({ error: "days must be 7, 30 or 90" }, 400);

    // Past the admin check: one cached answer per range. (Worker-side only, never public.)
    const cache = caches.default;
    const key = new Request(`https://visits.cache/stats/${days}`);
    const hit = await cache.match(key);
    if (hit) return answer(await hit.text());
    const kept = memo.get(days);
    if (kept && Date.now() - kept.at < CACHE_SECONDS * 1000) return answer(kept.body);

    try {
      const body = JSON.stringify(await stats(env, days));
      memo.set(days, { at: Date.now(), body });
      ctx.waitUntil(cache.put(key, new Response(body, { headers: { "Cache-Control": `public, max-age=${CACHE_SECONDS}` } })));
      return answer(body);
    } catch (err) {
      return answer({ error: String(err.message ?? err) }, 502);
    }
  },
};
