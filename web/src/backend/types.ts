// The app's own view of accounts and Pick'em, independent of any backend: features use these
// types and the Backend interface, never Supabase directly, so the backend can be swapped.

export interface User {
  id: string;
  email: string | null;
}

export interface Profile {
  id: string;
  displayName: string;
  avatar: string | null; // a fighter's public id: their photo is the profile picture
}

export type Method = "KO/TKO" | "SUB" | "DEC";
export const METHODS: Method[] = ["KO/TKO", "SUB", "DEC"];

/** Where a bout sits on the card, as the UFC bills it. */
export type Segment = "main" | "prelims" | "early";

export interface PickemEvent {
  id: string;
  name: string;
  startsOn: string; // yyyy-mm-dd
  locksAt: string; // ISO time: picks close then
  scoredAt: string | null;
}

export interface PickemBout {
  id: string;
  eventId: string;
  position: number; // running order, main event first
  fighterA: string; // public fighter ids, as on the site
  fighterB: string;
  aName: string;
  bName: string;
  modelPA: number | null;
  marketPA: number | null;
  segment: Segment;
  title: boolean; // a championship fight
  outcome: "win" | "draw" | "nc" | null; // null until fought
  winner: string | null; // the result, once in
  method: Method | null;
}

export interface Pick {
  boutId: string;
  winner: string;
  method: Method | null;
}

/** A league-mate's pick, visible once the card has locked. */
export interface MatePick {
  displayName: string;
  boutId: string;
  winner: string;
}

/** A private group of friends with its own leaderboard, joined with an invite code. */
export interface League {
  id: string;
  name: string;
  inviteCode: string;
  isOwner: boolean;
}

export interface LeaderboardRow {
  displayName: string;
  avatar: string | null;
  points: number;
  correct: number;
  picked: number;
  events: number;
}

/** How the signed-in user did on one scored event. */
export interface EventScore {
  eventId: string;
  name: string;
  startsOn: string;
  points: number;
  correct: number;
  picked: number;
}

/** Everything the app asks of a backend. One implementation today (Supabase, supabase.ts). */
export interface Backend {
  auth: {
    currentUser(): Promise<User | null>;
    /** Calls back on sign-in and sign-out; returns the unsubscribe function. */
    onChange(callback: (user: User | null) => void): () => void;
    signInWithGoogle(): Promise<void>;
    /** Emails a one-time sign-in link: no passwords. */
    signInWithEmail(email: string): Promise<void>;
    signOut(): Promise<void>;
    /** Deletes the account and everything that belongs to it. */
    deleteAccount(): Promise<void>;
  };
  profiles: {
    mine(): Promise<Profile | null>;
    create(displayName: string): Promise<Profile>;
    update(changes: { displayName?: string; avatar?: string | null }): Promise<void>;
  };
  pickem: {
    /** The next event still open for picks (or the latest one), with its bouts. */
    currentEvent(): Promise<{ event: PickemEvent; bouts: PickemBout[] } | null>;
    myPicks(eventId: string): Promise<Pick[]>;
    pick(pick: Pick): Promise<void>;
    unpick(boutId: string): Promise<void>;
    leaderboard(limit?: number): Promise<LeaderboardRow[]>;
    /** League-mates' picks on an event (empty until it locks). */
    matesPicks(eventId: string): Promise<MatePick[]>;
    /** The signed-in user's scored events, latest first. */
    myScores(): Promise<EventScore[]>;
  };
  leagues: {
    mine(): Promise<League[]>;
    create(name: string): Promise<League>;
    /** Join by invite code; returns the league's id. */
    join(inviteCode: string): Promise<string>;
    leave(leagueId: string): Promise<void>;
    standings(leagueId: string): Promise<LeaderboardRow[]>;
  };
}

/** A failure to show the user (e.g. "that name is taken"), as opposed to a bug. */
export class BackendError extends Error {}
