// A made-up past season for the demo backend: four fought cards with results, and everyone's
// picks on them (you, the sample players, the model), so the profile's history, stats and
// badges have something to show locally. Local only, like the rest of the demo.

import type { EventScore, Method, PastPick, PickemBout } from "./types";

interface PastBout {
  a: string;
  b: string;
  aName: string;
  bName: string;
  market: number; // bookmakers' P(a wins)
  winner: "a" | "b";
  method: Method;
}

const EVENTS: { id: string; name: string; startsOn: string; bouts: PastBout[] }[] = [
  {
    id: "demo-e1",
    name: "UFC 330: Pereira vs. Ankalaev 3",
    startsOn: "2026-10-10",
    bouts: [
      { a: "alex-pereira", b: "magomed-ankalaev", aName: "Alex Pereira", bName: "Magomed Ankalaev", market: 0.42, winner: "a", method: "KO/TKO" },
      { a: "max-holloway", b: "dustin-poirier", aName: "Max Holloway", bName: "Dustin Poirier", market: 0.6, winner: "a", method: "DEC" },
      { a: "islam-makhachev", b: "ilia-topuria", aName: "Islam Makhachev", bName: "Ilia Topuria", market: 0.62, winner: "b", method: "KO/TKO" },
      { a: "ciryl-gane", b: "josh-hokit", aName: "Ciryl Gane", bName: "Josh Hokit", market: 0.7, winner: "a", method: "DEC" },
      { a: "tatiana-suarez", b: "virna-jandiroba", aName: "Tatiana Suarez", bName: "Virna Jandiroba", market: 0.66, winner: "a", method: "SUB" },
    ],
  },
  {
    id: "demo-e2",
    name: "UFC Fight Night: Holloway vs. Topuria",
    startsOn: "2026-10-17",
    bouts: [
      { a: "max-holloway", b: "ilia-topuria", aName: "Max Holloway", bName: "Ilia Topuria", market: 0.35, winner: "b", method: "KO/TKO" },
      { a: "dustin-poirier", b: "alex-pereira", aName: "Dustin Poirier", bName: "Alex Pereira", market: 0.4, winner: "a", method: "SUB" },
      { a: "magomed-ankalaev", b: "ciryl-gane", aName: "Magomed Ankalaev", bName: "Ciryl Gane", market: 0.55, winner: "a", method: "DEC" },
      { a: "josh-hokit", b: "islam-makhachev", aName: "Josh Hokit", bName: "Islam Makhachev", market: 0.2, winner: "b", method: "SUB" },
    ],
  },
  {
    id: "demo-e3",
    name: "UFC 331: Makhachev vs. Pereira",
    startsOn: "2026-10-24",
    bouts: [
      { a: "islam-makhachev", b: "alex-pereira", aName: "Islam Makhachev", bName: "Alex Pereira", market: 0.58, winner: "a", method: "SUB" },
      { a: "ilia-topuria", b: "dustin-poirier", aName: "Ilia Topuria", bName: "Dustin Poirier", market: 0.75, winner: "a", method: "KO/TKO" },
      { a: "virna-jandiroba", b: "tatiana-suarez", aName: "Virna Jandiroba", bName: "Tatiana Suarez", market: 0.38, winner: "a", method: "SUB" },
      { a: "ciryl-gane", b: "magomed-ankalaev", aName: "Ciryl Gane", bName: "Magomed Ankalaev", market: 0.48, winner: "b", method: "DEC" },
      { a: "max-holloway", b: "josh-hokit", aName: "Max Holloway", bName: "Josh Hokit", market: 0.8, winner: "a", method: "DEC" },
    ],
  },
  {
    id: "demo-e4",
    name: "UFC 333: Demo vs. Results",
    startsOn: "2026-10-31",
    bouts: [
      { a: "ilia-topuria", b: "islam-makhachev", aName: "Ilia Topuria", bName: "Islam Makhachev", market: 0.52, winner: "a", method: "KO/TKO" },
      { a: "alex-pereira", b: "ciryl-gane", aName: "Alex Pereira", bName: "Ciryl Gane", market: 0.57, winner: "a", method: "KO/TKO" },
      { a: "dustin-poirier", b: "max-holloway", aName: "Dustin Poirier", bName: "Max Holloway", market: 0.46, winner: "b", method: "DEC" },
      { a: "magomed-ankalaev", b: "josh-hokit", aName: "Magomed Ankalaev", bName: "Josh Hokit", market: 0.82, winner: "a", method: "DEC" },
      { a: "tatiana-suarez", b: "virna-jandiroba", aName: "Tatiana Suarez", bName: "Virna Jandiroba", market: 0.61, winner: "a", method: "DEC" },
    ],
  },
];

/** A stable pseudo-random number in [0, 1) for a string. */
function rand(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const METHODS: Method[] = ["KO/TKO", "SUB", "DEC"];

/** How sharp each demo player is: you're decent, the sample players get worse down the list. */
const skill = (userId: string) => (userId === "demo-user" ? 0.72 : userId.startsWith("sample-") ? 0.8 - Number(userId.slice(7)) * 0.012 : 0.5);

/** A player's picks on the demo season's fought bouts. The model (sample-2, "the_model") picks
 * the bookmakers' favourite. */
export function demoPastPicks(userId: string): PastPick[] {
  return EVENTS.flatMap((e) =>
    e.bouts.map((pb, i): PastPick => {
      const bout: PickemBout = {
        id: `${e.id}:${pb.a}:${pb.b}`,
        eventId: e.id,
        position: i + 1,
        fighterA: pb.a,
        fighterB: pb.b,
        aName: pb.aName,
        bName: pb.bName,
        modelPA: null,
        marketPA: pb.market,
        segment: "main",
        title: i === 0,
        outcome: "win",
        winner: pb.winner === "a" ? pb.a : pb.b,
        method: pb.method,
      };
      const r = rand(`${userId}:${bout.id}`);
      const right = userId === "sample-2" ? (pb.market >= 0.5) === (pb.winner === "a") : r < skill(userId);
      const winner = right ? bout.winner! : bout.winner === pb.a ? pb.b : pb.a;
      const method = userId === "sample-2" ? "DEC" : rand(`${userId}:m:${bout.id}`) < 0.5 ? pb.method : METHODS[Math.floor(r * 3)]!;
      return { pick: { boutId: bout.id, winner, method }, bout, eventName: e.name, startsOn: e.startsOn };
    }),
  );
}

/** Points for a pick, by the real rules (10, +5 method, +5 underdog). */
function points(p: PastPick): number {
  if (p.pick.winner !== p.bout.winner) return 0;
  const chance = p.pick.winner === p.bout.fighterA ? p.bout.marketPA! : 1 - p.bout.marketPA!;
  return 10 + (p.pick.method === p.bout.method ? 5 : 0) + (chance < 0.5 ? 5 : 0);
}

/** A player's scores on the demo season, latest first. */
export function demoPastScores(userId: string): EventScore[] {
  const picks = demoPastPicks(userId);
  return EVENTS.map((e) => {
    const mine = picks.filter((p) => p.bout.eventId === e.id);
    return {
      eventId: e.id,
      name: e.name,
      startsOn: e.startsOn,
      points: mine.reduce((n, p) => n + points(p), 0),
      correct: mine.filter((p) => p.pick.winner === p.bout.winner).length,
      picked: mine.length,
    };
  }).reverse();
}
