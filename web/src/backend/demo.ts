// A stand-in backend that lives in the browser, for building and trying the account features
// without a Supabase project: "signing in" makes you a demo user, and profiles and picks are
// kept in localStorage. Same Backend interface, so features can't tell the difference.
// Turned on with VITE_ACCOUNTS=demo (local development only; see backend/index.ts).

import { type Backend, BackendError, type Friend, type LeaderboardRow, type League, type Method, type Pick, type PickemBout, type PickemEvent, type Profile, type User } from "./types";

const KEY = "ufc-embedded-demo-backend";
const DEMO_USER: User = { id: "demo-user", email: "demo@example.com" };

interface Stored {
  signedIn: boolean;
  profile: Profile | null;
  picks: Pick[];
  leagues: League[];
  friends?: Friend[];
}

/** Demo friends to start with: one friend and one request waiting for you. */
const DEMO_FRIENDS: Friend[] = [
  { userId: "sample-0", displayName: "olga", avatar: "islam-makhachev", status: "friends" },
  { userId: "sample-2", displayName: "ko_king", avatar: "ilia-topuria", status: "incoming" },
];

function load(): Stored {
  try {
    return { signedIn: false, profile: null, picks: [], leagues: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { signedIn: false, profile: null, picks: [], leagues: [] };
  }
}
function save(s: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // private window: the demo just doesn't persist
  }
}

/** The results the demo card gets with ?results: [winner, method] per bout. */
const RESULTS: Record<number, [string, Method]> = {
  1: ["ilia-topuria", "KO/TKO"],
  2: ["alex-pereira", "DEC"],
  3: ["max-holloway", "SUB"],
};

/** A sample card a week out, so the Pick'em screens have something to show. In the address,
 * ?locked shows it locked (the after-lock views) and ?results fought and scored. */
function sampleCard(): { event: PickemEvent; bouts: PickemBout[] } {
  const day = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10);
  const params = new URLSearchParams(window.location.search);
  const results = params.has("results");
  const locked = results || params.has("locked");
  const locksAt = locked ? new Date(Date.now() - 3600e3).toISOString() : `${day}T22:00:00Z`;
  const event: PickemEvent = { id: `${day}-demo`, name: "UFC Demo Night", startsOn: day, locksAt, scoredAt: results ? new Date().toISOString() : null };
  const bout = (position: number, a: string, b: string, aName: string, bName: string, p: number, market: number): PickemBout => ({
    id: `${event.id}:${a}:${b}`,
    eventId: event.id,
    position,
    fighterA: a,
    fighterB: b,
    aName,
    bName,
    modelPA: p,
    marketPA: market,
    segment: position <= 2 ? "main" : "prelims",
    title: position === 1,
    outcome: results ? "win" : null,
    winner: results ? RESULTS[position]![0] : null,
    method: results ? RESULTS[position]![1] : null,
  });
  return {
    event,
    bouts: [
      bout(1, "islam-makhachev", "ilia-topuria", "Islam Makhachev", "Ilia Topuria", 0.65, 0.62),
      bout(2, "alex-pereira", "magomed-ankalaev", "Alex Pereira", "Magomed Ankalaev", 0.52, 0.45),
      bout(3, "max-holloway", "dustin-poirier", "Max Holloway", "Dustin Poirier", 0.58, 0.55),
    ],
  };
}

/** A full-looking board for the demo: made-up players with made-up scores (local only). */
const SAMPLE_NAMES = [
  "olga", "fred", "the_model", "ko_king", "sub_hunter", "leg_kick_larry", "the_clinch", "dec_merchant", "southpaw99",
  "octagon_owl", "gnp_greg", "rnc_rita", "spinning_back_steve", "jab_jab_cross", "cage_rat", "elbow_ella",
  "calf_slicer", "body_shot_bob", "flying_knee", "guard_puller", "sprawl_sam", "walkout_wally", "cutman_carl",
  "bell_saved", "scorecard_sue", "upset_ufo", "tko_tom", "mma_math_major", "chin_check", "takedown_tess", "ref_stoppage",
];
const AVATARS = ["islam-makhachev", "alex-pereira", "ilia-topuria", "max-holloway", "dustin-poirier", null];
function sampleBoard(me: Profile | null, myPicks: number): LeaderboardRow[] {
  const rows: LeaderboardRow[] = SAMPLE_NAMES.map((name, i) => {
    const correct = Math.max(2, 26 - Math.round(i * 0.75));
    return { displayName: name, avatar: AVATARS[i % AVATARS.length] ?? null, points: correct * 10 + ((i * 7) % 4) * 5, correct, picked: 30, events: 3 };
  });
  if (me) rows.push({ displayName: me.displayName, avatar: me.avatar, points: 0, correct: 0, picked: myPicks, events: 0 });
  return rows.sort((a, b) => b.points - a.points);
}

