import { describe, expect, it } from "vitest";

import { guestStarters, starterBadges } from "./starter";

const pick = (boutId: string, method: "DEC" | null = null) => ({ boutId, winner: "a", method });

describe("guestStarters", () => {
  it("earns nothing before the first pick", () => {
    expect(guestStarters([], ["b1", "b2", "b3"])).toEqual([]);
  });

  it("earns the first pick, and the method badge once a method is called", () => {
    expect(guestStarters([pick("b1")], ["b1", "b2", "b3"])).toEqual(["first-pick"]);
    expect(guestStarters([pick("b1", "DEC")], ["b1", "b2", "b3"])).toEqual(["first-pick", "called-method"]);
  });

  it("needs every main-card fight of a real card for the full card", () => {
    const main = ["b1", "b2", "b3"];
    expect(guestStarters([pick("b1"), pick("b2")], main)).not.toContain("full-card");
    expect(guestStarters([pick("b1"), pick("b2"), pick("b3")], main)).toContain("full-card");
    expect(guestStarters([pick("b1"), pick("b2")], ["b1", "b2"])).not.toContain("full-card");
  });
});

describe("starterBadges", () => {
  it("marks what's been earned and lists the rest as still to do", () => {
    const list = starterBadges(["first-pick"]);
    expect(list).toHaveLength(5);
    expect(list.filter((b) => b.earned).map((b) => b.key)).toEqual(["first-pick"]);
  });
});
