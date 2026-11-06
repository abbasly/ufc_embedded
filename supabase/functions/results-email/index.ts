// Emails everyone who picked on a card how they did, once it's scored. Called by a database
// webhook on events (UPDATE), never by the site. One email per player per card, ever
// (results_email_notices), and only to players who haven't turned them off.
//
// Secrets: RESEND_API_KEY, WEBHOOK_SECRET (as the webhook's x-webhook-secret header), like
// friend-request-email. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "jsr:@supabase/supabase-js@2";

import { type Bout, cardLines, type Pick, resultsEmail } from "./results.ts";

const MODEL_PLAYER = "the_model";
const BATCH = 100; // Resend's batch limit

const reply = (status: number, body: string) => {
  console.log(`results-email: ${body}`);
  return new Response(`results-email: ${body}`, { status });
};

Deno.serve(async (req) => {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return reply(403, "forbidden");

  const { type, table, record } = await req.json();
  if (type !== "UPDATE" || table !== "events" || !record?.scored_at) {
    return reply(200, `ignored (${type} on ${table}${record && !record.scored_at ? ", not scored" : ""})`);
  }
  const eventId: string = record.id;

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const [scores, bouts, sent, model] = await Promise.all([
    db.from("scores").select("user_id, points, correct, picked").eq("event_id", eventId).order("points", { ascending: false }),
    db.from("bouts").select("*").eq("event_id", eventId),
    db.from("results_email_notices").select("user_id").eq("event_id", eventId),
    db.from("profiles").select("id").eq("display_name", MODEL_PLAYER).maybeSingle(),
  ]);
  if (scores.error || bouts.error) return reply(500, `read: ${scores.error?.message ?? bouts.error?.message}`);
  const rows = scores.data ?? [];
  if (!rows.length) return reply(200, "nobody played");

  // Ranks on the card, ties sharing a place; the model counts as a player like everyone.
  const rankOf = new Map<string, number>();
  rows.forEach((r, i) => rankOf.set(r.user_id, i > 0 && r.points === rows[i - 1]!.points ? rankOf.get(rows[i - 1]!.user_id)! : i + 1));
  const modelPoints = model.data ? (rows.find((r) => r.user_id === model.data!.id)?.points ?? null) : null;
  const done = new Set((sent.data ?? []).map((s) => s.user_id));

  const ids = rows.map((r) => r.user_id).filter((id) => id !== model.data?.id && !done.has(id));
  if (!ids.length) return reply(200, "everyone already emailed");
  const [profiles, picks] = await Promise.all([
    db.from("profiles").select("id, notify_results").in("id", ids),
    db.from("picks").select("user_id, bout_id, winner, method").in("user_id", ids).in("bout_id", (bouts.data ?? []).map((b) => b.id)),
  ]);
  const wanted = new Set((profiles.data ?? []).filter((p) => p.notify_results).map((p) => p.id));

  const emails: { user: string; to: string; subject: string; html: string; text: string }[] = [];
  for (const r of rows) {
    if (!wanted.has(r.user_id)) continue;
    const { data: user } = await db.auth.admin.getUserById(r.user_id);
    const to = user?.user?.email;
    if (!to) continue;
    const mine = (picks.data ?? []).filter((p) => p.user_id === r.user_id) as Pick[];
    const { lines, best } = cardLines(bouts.data as Bout[], mine);
    const mail = resultsEmail(
      { name: record.name, points: r.points, correct: r.correct, picked: r.picked, rank: rankOf.get(r.user_id)!, players: rows.length, model: modelPoints, lines, best },
      eventId,
    );
    emails.push({ user: r.user_id, to, ...mail });
  }

  let delivered = 0;
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify(batch.map((e) => ({ from: "UFC Embedded <noreply@anarli.com>", to: e.to, subject: e.subject, html: e.html, text: e.text }))),
    });
    if (!res.ok) {
      // Over the daily quota, say: the rest go out the next time the card is scored.
      console.log(`results-email: resend ${res.status} ${await res.text()}`);
      break;
    }
    await db.from("results_email_notices").upsert(batch.map((e) => ({ event_id: eventId, user_id: e.user })));
    delivered += batch.length;
  }
  return reply(200, `sent ${delivered} of ${emails.length}`);
});
