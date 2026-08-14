from __future__ import annotations

import json
import math
import re
from typing import Any

import networkx as nx
import numpy as np

from scripts.pipeline_config import (
    DERIVED_ROOT,
    GAME_ROOT,
    GRAPH_VERSION,
    PROCESSED_ROOT,
    REPORT_ROOT,
)

WEIGHTS = {
    "profileText": 0.13,
    "descriptionText": 0.38,
    "name": 0.05,
    "genus": 0.12,
    "types": 0.07,
    "eggGroups": 0.07,
    "habitat": 0.03,
    "shape": 0.025,
    "footprint": 0.0,
    "color": 0.015,
    "abilities": 0.04,
    "evolution": 0.04,
    "stats": 0.03,
}
CJK_PATTERN = re.compile(r"[㐀-䶿一-鿿豈-﫿]")
TYPE_ZH = {
    "normal": "一般",
    "fire": "火",
    "water": "水",
    "electric": "电",
    "grass": "草",
    "ice": "冰",
    "fighting": "格斗",
    "poison": "毒",
    "ground": "地面",
    "flying": "飞行",
    "psychic": "超能力",
    "bug": "虫",
    "rock": "岩石",
    "ghost": "幽灵",
    "dragon": "龙",
    "dark": "恶",
    "steel": "钢",
    "fairy": "妖精",
}


def jaccard(left: list[str], right: list[str]) -> float:
    a, b = set(left), set(right)
    union = a | b
    return len(a & b) / len(union) if union else 0.0


def equal_score(left: str | None, right: str | None) -> float:
    return float(bool(left) and left == right)


def stat_matrix(pokemon: list[dict[str, Any]]) -> np.ndarray:
    names = ["hp", "attack", "defense", "special-attack", "special-defense", "speed"]
    values = np.asarray(
        [[item["stats"][name] for name in names] for item in pokemon], dtype=np.float32
    )
    values = (values - values.mean(axis=0)) / np.clip(values.std(axis=0), 1e-6, None)
    distance = np.linalg.norm(values[:, None, :] - values[None, :, :], axis=2)
    return np.exp(-distance / 2.5).astype(np.float32)


def chinese_name_characters(name: str) -> set[str]:
    return set(CJK_PATTERN.findall(name))


def name_similarity_matrix(pokemon: list[dict[str, Any]]) -> np.ndarray:
    character_sets = [chinese_name_characters(str(item["name"])) for item in pokemon]
    vocabulary = sorted(set().union(*character_sets))
    if not vocabulary:
        return np.zeros((len(pokemon), len(pokemon)), dtype=np.float32)

    character_index = {character: index for index, character in enumerate(vocabulary)}
    document_frequency = {
        character: sum(character in characters for characters in character_sets)
        for character in vocabulary
    }
    count = len(pokemon)
    vectors = np.zeros((count, len(vocabulary)), dtype=np.float32)
    for row, characters in enumerate(character_sets):
        for character in characters:
            inverse_document_frequency = math.log(
                (count + 1) / (document_frequency[character] + 1)
            ) + 1
            vectors[row, character_index[character]] = inverse_document_frequency
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    vectors /= np.clip(norms, 1e-12, None)
    return np.clip(vectors @ vectors.T, 0, 1).astype(np.float32)


