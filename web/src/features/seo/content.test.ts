import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildPages, nameMatches, type SeoData, slug } from "./content";

const json = (file: string) => JSON.parse(readFileSync(`public/data/${file}`, "utf8"));
const data: SeoData = { predictor: json("predictor.json"), mma: json("mma_math.json"), styles: json("style_map.json") };
const pages = buildPages(data, "https://example.com/");

describe("search pages", () => {
  it("has a page for every fighter, upcoming card and upcoming fight", () => {
    for (const f of data.predictor.fighters) expect(pages.has(`fighters/${f.id}`)).toBe(true);
    const cards = data.predictor.upcoming ?? [];
    expect(cards.length).toBeGreaterThan(0);
    const fights = cards.reduce((n, c) => n + c.fights.length, 0);
    expect([...pages.values()].filter((p) => p.kind === "fight").length).toBe(fights);
    expect(pages.has("fighters") && pages.has("cards")).toBe(true);
  });

  it("gives every page its own title and description, and never links to a missing page", () => {
    const list = [...pages.values()];
    expect(new Set(list.map((p) => p.meta.title)).size).toBe(list.length);
    const dead: string[] = [];
    const check = (path: string | null) => {
      if (path && !pages.has(path)) dead.push(path);
    };
    for (const p of list) {
      expect(p.meta.description.length).toBeGreaterThan(40);
      if (p.kind === "fighter") {
        p.recent.forEach((r) => check(r.opponent.path));
        p.similar.forEach((s) => check(s.path));
        check(p.next?.fight ?? null);
      } else if (p.kind === "card") {
        p.fights.forEach((f) => [f.path, f.a.path, f.b.path].forEach(check));
      } else if (p.kind === "fight") {
        [p.card.path, p.a.path, p.b.path].forEach(check);
      } else {
        p.groups.forEach((g) => g.links.forEach((l) => check(l.path)));
      }
    }
    expect(dead).toEqual([]);
  });

  it("finds fighters whatever the accents, case or word order", () => {
    expect(nameMatches("Jiří Procházka", "prochazka")).toBe(true);
    expect(nameMatches("Jiří Procházka", "PROCHAZKA jiri")).toBe(true);
    expect(nameMatches("Jiří Procházka", "proch")).toBe(true);
    expect(nameMatches("Jiří Procházka", "walker")).toBe(false);
    expect(nameMatches("Jiří Procházka", "   ")).toBe(true);
  });

  it("makes addresses out of names", () => {
    expect(slug("UFC 334: Gane vs. Hokit")).toBe("ufc-334-gane-vs-hokit");
    expect(slug("Jiří Procházka")).toBe("jiri-prochazka");
  });
});
