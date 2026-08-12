export interface ChallengeIdentity {
  datasetVersion: number;
  graphVersion: number;
  algorithmVersion: number;
  difficulty: "E" | "N" | "H";
  seed: number;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function encodeChallenge(identity: ChallengeIdentity): string {
  const seed = identity.seed.toString(36).toUpperCase().padStart(6, "0");
  return [
    "P" + identity.datasetVersion,
    "G" + identity.graphVersion,
    "A" + identity.algorithmVersion,
    identity.difficulty,
    seed,
  ].join("-");
}

export function decodeChallenge(code: string): ChallengeIdentity | null {
  const match = /^P(\d+)-G(\d+)-A(\d+)-(E|N|H)-([0-9A-Z]+)$/i.exec(code.trim());
  if (!match) return null;
  const seed = Number.parseInt(match[5], 36);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
  return {
    datasetVersion: Number(match[1]),
    graphVersion: Number(match[2]),
    algorithmVersion: Number(match[3]),
    difficulty: match[4].toUpperCase() as ChallengeIdentity["difficulty"],
    seed,
  };
}

export function seedFromDate(date: string): number {
  let hash = 2166136261;
  for (const character of date) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

