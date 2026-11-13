// A one-off "pick your fights" email before a big card (first used for UFC 334). Called by hand,
// never by the site, with the REMINDER_TOKEN secret as the x-reminder-token header:
//   {"event": "<id>"}                        a dry run: who would get it, and the email itself
//   {"event": "<id>", "only": "<address>"}   send it to one address (a test)
//   {"event": "<id>", "send": true}          send it to everyone it's for
// Goes to accounts with a confirmed email that haven't turned emails off and haven't picked the
// whole main card yet. Not repeatable: run "send" once.

import { createClient } from "jsr:@supabase/supabase-js@2";

import { type Bout, reminder } from "./reminder.ts";

const MODEL_PLAYER = "the_model";
const BATCH = 100; // Resend's batch limit

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  const token = Deno.env.get("REMINDER_TOKEN");
  if (!token || req.headers.get("x-reminder-token") !== token) return json(403, { error: "forbidden" });
  const { event, send, only } = await req.json();
  if (typeof event !== "string") return json(400, { error: "event missing" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const [ev, bouts, profiles] = await Promise.all([
    db.from("events").select("id, name, locks_at").eq("id", event).single(),
    db.from("bouts").select("id, position, a_name, b_name, segment, title").eq("event_id", event).eq("segment", "main"),
    db.from("profiles").select("id, display_name, notify_results"),
  ]);
  if (ev.error || bouts.error || profiles.error) return json(500, { error: ev.error?.message ?? bouts.error?.message ?? profiles.error?.message });
  if (new Date(ev.data.locks_at) <= new Date()) return json(400, { error: "the card has locked" });
  const main = bouts.data as Bout[];

  const picks = await db.from("picks").select("user_id, bout_id").in("bout_id", main.map((b) => b.id));
  if (picks.error) return json(500, { error: picks.error.message });
  const pickedBy = new Map<string, number>();
  for (const p of picks.data) pickedBy.set(p.user_id, (pickedBy.get(p.user_id) ?? 0) + 1);

  // Every confirmed address (one page holds 1000; there are far fewer accounts).
  const users = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) return json(500, { error: users.error.message });
  const emailOf = new Map(users.data.users.filter((u) => u.email && u.email_confirmed_at).map((u) => [u.id, u.email!]));

  const to = profiles.data
    .filter((p) => p.display_name !== MODEL_PLAYER && p.notify_results !== false && emailOf.has(p.id))
    .map((p) => ({ to: emailOf.get(p.id)!, picked: pickedBy.get(p.id) ?? 0 }))
    .filter((r) => r.picked < main.length);

  const sample = reminder(ev.data.name, event, ev.data.locks_at, main, 2);
  if (!send && !only) {
    return json(200, { recipients: to.length, none_picked: to.filter((r) => r.picked === 0).length, subject: sample.subject, text: sample.text });
  }
  const list = only ? [{ to: String(only), picked: 2 }] : to;
  const emails = list.map((r) => ({ to: r.to, ...reminder(ev.data.name, event, ev.data.locks_at, main, r.picked) }));

  let delivered = 0;
  const failed: string[] = [];
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify(batch.map((e) => ({ from: "UFC Embedded <noreply@anarli.com>", to: e.to, subject: e.subject, html: e.html, text: e.text }))),
    });
    if (res.ok) delivered += batch.length;
    else failed.push(`${res.status} ${await res.text()}`);
  }
  return json(failed.length ? 502 : 200, { delivered, of: emails.length, failed });
});
