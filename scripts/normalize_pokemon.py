from __future__ import annotations

import argparse
import json
import re
from typing import Any

from scripts.pipeline_config import (
    DATASET_VERSION,
    PROCESSED_ROOT,
    RAW_ROOT,
    ensure_directories,
)

SPACE_PATTERN = re.compile(r"\s+")
ID_PATTERN = re.compile(r"/(\d+)/?$")


def clean_text(value: str) -> str:
    return SPACE_PATTERN.sub(" ", value.replace("\u000c", " ")).strip()


def localized_name(entries: list[dict[str, Any]], language: str) -> str | None:
    return next(
        (entry["name"] for entry in entries if entry["language"]["name"] == language),
        None,
    )


def localized_genus(entries: list[dict[str, Any]], language: str) -> str | None:
    return next(
        (entry["genus"] for entry in entries if entry["language"]["name"] == language),
        None,
    )


def flavor_texts(entries: list[dict[str, Any]], language: str, limit: int = 5) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for entry in reversed(entries):
        if entry["language"]["name"] != language:
            continue
        text = clean_text(entry["flavor_text"])
        key = text.casefold()
        if text and key not in seen:
            seen.add(key)
            unique.append(text)
        if len(unique) == limit:
            break
    return unique


def resource_name(resource: dict[str, Any] | None) -> str | None:
    return resource["name"] if resource else None


def resource_id(resource: dict[str, Any] | None) -> int | None:
    if not resource:
        return None
    match = ID_PATTERN.search(resource["url"])
    return int(match.group(1)) if match else None


def normalize_record(pokemon: dict[str, Any], species: dict[str, Any]) -> dict[str, Any]:
    names = species["names"]
    genera = species["genera"]
    genus_zh = localized_genus(genera, "zh-hans")
    descriptions_zh = flavor_texts(species["flavor_text_entries"], "zh-hans")
    descriptions_en = flavor_texts(species["flavor_text_entries"], "en")
    image = pokemon["sprites"].get("other", {}).get("official-artwork", {}).get(
        "front_default"
    ) or pokemon["sprites"].get("front_default")

    return {
        "id": species["id"],
        "slug": species["name"],
        "name": localized_name(names, "zh-hans") or localized_name(names, "en"),
        "nameEn": localized_name(names, "en") or species["name"],
        "nameJa": localized_name(names, "ja"),
        "genus": genus_zh or localized_genus(genera, "en"),
        "genusLanguage": "zh-hans" if genus_zh else "en",
        "descriptions": descriptions_zh or descriptions_en,
        "descriptionLanguage": "zh-hans" if descriptions_zh else "en",
        "image": image,
        "types": [entry["type"]["name"] for entry in pokemon["types"]],
        "abilities": [entry["ability"]["name"] for entry in pokemon["abilities"]],
        "eggGroups": [entry["name"] for entry in species["egg_groups"]],
        "color": resource_name(species["color"]),
        "shape": resource_name(species["shape"]),
        "footprint": None,
        "habitat": resource_name(species["habitat"]),
        "generation": resource_name(species["generation"]),
        "evolutionChainId": resource_id(species["evolution_chain"]),
        "height": pokemon["height"],
        "weight": pokemon["weight"],
        "stats": {
            entry["stat"]["name"]: entry["base_stat"] for entry in pokemon["stats"]
        },
        "isBaby": species["is_baby"],
        "isLegendary": species["is_legendary"],
        "isMythical": species["is_mythical"],
    }


def build_dataset(limit: int | None = None) -> dict[str, Any]:
    species_files = sorted(
        (RAW_ROOT / "pokemon-species").glob("*.json"),
        key=lambda path: int(path.stem),
    )
    if limit is not None:
        species_files = species_files[:limit]

    records: list[dict[str, Any]] = []
    for species_path in species_files:
        pokemon_path = RAW_ROOT / "pokemon" / species_path.name
        if not pokemon_path.exists():
            continue
        species = json.loads(species_path.read_text(encoding="utf-8"))
        pokemon = json.loads(pokemon_path.read_text(encoding="utf-8"))
        records.append(normalize_record(pokemon, species))

    return {
        "datasetVersion": DATASET_VERSION,
        "count": len(records),
        "pokemon": records,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize cached PokéAPI species data.")
    parser.add_argument("--limit", type=int, help="Only normalize the first N cached species.")
    args = parser.parse_args()
    ensure_directories()
    dataset = build_dataset(args.limit)
    destination = PROCESSED_ROOT / "pokemon.json"
    destination.write_text(
        json.dumps(dataset, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {dataset['count']} species to {destination}")


if __name__ == "__main__":
    main()
