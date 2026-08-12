from scripts.pipeline_config import ALGORITHM_VERSION, DATASET_VERSION, GRAPH_VERSION


def test_versions_are_positive() -> None:
    assert DATASET_VERSION > 0
    assert GRAPH_VERSION > 0
    assert ALGORITHM_VERSION > 0

