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
const MAX_DAYS = Math.max(...RANGES);
// Workers may make 50 outgoing requests per run; each piece of the period takes one.
const MAX_PIECES = 45;

// The analytics API caps how long a time range one query may cover, and how far back it goes;
// read those, then ask for the days in pieces of that size.
const SETTINGS = `query ($account: string!) {
  viewer { accounts(filter: { accountTag: $account }) {
    settings { rumPageloadEventsAdaptiveGroups { maxDuration notOlderThan } }
  } }
}`;
const ROWS = `query ($account: string!, $site: string!, $from: Time!, $to: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    rumPageloadEventsAdaptiveGroups(
      limit: 1000
      filter: { siteTag: $site, datetime_geq: $from, datetime_lt: $to }
    ) { count sum { visits } dimensions { date countryName } }
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

// Cloudflare's numbers are estimates from a sample, so separate queries for a week and a month
// don't add up and can even contradict each other. So there's one read of the whole period, in
// whole UTC days, and every range is cut out of that same data.
async function loadDays(env) {
  const now = Date.now();
  const { step, oldest } = await limits(env);
  const today = Math.floor(now / DAY) * DAY;
  const earliest = Math.ceil(Math.max(now - oldest + 60e3, now - MAX_PIECES * step) / DAY) * DAY;
  const start = Math.max(today - (MAX_DAYS - 1) * DAY, earliest);
  const pieces = [];
  for (let t = start; t < now; t += step) pieces.push([new Date(t).toISOString(), new Date(Math.min(t + step, now)).toISOString()]);
  const groups = await Promise.all(
    pieces.map(async ([from, to]) => {
      const data = await graphql(env, ROWS, { account: env.ACCOUNT_ID, site: env.SITE_TAG, from, to });
      return data.rumPageloadEventsAdaptiveGroups;
    }),
  );
  const rows = groups.flat().map((g) => ({
    date: g.dimensions.date,
    country: g.dimensions.countryName || "",
    visits: g.sum?.visits ?? 0,
    pageViews: g.count ?? 0,
  }));
  return { start, today, rows, updated: new Date(now).toISOString() };
}

/** The last ``days`` days of the data, as the admin panel shows them. */
function forRange({ start, today, rows, updated }, days) {
  const series = new Map();
  for (let t = Math.max(start, today - (days - 1) * DAY); t <= today; t += DAY) series.set(isoDay(t), { date: isoDay(t), visits: 0, pageViews: 0 });
  const countries = new Map();
  for (const row of rows) {
    const day = series.get(row.date);
    if (!day) continue;
    day.visits += row.visits;
    day.pageViews += row.pageViews;
    const c = countries.get(row.country) ?? { country: row.country, visits: 0 };
    c.visits += row.visits;
    countries.set(row.country, c);
  }
  const list = [...series.values()];
  return {
    days,
    visits: list.reduce((n, d) => n + d.visits, 0),
    pageViews: list.reduce((n, d) => n + d.pageViews, 0),
    series: list,
    countries: [...countries.values()].filter((c) => c.visits > 0).sort((a, b) => b.visits - a.visits),
    updated,
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
let memo = null; // { at: ms, data }

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

    // Past the admin check: one cached read of the data. (Worker-side only, never public.)
    const cache = caches.default;
    const key = new Request("https://visits.cache/days");
    const hit = await cache.match(key);
    if (hit) return answer(forRange(await hit.json(), days));
    if (memo && Date.now() - memo.at < CACHE_SECONDS * 1000) return answer(forRange(memo.data, days));

    try {
      const data = await loadDays(env);
      memo = { at: Date.now(), data };
      ctx.waitUntil(cache.put(key, new Response(JSON.stringify(data), { headers: { "Cache-Control": `public, max-age=${CACHE_SECONDS}` } })));
      return answer(forRange(data, days));
    } catch (err) {
      return answer({ error: String(err.message ?? err) }, 502);
    }
  },
};
