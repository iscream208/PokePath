from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from typing import Any

from scripts.pipeline_config import PROCESSED_ROOT, REPORT_ROOT, ensure_directories

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


def join_values(values: list[str], translations: dict[str, str] | None = None) -> str:
    if translations:
        values = [translations.get(value, value) for value in values]
    return "、".join(values) if values else "未知"


def normalize_description(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    normalized = normalized.replace("\n", " ").replace("\f", " ")
    return re.sub(r"\\s+", " ", normalized).strip()


def deduplicate_descriptions(descriptions: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for description in descriptions:
        normalized = normalize_description(description)
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result


def build_profile_document(pokemon: dict[str, Any]) -> str:
    traits: list[str] = []
    if pokemon["isLegendary"]:
        traits.append("传说的宝可梦")
    if pokemon["isMythical"]:
        traits.append("幻之宝可梦")
    if pokemon["isBaby"]:
        traits.append("幼年宝可梦")

    sections = [
        "passage: 宝可梦结构化档案。",
        "分类：" + str(pokemon["genus"] or "未知") + "。",
        "形态：" + str(pokemon["shape"] or "未知") + "。",
        "栖息地：" + str(pokemon["habitat"] or "未知") + "。",
        "蛋群：" + join_values(pokemon["eggGroups"]) + "。",
        "特性：" + join_values(pokemon["abilities"]) + "。",
        "图鉴颜色：" + str(pokemon["color"] or "未知") + "。",
    ]
    if traits:
        sections.append("特殊分类：" + "、".join(traits) + "。")
    return " ".join(sections)


def document_record(pokemon_id: int, text: str, **extra: int) -> dict[str, str | int]:
    return {
        "id": pokemon_id,
        **extra,
        "text": text,
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
    }


def main() -> None:
    ensure_directories()
    source = PROCESSED_ROOT / "pokemon.json"
    dataset = json.loads(source.read_text(encoding="utf-8"))
    profile_documents = []
    description_documents = []
    missing = {"name": [], "image": [], "description": []}
    duplicate_description_count = 0

    for pokemon in dataset["pokemon"]:
        profile = build_profile_document(pokemon)
        profile_documents.append(document_record(pokemon["id"], profile))

        raw_descriptions = pokemon["descriptions"]
        descriptions = deduplicate_descriptions(raw_descriptions)
        duplicate_description_count += len(raw_descriptions) - len(descriptions)
        for index, description in enumerate(descriptions):
            description_documents.append(
                document_record(
                    pokemon["id"],
                    "passage: " + description,
                    index=index,
                )
            )

        for field, source_field in (
            ("name", "name"),
            ("image", "image"),
            ("description", "descriptions"),
        ):
            if not pokemon[source_field]:
                missing[field].append(pokemon["id"])

    for filename, documents in (
        ("profile-documents.jsonl", profile_documents),
        ("description-documents.jsonl", description_documents),
    ):
        (PROCESSED_ROOT / filename).write_text(
            "\n".join(json.dumps(item, ensure_ascii=False) for item in documents) + "\n",
            encoding="utf-8",
        )

    quality = {
        "datasetVersion": dataset["datasetVersion"],
        "count": len(profile_documents),
        "profileDocumentCount": len(profile_documents),
        "descriptionDocumentCount": len(description_documents),
        "duplicateDescriptionsRemoved": duplicate_description_count,
        "chineseDescriptionCount": sum(
            item["descriptionLanguage"] == "zh-hans" for item in dataset["pokemon"]
        ),
        "missing": missing,
    }
    (REPORT_ROOT / "data-quality.json").write_text(
        json.dumps(quality, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        f"Wrote {len(profile_documents)} profile documents, "
        f"{len(description_documents)} description documents and data-quality.json"
    )


if __name__ == "__main__":
    main()