def score_matrices(
    pokemon: list[dict[str, Any]],
    profile_embeddings: np.ndarray,
    description_embeddings: np.ndarray,
    description_available: np.ndarray,
) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    count = len(pokemon)
    matrices = {
        key: np.zeros((count, count), dtype=np.float32)
        for key in WEIGHTS
        if key not in {"profileText", "descriptionText", "name", "stats"}
    }
    matrices["profileText"] = np.clip(profile_embeddings @ profile_embeddings.T, 0, 1)
    matrices["descriptionText"] = np.clip(
        description_embeddings @ description_embeddings.T,
        0,
        1,
    )
    matrices["name"] = name_similarity_matrix(pokemon)
    matrices["stats"] = stat_matrix(pokemon)

    for left in range(count):
        for right in range(left + 1, count):
            a, b = pokemon[left], pokemon[right]
            values = {
                "genus": equal_score(a["genus"], b["genus"]),
                "types": jaccard(a["types"], b["types"]),
                "eggGroups": jaccard(a["eggGroups"], b["eggGroups"]),
                "habitat": equal_score(a["habitat"], b["habitat"]),
                "shape": equal_score(a["shape"], b["shape"]),
                "footprint": equal_score(a["footprint"], b["footprint"]),
                "color": equal_score(a["color"], b["color"]),
                "abilities": jaccard(a["abilities"], b["abilities"]),
                "evolution": equal_score(a["evolutionChainId"], b["evolutionChainId"]),
            }
            for key, value in values.items():
                matrices[key][left, right] = matrices[key][right, left] = value

    total = sum(
        WEIGHTS[key] * matrix
        for key, matrix in matrices.items()
        if key not in {"profileText", "descriptionText"}
    )
    semantic = (
        WEIGHTS["profileText"] * matrices["profileText"]
        + WEIGHTS["descriptionText"] * matrices["descriptionText"]
    )
    both_have_descriptions = description_available[:, None] & description_available[None, :]
    semantic[~both_have_descriptions] = (
        (WEIGHTS["profileText"] + WEIGHTS["descriptionText"])
        * matrices["profileText"][~both_have_descriptions]
    )
    total += semantic
    np.fill_diagonal(total, -1)
    return total, matrices


NEIGHBORS_PER_POKEMON = 25


def nearest_neighbors(
    scores: np.ndarray, k: int = NEIGHBORS_PER_POKEMON
) -> list[list[int]]:
    if k <= 0 or k >= len(scores):
        raise ValueError("Neighbor count must be between 1 and node count minus 1")
    return [
        [int(candidate) for candidate in np.argsort(scores[index])[::-1][:k]]
        for index in range(len(scores))
    ]


def directed_graph(neighbors: list[list[int]]) -> nx.DiGraph:
    graph = nx.DiGraph()
    graph.add_nodes_from(range(len(neighbors)))
    for left, closest in enumerate(neighbors):
        graph.add_edges_from((left, right) for right in closest)
    return graph


def ensure_strong_connectivity(
    neighbors: list[list[int]],
    scores: np.ndarray,
) -> tuple[list[list[int]], list[dict[str, int | float]]]:
    """Add the fewest high-similarity bridge edges while preserving row sizes."""
    connected = [list(row) for row in neighbors]
    original_count = len(connected[0])
    bridge_pairs: list[tuple[int, int]] = []

    while True:
        graph = directed_graph(connected)
        if nx.is_strongly_connected(graph):
            break
        if not nx.is_weakly_connected(graph):
            raise RuntimeError("Nearest-neighbor graph is not weakly connected")

        components = list(nx.strongly_connected_components(graph))
        component_by_node = {
            node: component_index
            for component_index, component in enumerate(components)
            for node in component
        }
        condensation = nx.DiGraph()
        condensation.add_nodes_from(range(len(components)))
        condensation.add_edges_from(
            (component_by_node[left], component_by_node[right])
            for left, right in graph.edges()
            if component_by_node[left] != component_by_node[right]
        )
        sources = [node for node, degree in condensation.in_degree() if degree == 0]
        sinks = [node for node, degree in condensation.out_degree() if degree == 0]

        candidates: list[tuple[float, int, int]] = []
        for source_component in sources:
            for sink_component in sinks:
                if source_component == sink_component:
                    continue
                if not nx.has_path(condensation, source_component, sink_component):
                    continue
                for left in components[sink_component]:
                    for right in components[source_component]:
                        if right not in connected[left]:
                            candidates.append((float(scores[left, right]), left, right))
        if not candidates:
            raise RuntimeError("Could not find a bridge that reduces strong components")
        _, left, right = max(candidates)
        connected[left].append(right)
        bridge_pairs.append((left, right))

    bridge_records: list[dict[str, int | float]] = []
    for left, right in bridge_pairs:
        removable = sorted(
            (
                candidate
                for candidate in connected[left]
                if candidate != right and (left, candidate) not in bridge_pairs
            ),
            key=lambda candidate: float(scores[left, candidate]),
        )
        replaced: int | None = None
        for candidate in removable:
            connected[left].remove(candidate)
            if nx.is_strongly_connected(directed_graph(connected)):
                replaced = candidate
                break
            connected[left].append(candidate)
        if replaced is None:
            raise RuntimeError("Could not preserve neighbor count while retaining connectivity")
        bridge_records.append(
            {
                "from": left,
                "to": right,
                "replaced": replaced,
                "score": float(scores[left, right]),
            }
        )

    for left, row in enumerate(connected):
        row.sort(key=lambda right: float(scores[left, right]), reverse=True)
        if len(row) != original_count:
            raise RuntimeError("Bridge repair changed the neighbor count")
    if not nx.is_strongly_connected(directed_graph(connected)):
        raise RuntimeError("Bridge repair did not produce a strongly connected graph")
    return connected, bridge_records


