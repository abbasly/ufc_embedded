// Cloudflare Worker behind https://visits.anarli.com: the site's visits over the last 30 days,
// from Cloudflare Web Analytics, for the About page ("N visits in the last 30 days").
//
// Cloudflare only shares analytics through its API, with a token that must never reach the
// browser. So the token lives here, as an encrypted Worker secret, and the page only ever gets
// two numbers back. Nothing secret is in this file or in the repo.
//
// Setup (Cloudflare dashboard): paste this file as the Worker's code, then under the Worker's
// Settings -> Variables and Secrets add:
//   CF_API_TOKEN  (type Secret) - an API token with only Account > Account Analytics > Read
//   ACCOUNT_ID    (type Text)   - the account id (in the dashboard URL)
//   SITE_TAG      (type Text)   - the Web Analytics site tag of ufc.anarli.com (siteTag in the
//                                  Web Analytics URL)
// and attach the custom domain visits.anarli.com (Settings -> Domains & Routes), so responses
// can be cached (the cache doesn't work on *.workers.dev addresses).

const DAYS = 30;
const CACHE_SECONDS = 600; // ask Cloudflare's API at most every 10 minutes
const ALLOWED_ORIGINS = ["https://ufc.anarli.com", "http://localhost:5173"];
const API = "https://api.cloudflare.com/client/v4/graphql";

// The analytics API caps how long a time range one query may cover; read the cap, then ask
// for the 30 days in pieces of that size.
const SETTINGS = `query ($account: string!) {
  viewer { accounts(filter: { accountTag: $account }) {
    settings { rumPageloadEventsAdaptiveGroups { maxDuration } }
  } }
}`;
const TOTALS = `query ($account: string!, $site: string!, $from: Time!, $to: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    rumPageloadEventsAdaptiveGroups(
      limit: 1
      filter: { siteTag: $site, datetime_geq: $from, datetime_lt: $to }
    ) { count sum { visits } }
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

async function countVisits(env) {
  const end = new Date();
  const start = new Date(end.getTime() - DAYS * 86400e3);
  let step = 7 * 86400e3; // if the cap can't be read, 7 days is allowed everywhere
  try {
    const settings = await graphql(env, SETTINGS, { account: env.ACCOUNT_ID });
    const s = settings.settings?.rumPageloadEventsAdaptiveGroups;
    const max = (Array.isArray(s) ? s[0] : s)?.maxDuration;
    if (max > 0) step = Math.min(DAYS * 86400e3, max * 1000);
  } catch {
    // keep the 7-day pieces
  }
  const pieces = [];
  for (let t = start.getTime(); t < end.getTime(); t += step) {
    pieces.push([new Date(t), new Date(Math.min(t + step, end.getTime()))]);
  }
  const totals = await Promise.all(
    pieces.map(async ([from, to]) => {
      const vars = { account: env.ACCOUNT_ID, site: env.SITE_TAG, from: from.toISOString(), to: to.toISOString() };
      const data = await graphql(env, TOTALS, vars);
      const row = data.rumPageloadEventsAdaptiveGroups[0];
      return { visits: row?.sum?.visits ?? 0, pageViews: row?.count ?? 0 };
    }),
  );
  return {
    visits: totals.reduce((a, t) => a + t.visits, 0),
    pageViews: totals.reduce((a, t) => a + t.pageViews, 0),
    days: DAYS,
    updated: end.toISOString(),
  };
}

// Also kept in memory, for when the cache isn't available (on *.workers.dev).
let memo = null; // { at: ms, body: string }

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      Vary: "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

    // One cached answer for everyone (per origin, because of the CORS header).
    const cache = caches.default;
    const key = new Request(`https://visits.cache/${encodeURIComponent(origin ?? "")}`);
    const hit = await cache.match(key);
    if (hit) return hit;
    if (memo && Date.now() - memo.at < CACHE_SECONDS * 1000) return new Response(memo.body, { headers });

    try {
      memo = { at: Date.now(), body: JSON.stringify(await countVisits(env)) };
      const res = new Response(memo.body, { headers });
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err.message ?? err) }), {
        status: 502,
        headers: { ...headers, "Cache-Control": "no-store" },
      });
    }
  },
};
