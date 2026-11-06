// The Supabase implementation of Backend: Supabase Auth for sign-in, Postgres for profiles
// and Pick'em, with access decided by the row level security policies in supabase/migrations.
// The key used here is Supabase's public "anon" key, which is safe in the browser by design.

import { type SupabaseClient, type User as SupabaseUser, createClient } from "@supabase/supabase-js";

import { type Backend, BackendError, type LeaderboardRow, type Method, type PickemBout, type EventScore, type Friend, type PickemEvent, type PickSplit, type Segment, type User } from "./types";

const toRow = (r: Record<string, unknown>): LeaderboardRow => ({
  displayName: r.display_name as string,
  avatar: (r.avatar as string | null) ?? null,
  points: Number(r.points),
  correct: Number(r.correct),
  picked: Number(r.picked),
  events: Number(r.events),
});

const toEvent = (r: Record<string, unknown>): PickemEvent => ({
  id: r.id as string,
  name: r.name as string,
  startsOn: r.starts_on as string,
  locksAt: r.locks_at as string,
  scoredAt: (r.scored_at as string | null) ?? null,
});

const toBout = (b: Record<string, unknown>): PickemBout => ({
  id: b.id as string,
  eventId: b.event_id as string,
  position: b.position as number,
  fighterA: b.fighter_a as string,
  fighterB: b.fighter_b as string,
  aName: b.a_name as string,
  bName: b.b_name as string,
  modelPA: (b.model_p_a as number | null) ?? null,
  marketPA: (b.market_p_a as number | null) ?? null,
  segment: b.segment as Segment,
  title: Boolean(b.title),
  outcome: (b.outcome as PickemBout["outcome"]) ?? null,
  winner: (b.winner as string | null) ?? null,
  method: (b.method as Method | null) ?? null,
});

const toUser = (u: SupabaseUser | null | undefined): User | null => (u ? { id: u.id, email: u.email ?? null } : null);