def normalize_layout(embedding: np.ndarray) -> np.ndarray:
    """Normalize an Nx2 embedding into stable 0..1 drawing coordinates."""
    minimum = embedding.min(axis=0)
    span = np.ptp(embedding, axis=0)
    return ((embedding - minimum) / np.clip(span, 1e-12, None)).astype(np.float32)


def graph_layout(scores: np.ndarray) -> np.ndarray:
    """Project the complete similarity field once; browsers only render the result."""
    from umap import UMAP

    distances = 1.0 - np.clip(scores, 0.0, 1.0)
    np.fill_diagonal(distances, 0.0)
    embedding = UMAP(
        n_components=2,
        n_neighbors=20,
        min_dist=0.16,
        metric="precomputed",
        init="spectral",
        random_state=42,
        n_jobs=1,
    ).fit_transform(distances)
    return normalize_layout(embedding)


def edge_reasons(
    a: dict[str, Any],
    b: dict[str, Any],
    profile_text_score: float,
    description_text_score: float,
    name_score: float,
    both_have_descriptions: bool,
) -> list[str]:
    reasons: list[str] = []
    if a["genus"] and a["genus"] == b["genus"]:
        reasons.append("同为" + a["genus"])
    shared_name_characters = chinese_name_characters(a["name"]) & chinese_name_characters(
        b["name"]
    )
    if name_score >= 0.22 and shared_name_characters:
        reasons.append("中文名称共同包含“" + "、".join(sorted(shared_name_characters)) + "”")
    shared_types = [TYPE_ZH.get(value, value) for value in set(a["types"]) & set(b["types"])]
    if shared_types:
        reasons.append("共同拥有" + "、".join(shared_types) + "属性")
    if set(a["eggGroups"]) & set(b["eggGroups"]):
        reasons.append("属于相同蛋群")
    if a["evolutionChainId"] and a["evolutionChainId"] == b["evolutionChainId"]:
        reasons.append("来自同一进化链")
    if a["habitat"] and a["habitat"] == b["habitat"]:
        reasons.append("栖息环境相近")
    if both_have_descriptions and description_text_score >= 0.82:
        reasons.append("图鉴描述中的生态或行为接近")
    elif profile_text_score >= 0.82:
        reasons.append("结构化档案的整体语义接近")
    return reasons[:3] or ["综合资料呈现相似特征"]


