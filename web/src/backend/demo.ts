// A stand-in backend that lives in the browser, for building and trying the account features
// without a Supabase project: "signing in" makes you a demo user, and profiles and picks are
// kept in localStorage. Same Backend interface, so features can't tell the difference.
// Turned on with VITE_ACCOUNTS=demo (local development only; see backend/index.ts).

import { demoPastPicks, demoPastScores } from "./demoHistory";
import { type Backend, BackendError, type Friend, type LeaderboardRow, type League, type Method, type Pick, type PickemBout, type PickemEvent, type Profile, type User, type PackCard, type UnopenedPack } from "./types";

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
const PULLS_KEY = "ufc-embedded-demo-pulls";
const DEMO_PACKS: UnopenedPack[] = [
  { id: "demo-pack-1", eventId: "demo-e1", eventName: "UFC 330: Pereira vs. Ankalaev 3", reason: "played" },
  { id: "demo-pack-2", eventId: "demo-e1", eventName: "UFC 330: Pereira vs. Ankalaev 3", reason: "league" },
];
const DEMO_POOL: Omit<PackCard, "slot">[] = [
  { fighterId: "islam-makhachev", name: "Islam Makhachev", rarity: "legendary" },
  { fighterId: "ilia-topuria", name: "Ilia Topuria", rarity: "epic" },
  { fighterId: "max-holloway", name: "Max Holloway", rarity: "epic" },
  { fighterId: "magomed-ankalaev", name: "Magomed Ankalaev", rarity: "rare" },
  { fighterId: "dustin-poirier", name: "Dustin Poirier", rarity: "common" },
  { fighterId: "tatiana-suarez", name: "Tatiana Suarez", rarity: "rare" },
];
function loadPulls(): Record<string, PackCard[]> {
  try {
    return JSON.parse(localStorage.getItem(PULLS_KEY) ?? "{}") as Record<string, PackCard[]>;
  } catch {
    return {};
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
 * ?locked shows it locked (the after-lock views), ?results fought and scored, ?soon locking in 30
 * minutes. */
function sampleCard(): { event: PickemEvent; bouts: PickemBout[] } {
  const day = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10);
  const params = new URLSearchParams(window.location.search);
  const results = params.has("results");
  const locked = results || params.has("locked");
  // ?soon: locks in 30 minutes (the last-hour countdown in the tab).
  const soon = params.has("soon");
  const locksAt = locked ? new Date(Date.now() - 3600e3).toISOString() : soon ? new Date(Date.now() + 30 * 60e3).toISOString() : `${day}T22:00:00Z`;
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
        const profile = { id: DEMO_USER.id, displayName: displayName.trim(), avatar: null, notifyFriendRequests: true, notifyResults: true };
        save({ ...load(), profile });
        return profile;
      },
      async exportMine() {
        const s = load();
        return { exported_at: new Date().toISOString(), account: DEMO_USER, profile: s.profile, picks: s.picks, leagues: s.leagues, friends: s.friends ?? [] };
      },
      async byName(displayName) {
        const me = load().profile;
        if (me?.displayName === displayName) return { id: me.id, displayName: me.displayName, avatar: me.avatar, joinedOn: "2026-11-01" };
        const i = SAMPLE_NAMES.indexOf(displayName);
        return i < 0 ? null : { id: `sample-${i}`, displayName, avatar: AVATARS[i % AVATARS.length] ?? null, joinedOn: "2026-10-20" };
      },
      async update({ displayName, avatar, notifyFriendRequests, notifyResults }) {
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
            ...(notifyResults !== undefined && { notifyResults }),
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
      // A made-up past season (demoHistory.ts) behind the profile's history, stats and badges.
      myScores: async () => (load().signedIn ? demoPastScores(DEMO_USER.id) : []),
      scoresOf: async (id) => demoPastScores(id),
      pickHistory: async (id) => demoPastPicks(id),
      claimPacks: async () =>
        load().signedIn
          ? DEMO_PACKS.filter((p) => !loadPulls()[p.id])
          : [],
      async openPack(packId) {
        const pulls = loadPulls();
        pulls[packId] ??= [...DEMO_POOL].sort(() => Math.random() - 0.5).slice(0, 3).map((c, i) => ({ ...c, slot: i + 1 }));
        try {
          localStorage.setItem(PULLS_KEY, JSON.stringify(pulls));
        } catch {
          // private window: the demo just doesn't persist
        }
        return pulls[packId];
      },
      packCards: async () => {
        const cards = Object.values(loadPulls()).flat();
        return [...new Set(cards.map((c) => c.fighterId))].map((id) => {
          const same = cards.filter((c) => c.fighterId === id);
          return { fighterId: id, name: same[0]!.name, rarity: same[0]!.rarity, copies: same.length };
        });
      },
      starterBadges: async () => {
        const s = load();
        return [
          ...(s.picks.length ? ["first-pick"] : []),
          ...(s.picks.some((p) => p.method) ? ["called-method"] : []),
          ...(s.profile ? ["signed-up"] : []),
          ...(s.leagues.length ? ["in-league"] : []),
        ];
      },
      closestPredictors: async () => [
        { displayName: "olga", avatar: "valentina-shevchenko", shared: 24, agreed: 20 },
        { displayName: "the_model", avatar: null, shared: 24, agreed: 17 },
        { displayName: "fred", avatar: null, shared: 18, agreed: 7 },
      ],
    },
    // In the demo you're the admin, with made-up accounts.
    admin: {
      isAdmin: async () => load().signedIn,
      overview: async () => [
        { metric: "accounts", value: 42 },
        { metric: "with a display name", value: 38 },
        { metric: "new today", value: 5 },
        { metric: "new this week", value: 31 },
        { metric: "signed in this week", value: 27 },
        { metric: "players with a pick", value: 29 },
        { metric: "picks", value: 311 },
        { metric: "leagues", value: 6 },
        { metric: "friendships", value: 14 },
        { metric: "cards scored", value: 4 },
        { metric: "results emails sent", value: 88 },
        { metric: "friend-request emails sent", value: 17 },
      ],
      users: async () =>
        SAMPLE_NAMES.slice(0, 18).map((name, i) => ({
          userId: `sample-${i}`,
          displayName: i === 17 ? null : name,
          email: `${name.replace(/_/g, ".")}@example.com`,
          provider: i % 3 ? "google" : "email",
          createdAt: new Date(Date.now() - i * 9 * 3600e3).toISOString(),
          lastSignInAt: new Date(Date.now() - i * 2 * 3600e3).toISOString(),
          picks: Math.max(0, 22 - i),
          points: Math.max(0, 265 - i * 12),
          leagues: i % 4,
          friends: i % 5,
        })),
      // Made-up traffic: a weekly rhythm with fight-weekend peaks.
      visits: async (days) => {
        const series = Array.from({ length: days }, (_, i) => {
          const d = new Date(Date.now() - (days - 1 - i) * 86400e3);
          const weekend = [0, 6].includes(d.getUTCDay()) ? 2.4 : 1;
          const visits = Math.round((60 + 35 * Math.sin(i / 3) ** 2 + (i % 7) * 4) * weekend);
          return { date: d.toISOString().slice(0, 10), visits, pageViews: Math.round(visits * 2.6) };
        });
        const visits = series.reduce((n, d) => n + d.visits, 0);
        const shares: [string, number][] = [["DE", 0.31], ["AZ", 0.2], ["US", 0.14], ["GB", 0.08], ["KR", 0.06], ["FR", 0.05], ["NL", 0.04], ["TR", 0.03], ["CA", 0.03], ["BR", 0.02], ["PL", 0.02], ["AU", 0.02]];
        return { days, visits, pageViews: Math.round(visits * 2.6), series, countries: shares.map(([country, share]) => ({ country, visits: Math.round(visits * share) })) };
      },
      log: async () => [
        { at: new Date().toISOString(), kind: "sync", eventId: null, detail: "3 cards, 28 bouts, 0 results" },
        { at: new Date(Date.now() - 3600e3).toISOString(), kind: "result", eventId: "demo-e4", detail: "Ilia Topuria vs Islam Makhachev: Ilia Topuria by KO/TKO" },
        { at: new Date(Date.now() - 2 * 3600e3).toISOString(), kind: "scored", eventId: "demo-e4", detail: "31 players scored" },
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
      champions: async () => {
        const me = load().profile;
        const [displayName, avatar] = me ? [me.displayName, me.avatar] : ["olga", "valentina-shevchenko"];
        return [
          { eventId: "demo-e2", eventName: "UFC Fight Night: Holloway vs. Topuria", startsOn: "2026-10-17", displayName, avatar, points: 55 },
          { eventId: "demo-e1", eventName: "UFC 330: Pereira vs. Ankalaev 3", startsOn: "2026-10-10", displayName: "olga", avatar: "valentina-shevchenko", points: 60 },
        ];
      },
      titlesOf: async () => [
        { eventId: "demo-e2", eventName: "UFC Fight Night: Holloway vs. Topuria", startsOn: "2026-10-17", points: 55, leagueName: "Gym boys" },
        { eventId: "demo-e1", eventName: "UFC 330: Pereira vs. Ankalaev 3", startsOn: "2026-10-10", points: 60, leagueName: null },
      ],
      mine: async () => (load().signedIn ? load().leagues : []),
      async create(name) {
        signedIn();
        // Like the real thing: up to 5 leagues of your own.
        if (load().leagues.filter((l) => l.isOwner).length >= 5) throw new BackendError("You can own up to 5 leagues.");
        const league: League = { id: `demo-${Date.now()}`, name: name.trim(), inviteCode: Math.random().toString(36).slice(2, 10).toUpperCase(), isOwner: true };
        save({ ...load(), leagues: [...load().leagues, league] });
        return league;
      },
      async join(inviteCode) {
        signedIn();
        const code = inviteCode.trim().toUpperCase();
        // Like the real thing: anything but an 8-character code finds no league.
        if (!/^[A-Z0-9]{8}$/.test(code)) throw new BackendError("No league with that invite code.");
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