export function demoBackend(): Backend {
  const listeners = new Set<(u: User | null) => void>();
  const notify = () => listeners.forEach((l) => l(load().signedIn ? DEMO_USER : null));
  const signIn = async () => {
    save({ ...load(), signedIn: true });
    notify();
  };
  const signedIn = () => {
    if (!load().signedIn) throw new BackendError("Sign in first.");
  };

  return {
    auth: {
      currentUser: async () => (load().signedIn ? DEMO_USER : null),
      onChange(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
      signInWithGoogle: signIn,
      async signUp() {
        await signIn();
        return "signed-in" as const;
      },
      signInWithPassword: signIn,
      finishEmailLink: async () => null,
      async sendPasswordReset() {},
      onPasswordRecovery: () => () => {},
      async updatePassword() {},
      async signOut() {
        save({ ...load(), signedIn: false });
        notify();
      },
      async deleteAccount() {
        save({ signedIn: false, profile: null, picks: [], leagues: [] });
        notify();
      },
    },
    profiles: {
      mine: async () => (load().signedIn ? load().profile : null),
      async create(displayName) {
        signedIn();
        const profile = { id: DEMO_USER.id, displayName: displayName.trim(), avatar: null, notifyFriendRequests: true };
        save({ ...load(), profile });
        return profile;
      },
      async byName(displayName) {
        const me = load().profile;
        if (me?.displayName === displayName) return { id: me.id, displayName: me.displayName, avatar: me.avatar, joinedOn: "2026-11-01" };
        const i = SAMPLE_NAMES.indexOf(displayName);
        return i < 0 ? null : { id: `sample-${i}`, displayName, avatar: AVATARS[i % AVATARS.length] ?? null, joinedOn: "2026-10-20" };
      },
      async update({ displayName, avatar, notifyFriendRequests }) {
        signedIn();
        const s = load();
        if (!s.profile) throw new BackendError("Pick a display name first.");
        save({
          ...s,
          profile: {
            ...s.profile,
            ...(displayName !== undefined && { displayName: displayName.trim() }),
            ...(avatar !== undefined && { avatar }),
            ...(notifyFriendRequests !== undefined && { notifyFriendRequests }),
          },
        });
      },
    },
    pickem: {
      events: async () => [sampleCard().event],
      card: async () => sampleCard(),
      // The card's final standings: sample players, and you with your demo picks scored by the
      // real rules (main card only: 10, +5 method, +5 underdog).
      eventLeaderboard: async () => {
        const s = load();
        const rows: LeaderboardRow[] = SAMPLE_NAMES.slice(0, 14).map((name, i) => {
          const correct = i < 4 ? 2 : i < 10 ? 1 : 0;
          return { displayName: name, avatar: AVATARS[i % AVATARS.length] ?? null, points: correct * 10 + (i < 3 ? 15 - i * 5 : i < 6 ? 5 : 0), correct, picked: 2, events: 1 };
        });
        if (s.profile) {
          const main = sampleCard().bouts.filter((b) => b.segment === "main");
          let points = 0;
          let correct = 0;
          let picked = 0;
          for (const b of main) {
            const p = s.picks.find((x) => x.boutId === b.id);
            if (!p) continue;
            picked++;
            if (p.winner !== b.winner) continue;
            correct++;
            const market = p.winner === b.fighterA ? b.marketPA! : 1 - b.marketPA!;
            points += 10 + (p.method && p.method === b.method ? 5 : 0) + (market < 0.5 ? 5 : 0);
          }
          if (picked) rows.push({ displayName: s.profile.displayName, avatar: s.profile.avatar, points, correct, picked, events: 1 });
        }
        return rows.sort((a, b) => b.points - a.points || b.correct - a.correct);
      },
      myPicks: async () => (load().signedIn ? load().picks : []),
      async pick(pick) {
        signedIn();
        const s = load();
        save({ ...s, picks: [...s.picks.filter((p) => p.boutId !== pick.boutId), pick] });
      },
      async unpick(boutId) {
        signedIn();
        const s = load();
        save({ ...s, picks: s.picks.filter((p) => p.boutId !== boutId) });
      },
      leaderboard: async () => sampleBoard(load().profile, load().picks.length),
      matesPicks: async () => {
        const [b0, b1] = sampleCard().bouts as [PickemBout, PickemBout];
        return [
          { displayName: "olga", avatar: "islam-makhachev", boutId: b0.id, winner: b0.fighterA, method: "SUB" as const },
          { displayName: "fred", avatar: null, boutId: b0.id, winner: b0.fighterB, method: "KO/TKO" as const },
          { displayName: "olga", avatar: "islam-makhachev", boutId: b1.id, winner: b1.fighterA, method: null },
        ];
      },
      matesWhoPicked: async () => {
        const [b0, b1] = sampleCard().bouts as [PickemBout, PickemBout];
        return [
          { boutId: b0.id, displayName: "olga", avatar: "islam-makhachev" },
          { boutId: b0.id, displayName: "fred", avatar: null },
          { boutId: b1.id, displayName: "olga", avatar: "islam-makhachev" },
        ];
      },
      pickSplit: async () => {
        const [b0, b1] = sampleCard().bouts as [PickemBout, PickemBout];
        return { [b0.id]: { [b0.fighterA]: 62, [b0.fighterB]: 38 }, [b1.id]: { [b1.fighterA]: 15, [b1.fighterB]: 30 } };
      },
      myScores: async () =>
        load().signedIn ? [{ eventId: "demo-past", name: "UFC 333: Demo vs. Results", startsOn: "2026-10-31", points: 45, correct: 4, picked: 6 }] : [],
      scoresOf: async (id) =>
        id === DEMO_USER.id
          ? [{ eventId: "demo-past", name: "UFC 333: Demo vs. Results", startsOn: "2026-10-31", points: 45, correct: 4, picked: 6 }]
          : [
              { eventId: "demo-past", name: "UFC 333: Demo vs. Results", startsOn: "2026-10-31", points: 95, correct: 8, picked: 10 },
              { eventId: "demo-older", name: "UFC Fight Night: Sample vs. Card", startsOn: "2026-10-24", points: 70, correct: 6, picked: 10 },
            ],
    },
    friends: {
      list: async () => (load().signedIn ? (load().friends ?? DEMO_FRIENDS) : []),
      async request(userId) {
        signedIn();
        const s = load();
        const list = s.friends ?? DEMO_FRIENDS;
        const existing = list.find((f) => f.userId === userId);
        if (existing?.status === "incoming") {
          save({ ...s, friends: list.map((f) => (f.userId === userId ? { ...f, status: "friends" as const } : f)) });
          return "accepted";
        }
        if (!existing) {
          const i = Number(userId.replace("sample-", ""));
          const name = SAMPLE_NAMES[i] ?? userId;
          save({ ...s, friends: [...list, { userId, displayName: name, avatar: AVATARS[i % AVATARS.length] ?? null, status: "outgoing" }] });
        }
        return "requested";
      },
      async accept(userId) {
        const s = load();
        save({ ...s, friends: (s.friends ?? DEMO_FRIENDS).map((f) => (f.userId === userId ? { ...f, status: "friends" as const } : f)) });
      },
      async remove(userId) {
        const s = load();
        save({ ...s, friends: (s.friends ?? DEMO_FRIENDS).filter((f) => f.userId !== userId) });
      },
      standings: async () => {
        const s = load();
        const names = new Set((s.friends ?? DEMO_FRIENDS).filter((f) => f.status === "friends").map((f) => f.displayName));
        return sampleBoard(s.profile, s.picks.length).filter((r) => names.has(r.displayName) || r.displayName === s.profile?.displayName);
      },
    },
    // Demo leagues: yours, plus two made-up friends in every league you join.
    leagues: {
      mine: async () => (load().signedIn ? load().leagues : []),
      async create(name) {
        signedIn();
        const league: League = { id: `demo-${Date.now()}`, name: name.trim(), inviteCode: Math.random().toString(36).slice(2, 10).toUpperCase(), isOwner: true };
        save({ ...load(), leagues: [...load().leagues, league] });
        return league;
      },
      async join(inviteCode) {
        signedIn();
        const code = inviteCode.trim().toUpperCase();
        const existing = load().leagues.find((l) => l.inviteCode === code);
        if (existing) return existing.id;
        const league: League = { id: `demo-${code}`, name: "Friends league", inviteCode: code, isOwner: false };
        save({ ...load(), leagues: [...load().leagues, league] });
        return league.id;
      },
      async leave(leagueId) {
        save({ ...load(), leagues: load().leagues.filter((l) => l.id !== leagueId) });
      },
      members: async () => ["olga", "fred", load().profile?.displayName ?? "you"],
      standings: async () => {
        const s = load();
        const me = { displayName: s.profile?.displayName ?? "you", avatar: s.profile?.avatar ?? null, points: 0, correct: 0, picked: s.picks.length, events: 0 };
        return [
          { displayName: "olga", avatar: "islam-makhachev", points: 120, correct: 10, picked: 13, events: 1 },
          { displayName: "fred", avatar: null, points: 95, correct: 8, picked: 13, events: 1 },
          me,
        ];
      },
    },
  };
}
