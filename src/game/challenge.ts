import {
  DATASET_VERSION,
  GRAPH_VERSION,
  incomingNeighborIds,
  neighbors,
  pokemon,
  pokemonById,
} from "./data";
import { mulberry32, type ChallengeIdentity } from "./prng";

export interface Challenge {
  identity: ChallengeIdentity;
  targetId: number;
  startIds: number[];
  distances: Record<number, number>;
}

const DISTANCE_RANGES = {
  E: [3, 4],
  N: [5, 6],
  H: [7, 8],
} as const;

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
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

function chooseStarts(
  targetId: number,
  distances: Record<number, number>,
  identity: ChallengeIdentity,
  random: () => number,
): number[] | null {
  const [minimum, maximum] = DISTANCE_RANGES[identity.difficulty];
  const target = pokemonById.get(targetId)!;
  const candidates = shuffle(
    pokemon.filter((item) => {
      const distance = distances[item.id];
      return (
        distance >= minimum &&
        distance <= maximum &&
        item.evolutionChainId !== target.evolutionChainId
      );
    }),
    random,
  );

  const chosen: number[] = [];
  const typeSignatures = new Set<string>();
  for (const candidate of candidates) {
    const signature = [...candidate.types].sort().join("/");
    if (typeSignatures.has(signature) && candidates.length > 5) continue;
    chosen.push(candidate.id);
    typeSignatures.add(signature);
    if (chosen.length === 5) return shuffle(chosen, random);
  }
  return null;
}

export function generateChallenge(identity: ChallengeIdentity): Challenge {
  if (
    identity.datasetVersion !== DATASET_VERSION ||
    identity.graphVersion !== GRAPH_VERSION ||
    identity.algorithmVersion !== 1
  ) {
    throw new Error("挑战码来自不兼容的数据或算法版本。");
  }

  const random = mulberry32(identity.seed);
  const eligibleTargets = pokemon.filter((item) => (neighbors[String(item.id)]?.length ?? 0) >= 6);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const target = eligibleTargets[Math.floor(random() * eligibleTargets.length)];
    const distances = distancesFrom(target.id);
    const startIds = chooseStarts(target.id, distances, identity, random);
    if (startIds) {
      return { identity, targetId: target.id, startIds, distances };
    }
  }
  throw new Error("无法从这个种子生成合格挑战，请换一个种子。");
}

export function randomIdentity(seed: number, difficulty: ChallengeIdentity["difficulty"] = "N"): ChallengeIdentity {
  return {
    datasetVersion: DATASET_VERSION,
    graphVersion: GRAPH_VERSION,
    algorithmVersion: 1,
    difficulty,
    seed: seed >>> 0,
  };
}
