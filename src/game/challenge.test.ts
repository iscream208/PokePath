import { describe, expect, it } from "vitest";
import { generateChallenge, randomIdentity } from "./challenge";
import { neighbors } from "./data";

function shortestDistance(startId: number, targetId: number): number {
  const queue = [startId];
  const distances = new Map<number, number>([[startId, 0]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current === targetId) return distances.get(current)!;
    for (const edge of neighbors[String(current)] ?? []) {
      if (distances.has(edge.id)) continue;
      distances.set(edge.id, distances.get(current)! + 1);
      queue.push(edge.id);
    }
  }
  return Number.POSITIVE_INFINITY;
}

describe("challenge generation", () => {
  it("is deterministic for the same identity", () => {
    const identity = randomIdentity(123456, "E");
    expect(generateChallenge(identity)).toEqual(generateChallenge(identity));
  });

  it("creates one distinct reachable start at least three steps away", () => {
    const challenge = generateChallenge(randomIdentity(987654, "E"));
    expect(challenge.startId).not.toBe(challenge.targetId);
    expect(challenge.distances[challenge.startId]).toBeGreaterThanOrEqual(3);
    expect(shortestDistance(challenge.startId, challenge.targetId))
      .toBe(challenge.distances[challenge.startId]);
  });

  it("keeps the minimum-distance rule across many seeds", () => {
    for (let seed = 0; seed < 250; seed += 1) {
      const challenge = generateChallenge(randomIdentity(seed, "E"));
      expect(challenge.startId).not.toBe(challenge.targetId);
      expect(challenge.distances[challenge.startId]).toBeGreaterThanOrEqual(3);
    }
  });
});