/** Postgres and Supabase Auth error codes worth explaining to the user. */
function friendly(error: { code?: string; message: string }): Error {
  if (error.code === "invalid_credentials")
    return new BackendError("Wrong email or password. If you joined with Google, use Continue with Google (or reset your password to add one).");
  if (error.code === "email_not_confirmed") return new BackendError("Confirm your email first: check your inbox for the link.");
  if (error.code === "user_already_exists") return new BackendError("There's already an account with that email. Sign in instead.");
  if (error.code === "weak_password") return new BackendError("Pick a longer password: at least 8 characters.");
  if (error.code === "same_password") return new BackendError("That's your current password: pick a new one.");
  if (error.code === "over_email_send_rate_limit") return new BackendError("Too many emails just now. Try again in a few minutes.");
  if (error.code === "email_address_invalid") return new BackendError("That email address doesn't look right.");
  if (error.code === "23505") return new BackendError("That name is taken.");
  if (error.code === "23514" && error.message.includes("not_reserved")) return new BackendError("That name is reserved: pick another.");
  if (error.code === "23514") return new BackendError("Names are 3-24 letters, digits, dots, dashes or underscores.");
  if (error.code === "42501") return new BackendError("Picks for this card are closed.");
  if (error.code === "P0002") return new BackendError("No league with that invite code.");
  if (error.code === "23514" && /league/.test(error.message)) return new BackendError(error.message.replace(/^./, (c) => c.toUpperCase()) + ".");
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

  /** A player's scored events, latest first. */
  const scoresOf = async (id: string): Promise<EventScore[]> => {
    const { data, error } = await db
      .from("scores")
      .select("event_id, points, correct, picked, events!inner(name, starts_on)")
      .eq("user_id", id);
    if (error) throw friendly(error);
    return data
      .map((s) => {
        const event = s.events as unknown as { name: string; starts_on: string };
        return { eventId: s.event_id, name: event.name, startsOn: event.starts_on, points: s.points, correct: s.correct, picked: s.picked };
      })
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
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
      async finishEmailLink() {
        const url = new URL(window.location.href);
        const tokenHash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");
        if (!tokenHash || (type !== "email" && type !== "signup" && type !== "recovery")) return null;
        // Take the one-time token out of the address bar (and history) either way.
        url.searchParams.delete("token_hash");
        url.searchParams.delete("type");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
        const { error } = await db.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) throw new BackendError("That link has expired or was already used. Sign in, or ask for a new one.");
        return type === "recovery" ? "recovery" : "confirmed";
      },
      async signUp(email, password) {
        const { data, error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
        if (error) throw friendly(error);
        // An address that already has an account (e.g. through Google) comes back as a stand-in
        // user with no identities, and no email is sent: say so rather than "check your email".
        if (data.user && data.user.identities?.length === 0) {
          throw new BackendError(
            "There's already an account with this email. Sign in, or use Continue with Google if that's how you joined. No password yet? Use \"Forgot your password?\" to add one.",
          );
        }
        return data.session ? "signed-in" : "confirm";
      },
      async signInWithPassword(email, password) {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw friendly(error);
      },
      async sendPasswordReset(email) {
        const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
        if (error) throw friendly(error);
      },
      onPasswordRecovery(callback) {
        const { data } = db.auth.onAuthStateChange((event) => {
          if (event === "PASSWORD_RECOVERY") callback();
        });
        return () => data.subscription.unsubscribe();
      },
      async updatePassword(password) {
        const { error } = await db.auth.updateUser({ password });
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
        const { data, error } = await db.from("profiles").select("id, display_name, avatar, notify_friend_requests").eq("id", id).maybeSingle();
        if (error) throw friendly(error);
        return (
          data && {
            id: data.id as string,
            displayName: data.display_name as string,
            avatar: data.avatar as string | null,
            notifyFriendRequests: data.notify_friend_requests !== false,
          }
        );
      },
      async create(displayName) {
        const id = await userId();
        const { error } = await db.from("profiles").insert({ id, display_name: displayName.trim() });
        if (error) throw friendly(error);
        return { id, displayName: displayName.trim(), avatar: null, notifyFriendRequests: true };
      },
      async byName(displayName) {
        const { data, error } = await db.from("profiles").select("id, display_name, avatar, created_at").eq("display_name", displayName).maybeSingle();
        if (error) throw friendly(error);
        return data && { id: data.id, displayName: data.display_name, avatar: data.avatar, joinedOn: String(data.created_at).slice(0, 10) };
      },
      async update({ displayName, avatar, notifyFriendRequests }) {
        const id = await userId();
        const changes: Record<string, unknown> = {};
        if (displayName !== undefined) changes.display_name = displayName.trim();
        if (avatar !== undefined) changes.avatar = avatar;
        if (notifyFriendRequests !== undefined) changes.notify_friend_requests = notifyFriendRequests;
        const { error } = await db.from("profiles").update(changes).eq("id", id);
        if (error) throw friendly(error);
      },
    },

    pickem: {
      async events() {
        const since = new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10);
        const recent = await db.from("events").select("*").gte("starts_on", since).order("starts_on");
        if (recent.error) throw friendly(recent.error);
        let rows = recent.data;
        if (!rows.length) {
          const last = await db.from("events").select("*").order("starts_on", { ascending: false }).limit(1);
          if (last.error) throw friendly(last.error);
          rows = last.data;
        }
        return rows.map(toEvent);
      },
      async card(eventId) {
        const event = await db.from("events").select("*").eq("id", eventId).maybeSingle();
        if (event.error) throw friendly(event.error);
        if (!event.data) return null;
        const bouts = await db.from("bouts").select("*").eq("event_id", eventId).order("position");
        if (bouts.error) throw friendly(bouts.error);
        return {
          event: toEvent(event.data),
          bouts: bouts.data.map(toBout),
        };
      },
      async eventLeaderboard(eventId, limit = 50) {
        const { data, error } = await db
          .from("scores")
          .select("points, correct, picked, profiles!inner(display_name, avatar)")
          .eq("event_id", eventId)
          .order("points", { ascending: false })
          .order("correct", { ascending: false })
          .limit(limit);
        if (error) throw friendly(error);
        return data.map((r) => {
          const p = r.profiles as unknown as { display_name: string; avatar: string | null };
          return { displayName: p.display_name, avatar: p.avatar, points: r.points, correct: r.correct, picked: r.picked, events: 1 };
        });
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
        return data.map(toRow);
      },
      async matesPicks(eventId) {
        const id = await userId().catch(() => null);
        if (!id) return [];
        // Row level security returns only league-mates' picks, and only once the card has locked.
        const { data, error } = await db
          .from("picks")
          .select("bout_id, winner, method, profiles!inner(display_name, avatar), bouts!inner(event_id)")
          .eq("bouts.event_id", eventId)
          .neq("user_id", id);
        if (error) throw friendly(error);
        return data.map((p) => {
          const profile = p.profiles as unknown as { display_name: string; avatar: string | null };
          return {
            displayName: profile.display_name,
            avatar: profile.avatar,
            boutId: p.bout_id as string,
            winner: p.winner as string,
            method: p.method as Method | null,
          };
        });
      },
      async matesWhoPicked(eventId) {
        const id = await userId().catch(() => null);
        if (!id) return [];
        const { data, error } = await db.rpc("mates_who_picked", { event: eventId });
        if (error) throw friendly(error);
        return (data as { bout_id: string; display_name: string; avatar: string | null }[]).map((r) => ({
          boutId: r.bout_id,
          displayName: r.display_name,
          avatar: r.avatar,
        }));
      },
      async pickSplit(eventId) {
        const { data, error } = await db.rpc("pick_split", { event: eventId });
        if (error) throw friendly(error);
        const split: PickSplit = {};
        for (const r of data as { bout_id: string; fighter: string; picks: number }[]) {
          (split[r.bout_id] ??= {})[r.fighter] = Number(r.picks);
        }
        return split;
      },
      async myScores() {
        const id = await userId().catch(() => null);
        return id ? scoresOf(id) : [];
      },
      scoresOf,
      async pickHistory(id) {
        const { data, error } = await db
          .from("picks")
          .select("bout_id, winner, method, bouts!inner(*, events!inner(name, starts_on))")
          .eq("user_id", id)
          .not("bouts.outcome", "is", null);
        if (error) throw friendly(error);
        return data.map((r) => {
          const b = r.bouts as unknown as Record<string, unknown> & { events: { name: string; starts_on: string } };
          return {
            pick: { boutId: r.bout_id as string, winner: r.winner as string, method: r.method as Method | null },
            bout: toBout(b),
            eventName: b.events.name,
            startsOn: b.events.starts_on,
          };
        });
      },
    },

    friends: {
      async list() {
        const id = await userId().catch(() => null);
        if (!id) return [];
        const { data, error } = await db.rpc("my_friends");
        if (error) throw friendly(error);
        return (data as { user_id: string; display_name: string; avatar: string | null; status: Friend["status"] }[]).map((f) => ({
          userId: f.user_id,
          displayName: f.display_name,
          avatar: f.avatar,
          status: f.status,
        }));
      },
      async request(other) {
        const { data, error } = await db.rpc("friend_request", { other });
        if (error) throw friendly(error);
        return data as "requested" | "accepted";
      },
      async accept(other) {
        const { error } = await db.rpc("friend_accept", { other });
        if (error) throw friendly(error);
      },
      async remove(other) {
        const { error } = await db.rpc("friend_remove", { other });
        if (error) throw friendly(error);
      },
      async standings() {
        const { data, error } = await db.rpc("friends_standings");
        if (error) throw friendly(error);
        return (data as Record<string, unknown>[]).map(toRow);
      },
    },

    leagues: {
      async mine() {
        const id = await userId().catch(() => null);
        if (!id) return [];
        const { data, error } = await db.from("leagues").select("id, name, invite_code, owner_id").order("created_at");
        if (error) throw friendly(error);
        return data.map((l) => ({ id: l.id, name: l.name, inviteCode: l.invite_code, isOwner: l.owner_id === id }));
      },
      async create(name) {
        const created = await db.rpc("create_league", { league_name: name.trim() });
        if (created.error) throw friendly(created.error);
        const { data, error } = await db.from("leagues").select("id, name, invite_code").eq("id", created.data).single();
        if (error) throw friendly(error);
        return { id: data.id, name: data.name, inviteCode: data.invite_code, isOwner: true };
      },
      async join(inviteCode) {
        const { data, error } = await db.rpc("join_league", { code: inviteCode });
        if (error) throw friendly(error);
        return data as string;
      },
      async leave(leagueId) {
        const { error } = await db.rpc("leave_league", { league: leagueId });
        if (error) throw friendly(error);
      },
      async members(leagueId) {
        const { data, error } = await db.from("league_members").select("profiles!inner(display_name)").eq("league_id", leagueId);
        if (error) throw friendly(error);
        return data.map((m) => (m.profiles as unknown as { display_name: string }).display_name);
      },
      async standings(leagueId) {
        const { data, error } = await db.rpc("league_standings", { league: leagueId });
        if (error) throw friendly(error);
        return (data as Record<string, unknown>[]).map(toRow);
      },
    },
  };
}
