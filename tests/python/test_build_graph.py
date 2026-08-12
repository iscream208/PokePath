import numpy as np

from scripts.build_graph import name_similarity_matrix, nearest_neighbors, score_matrices


def pokemon_fixture(pokemon_id: int) -> dict:
    return {
        "id": pokemon_id,
        "name": "甲" if pokemon_id == 1 else "乙",
        "genus": None,
        "types": [],
        "eggGroups": [],
        "habitat": None,
        "shape": None,
        "footprint": None,
        "color": None,
        "abilities": [],
        "evolutionChainId": None,
        "stats": {
            "hp": 50,
            "attack": 50,
            "defense": 50,
            "special-attack": 50,
            "special-defense": 50,
            "speed": 50,
        },
    }


def test_missing_description_pair_reassigns_semantic_weight_to_profile() -> None:
    pokemon = [pokemon_fixture(1), pokemon_fixture(2)]
    profile = np.asarray([[1.0, 0.0], [1.0, 0.0]], dtype=np.float32)
    description = np.asarray([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32)

    complete_scores, _ = score_matrices(
        pokemon,
        profile,
        description,
        np.asarray([True, True]),
    )
    fallback_scores, _ = score_matrices(
        pokemon,
        profile,
        description,
        np.asarray([True, False]),
    )

    assert np.isclose(complete_scores[0, 1], 0.16)
    assert np.isclose(fallback_scores[0, 1], 0.54)


def test_name_similarity_rewards_rare_shared_chinese_characters() -> None:
    names = ["惊角鹿", "四季鹿", "小火龙", "小拉达", "小拳石", "小磁怪"]
    pokemon = [{"name": name} for name in names]
    scores = name_similarity_matrix(pokemon)

    assert scores[0, 1] > scores[2, 3]
    assert scores[0, 2] == 0


def test_nearest_neighbors_returns_exact_sorted_count() -> None:
    scores = np.asarray(
        [
            [-1.0, 0.2, 0.9, 0.5],
            [0.2, -1.0, 0.4, 0.8],
            [0.9, 0.4, -1.0, 0.3],
            [0.5, 0.8, 0.3, -1.0],
        ],
        dtype=np.float32,
    )
    assert nearest_neighbors(scores, k=2) == [[2, 3], [3, 2], [0, 1], [1, 0]]
