import numpy as np

from scripts.build_embeddings import aggregate_hash, average_embeddings_by_id


def test_aggregate_hash_is_stable_and_order_sensitive() -> None:
    first = [
        {"id": 1, "index": 0, "sha256": "a"},
        {"id": 2, "index": 0, "sha256": "b"},
    ]
    second = list(reversed(first))
    assert aggregate_hash(first) == aggregate_hash(first)
    assert aggregate_hash(first) != aggregate_hash(second)


def test_description_vectors_are_averaged_and_renormalized_by_pokemon() -> None:
    vectors = np.asarray(
        [
            [1.0, 0.0],
            [0.0, 1.0],
            [0.0, 1.0],
        ],
        dtype=np.float32,
    )
    documents = [
        {"id": 1},
        {"id": 1},
        {"id": 2},
    ]
    averaged, available = average_embeddings_by_id(vectors, documents, [1, 2, 3])
    np.testing.assert_allclose(averaged[0], [2**-0.5, 2**-0.5], atol=1e-6)
    np.testing.assert_allclose(averaged[1], [0.0, 1.0], atol=1e-6)
    np.testing.assert_allclose(averaged[2], [0.0, 0.0], atol=1e-6)
    assert available.tolist() == [True, True, False]
