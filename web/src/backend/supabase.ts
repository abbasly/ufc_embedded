// The Supabase implementation of Backend: Supabase Auth for sign-in, Postgres for profiles
// and Pick'em, with access decided by the row level security policies in supabase/migrations.
// The key used here is Supabase's public "anon" key, which is safe in the browser by design.

import { type SupabaseClient, type User as SupabaseUser, createClient } from "@supabase/supabase-js";

import { type Backend, BackendError, type Method, type PickemBout, type PickemEvent, type User } from "./types";

const toUser = (u: SupabaseUser | null | undefined): User | null => (u ? { id: u.id, email: u.email ?? null } : null);

/** Postgres error codes worth explaining to the user. */
function friendly(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new BackendError("That name is taken.");
  if (error.code === "23514") return new BackendError("Names are 3-24 letters, digits, dots, dashes or underscores.");
  if (error.code === "42501") return new BackendError("Picks for this card are closed.");
  return new Error(error.message);
}

export function supabaseBackend(url: string, anonKey: string): Backend {
  const db: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  // Back to this exact page after Google or an email link, wherever the site is hosted.
  const redirectTo = () => window.location.href.split("#")[0];
  const userId = async () => {
    const { data } = await db.auth.getUser();
    if (!data.user) throw new BackendError("Sign in first.");
    return data.user.id;
  };

  return {
    auth: {
      async currentUser() {
        const { data } = await db.auth.getSession();
        return toUser(data.session?.user);
      },
      onChange(callback) {
        const { data } = db.auth.onAuthStateChange((_event, session) => callback(toUser(session?.user)));
        return () => data.subscription.unsubscribe();
      },
      async signInWithGoogle() {
        const { error } = await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
        if (error) throw friendly(error);
      },
      async signInWithEmail(email) {
        const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
        if (error) throw friendly(error);
      },
      async signOut() {
        await db.auth.signOut();
      },
      async deleteAccount() {
        const { error } = await db.rpc("delete_my_account");
        if (error) throw friendly(error);
        await db.auth.signOut();
      },
    },

    profiles: {
      async mine() {
        const id = await userId().catch(() => null);
        if (!id) return null;
        const { data, error } = await db.from("profiles").select("id, display_name").eq("id", id).maybeSingle();
        if (error) throw friendly(error);
        return data && { id: data.id as string, displayName: data.display_name as string };
      },
      async create(displayName) {
        const id = await userId();
        const { error } = await db.from("profiles").insert({ id, display_name: displayName.trim() });
        if (error) throw friendly(error);
        return { id, displayName: displayName.trim() };
      },
      async rename(displayName) {
        const id = await userId();
        const { error } = await db.from("profiles").update({ display_name: displayName.trim() }).eq("id", id);
        if (error) throw friendly(error);
      },
    },

    pickem: {
      async currentEvent() {
        // The next card that's still open, else the most recent one (to show its results).
        const now = new Date().toISOString();
        const open = await db.from("events").select("*").gt("locks_at", now).order("locks_at").limit(1);
        if (open.error) throw friendly(open.error);
        let row = open.data[0];
        if (!row) {
          const last = await db.from("events").select("*").order("locks_at", { ascending: false }).limit(1);
          if (last.error) throw friendly(last.error);
          row = last.data[0];
        }
        if (!row) return null;
        const bouts = await db.from("bouts").select("*").eq("event_id", row.id).order("position");
        if (bouts.error) throw friendly(bouts.error);
        const event: PickemEvent = { id: row.id, name: row.name, startsOn: row.starts_on, locksAt: row.locks_at, scoredAt: row.scored_at };
        return {
          event,
          bouts: bouts.data.map(
            (b): PickemBout => ({
              id: b.id,
              eventId: b.event_id,
              position: b.position,
              fighterA: b.fighter_a,
              fighterB: b.fighter_b,
              aName: b.a_name,
              bName: b.b_name,
              modelPA: b.model_p_a,
              marketPA: b.market_p_a,
              winner: b.winner,
              method: b.method as Method | null,
            }),
          ),
        };
      },
      async myPicks(eventId) {
        const id = await userId().catch(() => null);
        if (!id) return [];
        const { data, error } = await db
          .from("picks")
          .select("bout_id, winner, method, bouts!inner(event_id)")
          .eq("bouts.event_id", eventId);
        if (error) throw friendly(error);
        return data.map((p) => ({ boutId: p.bout_id as string, winner: p.winner as string, method: p.method as Method | null }));
      },
      async pick({ boutId, winner, method }) {
        const id = await userId();
        const { error } = await db.from("picks").upsert({ user_id: id, bout_id: boutId, winner, method });
        if (error) throw friendly(error);
      },
      async unpick(boutId) {
        const id = await userId();
        const { error } = await db.from("picks").delete().eq("user_id", id).eq("bout_id", boutId);
        if (error) throw friendly(error);
      },
      async leaderboard(limit = 50) {
        const { data, error } = await db.from("leaderboard").select("*").order("points", { ascending: false }).limit(limit);
        if (error) throw friendly(error);
        return data.map((r) => ({
          displayName: r.display_name as string,
          points: Number(r.points),
          correct: Number(r.correct),
          picked: Number(r.picked),
          events: Number(r.events),
        }));
      },
    },
  };
}
