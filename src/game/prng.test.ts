import { describe, expect, it } from "vitest";
import { decodeChallenge, encodeChallenge, mulberry32, seedFromDate } from "./prng";

describe("challenge identity", () => {
  it("round-trips a challenge code", () => {
    const identity = {
      datasetVersion: 1,
      graphVersion: 2,
      algorithmVersion: 3,
      difficulty: "N" as const,
      seed: 987654321,
    };
    expect(decodeChallenge(encodeChallenge(identity))).toEqual(identity);
  });

  it("rejects malformed codes", () => {
    expect(decodeChallenge("not-a-challenge")).toBeNull();
  });
});

describe("deterministic random", () => {
  it("returns the same sequence for the same seed", () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });

  it("creates a stable daily seed", () => {
    expect(seedFromDate("2026-08-11")).toBe(seedFromDate("2026-08-11"));
  });
});
