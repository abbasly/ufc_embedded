// A stand-in backend that lives in the browser, for building and trying the account features
// without a Supabase project: "signing in" makes you a demo user, and profiles and picks are
// kept in localStorage. Same Backend interface, so features can't tell the difference.
// Turned on with VITE_ACCOUNTS=demo (local development only; see backend/index.ts).

import { type Backend, BackendError, type League, type Pick, type PickemBout, type PickemEvent, type Profile, type User } from "./types";

const KEY = "ufc-embedded-demo-backend";
const DEMO_USER: User = { id: "demo-user", email: "demo@example.com" };

interface Stored {
  signedIn: boolean;
  profile: Profile | null;
  picks: Pick[];
  leagues: League[];
}

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

/** A sample card a week out, so the Pick'em screens have something to show. */
function sampleCard(): { event: PickemEvent; bouts: PickemBout[] } {
  const day = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10);
  // ?locked in the URL shows the card as locked (to try the after-lock views).
  const locked = new URLSearchParams(window.location.search).has("locked");
  const locksAt = locked ? new Date(Date.now() - 3600e3).toISOString() : `${day}T22:00:00Z`;
  const event: PickemEvent = { id: `${day}-demo`, name: "UFC Demo Night", startsOn: day, locksAt, scoredAt: null };
  const bout = (position: number, a: string, b: string, aName: string, bName: string, p: number): PickemBout => ({
    id: `${event.id}:${a}:${b}`,
    eventId: event.id,
    position,
    fighterA: a,
    fighterB: b,
    aName,
    bName,
    modelPA: p,
    marketPA: null,
    segment: position <= 2 ? "main" : "prelims",
    title: position === 1,
    outcome: null,
    winner: null,
    method: null,
  });
  return {
    event,
    bouts: [
      bout(1, "islam-makhachev", "ilia-topuria", "Islam Makhachev", "Ilia Topuria", 0.65),
      bout(2, "alex-pereira", "magomed-ankalaev", "Alex Pereira", "Magomed Ankalaev", 0.52),
      bout(3, "max-holloway", "dustin-poirier", "Max Holloway", "Dustin Poirier", 0.58),
    ],
  };
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
      signInWithEmail: signIn,
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
        const profile = { id: DEMO_USER.id, displayName: displayName.trim(), avatar: null };
        save({ ...load(), profile });
        return profile;
      },
      async update({ displayName, avatar }) {
        signedIn();
        const s = load();
        if (!s.profile) throw new BackendError("Pick a display name first.");
        save({
          ...s,
          profile: { ...s.profile, ...(displayName !== undefined && { displayName: displayName.trim() }), ...(avatar !== undefined && { avatar }) },
        });
      },
    },
    pickem: {
      events: async () => [sampleCard().event],
      card: async () => sampleCard(),
      eventLeaderboard: async () => [
        { displayName: "olga", avatar: "islam-makhachev", points: 55, correct: 3, picked: 3, events: 1 },
        { displayName: "fred", avatar: null, points: 20, correct: 2, picked: 3, events: 1 },
      ],
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
      leaderboard: async () => {
        const s = load();
        return s.profile ? [{ displayName: s.profile.displayName, avatar: s.profile.avatar, points: 0, correct: 0, picked: s.picks.length, events: 0 }] : [];
      },
      matesPicks: async () => {
        const [b0, b1] = sampleCard().bouts as [PickemBout, PickemBout];
        return [
          { displayName: "olga", avatar: "islam-makhachev", boutId: b0.id, winner: b0.fighterA, method: "SUB" as const },
          { displayName: "fred", avatar: null, boutId: b0.id, winner: b0.fighterB, method: "KO/TKO" as const },
          { displayName: "olga", avatar: "islam-makhachev", boutId: b1.id, winner: b1.fighterA, method: null },
        ];
      },
      pickSplit: async () => {
        const [b0, b1] = sampleCard().bouts as [PickemBout, PickemBout];
        return { [b0.id]: { [b0.fighterA]: 62, [b0.fighterB]: 38 }, [b1.id]: { [b1.fighterA]: 15, [b1.fighterB]: 30 } };
      },
      myScores: async () =>
        load().signedIn ? [{ eventId: "demo-past", name: "UFC 333: Demo vs. Results", startsOn: "2026-10-31", points: 45, correct: 4, picked: 6 }] : [],
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
