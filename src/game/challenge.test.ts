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
    const identity = randomIdentity(123456, "N");
    expect(generateChallenge(identity)).toEqual(generateChallenge(identity));
  });

  it("only creates reachable starts in the requested distance band", () => {
    const challenge = generateChallenge(randomIdentity(987654, "N"));
    expect(challenge.startIds).toHaveLength(5);
    for (const startId of challenge.startIds) {
      expect(challenge.distances[startId]).toBeGreaterThanOrEqual(5);
      expect(challenge.distances[startId]).toBeLessThanOrEqual(6);
      expect(shortestDistance(startId, challenge.targetId)).toBe(challenge.distances[startId]);
    }
  });
});
