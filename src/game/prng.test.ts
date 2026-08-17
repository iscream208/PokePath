import { describe, expect, it } from "vitest";
import { decodeChallenge, encodeChallenge, mulberry32, seedFromDate } from "./prng";

describe("challenge identity", () => {
  it("round-trips a challenge code", () => {
    const identity = {
      datasetVersion: 1,
      graphVersion: 2,
      algorithmVersion: 3,
      mode: "H" as const,
      seed: 987654321,
    };
    expect(decodeChallenge(encodeChallenge(identity))).toEqual(identity);
  });

  it("rejects malformed codes", () => {
    expect(decodeChallenge("not-a-challenge")).toBeNull();
  });

  it("accepts the easy-mode challenge code shown in the interface", () => {
    expect(decodeChallenge("P1-G7-A2-E-002N9C")).toEqual({
      datasetVersion: 1,
      graphVersion: 7,
      algorithmVersion: 2,
      mode: "E",
      seed: Number.parseInt("002N9C", 36),
    });
  });

  it("rejects retired N-mode challenge codes", () => {
    expect(decodeChallenge("P1-G7-A2-N-002N9C")).toBeNull();
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
