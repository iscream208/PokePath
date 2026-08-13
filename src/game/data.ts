import graphData from "../../data/game/graph.json";
import pokemonData from "../../data/game/pokemon.json";

export interface Pokemon {
  id: number;
  name: string;
  nameEn: string;
  image: string;
  descriptions: string[];
  genus: string | null;
  types: string[];
  evolutionChainId: number | null;
}

export interface Neighbor {
  id: number;
  score: number;
  bridge: boolean;
  reasons: string[];
}

export interface GraphLayout {
  version: number;
  method: string;
  positions: Record<string, [number, number]>;
}

export const DATASET_VERSION = pokemonData.datasetVersion;
export const GRAPH_VERSION = graphData.graphVersion;
export const pokemon = pokemonData.pokemon as Pokemon[];
export const pokemonById = new Map(pokemon.map((item) => [item.id, item]));
export const neighbors = graphData.neighbors as Record<string, Neighbor[]>;
export const graphLayout = graphData.layout as unknown as GraphLayout;
export const incomingNeighborIds: Record<string, number[]> = Object.fromEntries(
  pokemon.map((item) => [String(item.id), []]),
);
for (const [sourceId, edges] of Object.entries(neighbors)) {
  for (const edge of edges) incomingNeighborIds[String(edge.id)].push(Number(sourceId));
}
