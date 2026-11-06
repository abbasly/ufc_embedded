// Emails a player when someone sends them a friend request. Called by a database webhook on
// new rows in public.friendships (see supabase/README.md), never by the site.
//
// Secrets (Edge Functions -> Secrets): RESEND_API_KEY (sending access), WEBHOOK_SECRET (the same
// value as the webhook's x-webhook-secret header). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided by Supabase.

import { createClient } from "jsr:@supabase/supabase-js@2";

import { friendRequestEmail } from "./email.ts";

const WEEK_MS = 7 * 86400e3;

// Each outcome is also logged, so the function's logs say what happened to every request.
const reply = (status: number, body: string) => {
  console.log(`friend-request-email: ${body}`);
  return new Response(body, { status });
};

Deno.serve(async (req) => {
  // Only the webhook knows this secret: anyone else calling the function gets nothing.
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return reply(403, "forbidden");

  const { type, table, record } = await req.json();
  if (type !== "INSERT" || table !== "friendships" || record?.status !== "pending") return reply(200, "ignored");

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const [from, to, notice] = await Promise.all([
    db.from("profiles").select("display_name").eq("id", record.requester).single(),
    db.from("profiles").select("notify_friend_requests").eq("id", record.addressee).single(),
    db.from("friend_request_notices").select("sent_at").eq("requester", record.requester).eq("addressee", record.addressee).maybeSingle(),
  ]);
  if (!from.data || !to.data) return reply(200, "no such player");
  if (!to.data.notify_friend_requests) return reply(200, "emails off");
  // At most one email a week per pair, however often someone asks, undoes and asks again.
  if (notice.data && Date.now() - new Date(notice.data.sent_at).getTime() < WEEK_MS) return reply(200, "emailed recently");

  const { data: user } = await db.auth.admin.getUserById(record.addressee);
  const email = user?.user?.email;
  if (!email) return reply(200, "no email");

  const { subject, html, text } = friendRequestEmail(from.data.display_name);
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "UFC Embedded <noreply@anarli.com>", to: email, subject, html, text }),
  });
  if (!sent.ok) return reply(502, `resend: ${sent.status} ${await sent.text()}`);

  await db.from("friend_request_notices").upsert({ requester: record.requester, addressee: record.addressee, sent_at: new Date().toISOString() });
  return reply(200, "sent");
});
