from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT / "data"
RAW_ROOT = DATA_ROOT / "raw"
PROCESSED_ROOT = DATA_ROOT / "processed"
DERIVED_ROOT = DATA_ROOT / "derived"
GAME_ROOT = DATA_ROOT / "game"
TRANSLATION_ROOT = DATA_ROOT / "translations"
REPORT_ROOT = PROJECT_ROOT / "reports"

POKEAPI_BASE_URL = "https://pokeapi.co/api/v2"
DATASET_VERSION = 1
GRAPH_VERSION = 6
ALGORITHM_VERSION = 1


def ensure_directories() -> None:
    for path in (
        RAW_ROOT,
        PROCESSED_ROOT,
        DERIVED_ROOT,
        GAME_ROOT,
        TRANSLATION_ROOT,
        REPORT_ROOT,
    ):
        path.mkdir(parents=True, exist_ok=True)
