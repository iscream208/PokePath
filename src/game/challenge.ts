import {
  DATASET_VERSION,
  GRAPH_VERSION,
  incomingNeighborIds,
  pokemon,
} from "./data";
import { mulberry32, seedFromDate, type ChallengeIdentity } from "./prng";

export interface Challenge {
  identity: ChallengeIdentity;
  targetId: number;
  startId: number;
  distances: Record<number, number>;
}

const MINIMUM_START_DISTANCE = 3;
const CHINA_STANDARD_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

export function dailyChallengeDate(date = new Date()): string {
  return new Date(date.getTime() + CHINA_STANDARD_TIME_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export function dailyChallengeIdentity(date = new Date()): ChallengeIdentity {
  return randomIdentity(seedFromDate(dailyChallengeDate(date)), "E");
}

export function distancesFrom(targetId: number): Record<number, number> {
  const distances: Record<number, number> = { [targetId]: 0 };
  const queue = [targetId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const sourceId of incomingNeighborIds[String(current)] ?? []) {
      if (distances[sourceId] !== undefined) continue;
      distances[sourceId] = distances[current] + 1;
      queue.push(sourceId);
    }
  }
  return distances;
}

export function generateChallenge(identity: ChallengeIdentity): Challenge {
  if (
    identity.datasetVersion !== DATASET_VERSION ||
    identity.graphVersion !== GRAPH_VERSION ||
    identity.algorithmVersion !== 2
  ) {
    throw new Error("挑战码来自不兼容的数据或算法版本。");
  }

  const random = mulberry32(identity.seed);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const targetId = pokemon[Math.floor(random() * pokemon.length)].id;
    const startId = pokemon[Math.floor(random() * pokemon.length)].id;
    if (startId === targetId) continue;
    const distances = distancesFrom(targetId);
    const startDistance = distances[startId];
    if (startDistance === undefined || startDistance < MINIMUM_START_DISTANCE) continue;
    return { identity, targetId, startId, distances };
  }
  throw new Error("无法从这个种子生成至少 3 步的挑战，请换一个种子。");
}

export function randomIdentity(seed: number, mode: ChallengeIdentity["mode"] = "E"): ChallengeIdentity {
  return {
    datasetVersion: DATASET_VERSION,
    graphVersion: GRAPH_VERSION,
    algorithmVersion: 2,
    mode,
    seed: seed >>> 0,
  };
}
