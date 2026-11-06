// The app's own view of accounts and Pick'em, independent of any backend: features use these
// types and the Backend interface, never Supabase directly, so the backend can be swapped.

export interface User {
  id: string;
  email: string | null;
}

/** What anyone can see of a player: name, picture, when they joined. */
export interface PublicProfile {
  id: string;
  displayName: string;
  avatar: string | null;
  joinedOn: string; // yyyy-mm-dd
}

export interface Profile {
  id: string;
  displayName: string;
  avatar: string | null; // a fighter's public id: their photo is the profile picture
  notifyFriendRequests: boolean; // email me when someone sends a friend request
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
  avatar: string | null;
  boutId: string;
  winner: string;
  method: Method | null;
}

/** A league-mate who has picked a bout (but not whom: that shows after the lock). */
export interface MateWhoPicked {
  boutId: string;
  displayName: string;
  avatar: string | null;
}

/** How many players picked each fighter: bout id -> fighter id -> picks. Empty until the lock. */
export type PickSplit = Record<string, Record<string, number>>;

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

/** A friend, or an open friend request: "incoming" (they asked you) or "outgoing" (you asked). */
export interface Friend {
  userId: string;
  displayName: string;
  avatar: string | null;
  status: "friends" | "incoming" | "outgoing";
}

/** Everything the app asks of a backend. One implementation today (Supabase, supabase.ts). */
export interface Backend {
  auth: {
    currentUser(): Promise<User | null>;
    /** Calls back on sign-in and sign-out; returns the unsubscribe function. */
    onChange(callback: (user: User | null) => void): () => void;
    signInWithGoogle(): Promise<void>;
    /** Finishes a link from one of our emails (confirm the address, reset the password) when
     * the page was opened from one: links point at this site (?token_hash=...&type=...), not at
     * the backend. Returns what the link was for, or null if the page wasn't opened from one. */
    finishEmailLink(): Promise<"confirmed" | "recovery" | null>;
    /** Creates an account with email and password. "confirm": an email went out to confirm
     * the address first (the usual case); "signed-in": no confirmation needed. */
    signUp(email: string, password: string): Promise<"confirm" | "signed-in">;
    signInWithPassword(email: string, password: string): Promise<void>;
    /** Emails a link that opens the site to set a new password (see onPasswordRecovery). */
    sendPasswordReset(email: string): Promise<void>;
    /** Calls back when someone arrives from a password-reset link; returns the unsubscribe. */
    onPasswordRecovery(callback: () => void): () => void;
    /** Sets a new password for the signed-in user. */
    updatePassword(password: string): Promise<void>;
    signOut(): Promise<void>;
    /** Deletes the account and everything that belongs to it. */
    deleteAccount(): Promise<void>;
  };
  profiles: {
    mine(): Promise<Profile | null>;
    create(displayName: string): Promise<Profile>;
    update(changes: { displayName?: string; avatar?: string | null; notifyFriendRequests?: boolean }): Promise<void>;
    /** A player's public profile, by display name (null if there's no such player). */
    byName(displayName: string): Promise<PublicProfile | null>;
  };
  pickem: {
    /** Recent and upcoming events, earliest first (the latest one if there's nothing recent). */
    events(): Promise<PickemEvent[]>;
    /** One event with its bouts, in running order. */
    card(eventId: string): Promise<{ event: PickemEvent; bouts: PickemBout[] } | null>;
    /** Everyone's points on one scored event, best first. */
    eventLeaderboard(eventId: string, limit?: number): Promise<LeaderboardRow[]>;
    myPicks(eventId: string): Promise<Pick[]>;
    pick(pick: Pick): Promise<void>;
    unpick(boutId: string): Promise<void>;
    leaderboard(limit?: number): Promise<LeaderboardRow[]>;
    /** League-mates' picks on an event (empty until it locks). */
    matesPicks(eventId: string): Promise<MatePick[]>;
    /** Which league-mates have picked each bout (any time; not whom). */
    matesWhoPicked(eventId: string): Promise<MateWhoPicked[]>;
    /** How everyone picked, in counts (empty until it locks). */
    pickSplit(eventId: string): Promise<PickSplit>;
    /** The signed-in user's scored events, latest first. */
    myScores(): Promise<EventScore[]>;
    /** Any player's scored events, latest first (scores are public, like the leaderboard). */
    scoresOf(userId: string): Promise<EventScore[]>;
  };
  /** Mutual friends: one asks, the other accepts. */
  friends: {
    /** Your friends and open requests. */
    list(): Promise<Friend[]>;
    /** Ask someone to be friends (accepts instead, if they already asked you). */
    request(userId: string): Promise<"requested" | "accepted">;
    accept(userId: string): Promise<void>;
    /** Unfriend, decline, or take back a request. */
    remove(userId: string): Promise<void>;
    /** You and your friends, by points. */
    standings(): Promise<LeaderboardRow[]>;
  };
  leagues: {
    mine(): Promise<League[]>;
    create(name: string): Promise<League>;
    /** Join by invite code; returns the league's id. */
    join(inviteCode: string): Promise<string>;
    leave(leagueId: string): Promise<void>;
    standings(leagueId: string): Promise<LeaderboardRow[]>;
    /** The display names of a league's members (members only). */
    members(leagueId: string): Promise<string[]>;
  };
}

/** A failure to show the user (e.g. "that name is taken"), as opposed to a bug. */
export class BackendError extends Error {}