def main() -> None:
    dataset = json.loads((PROCESSED_ROOT / "pokemon.json").read_text(encoding="utf-8"))
    pokemon = dataset["pokemon"]
    profile_embeddings = np.load(DERIVED_ROOT / "profile-embeddings.npy")
    description_embeddings = np.load(DERIVED_ROOT / "description-embeddings.npy")
    description_available = np.load(DERIVED_ROOT / "description-embedding-available.npy")
    if not (
        len(pokemon)
        == len(profile_embeddings)
        == len(description_embeddings)
        == len(description_available)
    ):
        raise ValueError("Pokemon and split embedding counts do not match")

    scores, matrices = score_matrices(
        pokemon,
        profile_embeddings,
        description_embeddings,
        description_available,
    )
    layout = graph_layout(scores)
    directed, bridges = ensure_strong_connectivity(nearest_neighbors(scores), scores)
    graph = directed_graph(directed)
    bridge_pairs = {(int(item["from"]), int(item["to"])) for item in bridges}

    output: dict[str, list[dict[str, Any]]] = {}
    for left, closest in enumerate(directed):
        edges = []
        for right in closest:
            edges.append(
                {
                    "id": pokemon[right]["id"],
                    "score": round(float(scores[left, right]), 4),
                    "bridge": (left, right) in bridge_pairs,
                    "reasons": edge_reasons(
                        pokemon[left],
                        pokemon[right],
                        float(matrices["profileText"][left, right]),
                        float(matrices["descriptionText"][left, right]),
                        float(matrices["name"][left, right]),
                        bool(description_available[left] and description_available[right]),
                    ),
                }
            )
        output[str(pokemon[left]["id"])] = edges

    GAME_ROOT.mkdir(parents=True, exist_ok=True)
    (GAME_ROOT / "graph.json").write_text(
        json.dumps(
            {
                "graphVersion": GRAPH_VERSION,
                "layout": {
                    "version": 1,
                    "method": "umap-precomputed",
                    "positions": {
                        str(item["id"]): [round(float(x), 5), round(float(y), 5)]
                        for item, (x, y) in zip(pokemon, layout, strict=True)
                    },
                },
                "neighbors": output,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    game_pokemon = [
        {
            key: item[key]
            for key in (
                "id",
                "name",
                "nameEn",
                "image",
                "descriptions",
                "types",
                "evolutionChainId",
            )
        }
        for item in pokemon
    ]
    (GAME_ROOT / "pokemon.json").write_text(
        json.dumps(
            {"datasetVersion": dataset["datasetVersion"], "pokemon": game_pokemon},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    out_degrees = [degree for _, degree in graph.out_degree()]
    in_degrees = [degree for _, degree in graph.in_degree()]
    report = {
        "nodes": graph.number_of_nodes(),
        "edges": graph.number_of_edges(),
        "connected": nx.is_strongly_connected(graph),
        "stronglyConnected": nx.is_strongly_connected(graph),
        "weaklyConnected": nx.is_weakly_connected(graph),
        "directed": True,
        "neighborsPerPokemon": len(directed[0]),
        "layout": {
            "version": 1,
            "method": "umap-precomputed",
            "dimensions": 2,
            "minimum": layout.min(axis=0).tolist(),
            "maximum": layout.max(axis=0).tolist(),
        },
        "bridgesAdded": [
            {
                "from": {
                    "id": pokemon[int(item["from"])]["id"],
                    "name": pokemon[int(item["from"])]["name"],
                },
                "to": {
                    "id": pokemon[int(item["to"])]["id"],
                    "name": pokemon[int(item["to"])]["name"],
                },
                "replaced": {
                    "id": pokemon[int(item["replaced"])]["id"],
                    "name": pokemon[int(item["replaced"])]["name"],
                },
                "score": round(float(item["score"]), 4),
            }
            for item in bridges
        ],
        "outDegree": {
            "min": min(out_degrees),
            "max": max(out_degrees),
            "mean": sum(out_degrees) / len(out_degrees),
        },
        "inDegree": {
            "min": min(in_degrees),
            "max": max(in_degrees),
            "mean": sum(in_degrees) / len(in_degrees),
        },
        "topInDegree": [
            {"id": pokemon[index]["id"], "name": pokemon[index]["name"], "degree": degree}
            for index, degree in sorted(
                graph.in_degree(), key=lambda pair: pair[1], reverse=True
            )[:20]
        ],
        "weights": WEIGHTS,
        "nameSimilarity": {
            "method": "cosine similarity of binary Chinese-character TF-IDF vectors",
            "reasonThreshold": 0.22,
        },
        "semanticFallback": {
            "when": "either Pokemon has no description embedding",
            "profileText": WEIGHTS["profileText"] + WEIGHTS["descriptionText"],
            "descriptionText": 0.0,
        },
        "descriptionEmbeddingAvailable": int(description_available.sum()),
    }
    REPORT_ROOT.mkdir(parents=True, exist_ok=True)
    (REPORT_ROOT / "graph-quality.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote graph with {graph.number_of_nodes()} nodes and {graph.number_of_edges()} edges")


if __name__ == "__main__":
    main()
