from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from rich.progress import Progress

from scripts.pipeline_config import (
    PROCESSED_ROOT,
    PROJECT_ROOT,
    TRANSLATION_ROOT,
    ensure_directories,
)

DESTINATION = TRANSLATION_ROOT / "description-zh-hans.json"
PROVIDER = "OpenAI Codex"
CHINESE_PATTERN = re.compile(r"[\u3400-\u9fff]")
SPACE_BEFORE_PUNCTUATION = re.compile(r"\s+([，。！？；：])")
LATIN_NAME_BOUNDARY = r"(?<![A-Za-z])({names})(?![A-Za-z])"
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "translations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "pokemonId": {"type": "integer"},
                    "index": {"type": "integer"},
                    "translation": {"type": "string"},
                },
                "required": ["pokemonId", "index", "translation"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["translations"],
    "additionalProperties": False,
}


def source_sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def load_dataset() -> dict[str, Any]:
    return json.loads((PROCESSED_ROOT / "pokemon.json").read_text(encoding="utf-8"))


def build_name_pattern(pokemon: list[dict[str, Any]]) -> tuple[re.Pattern[str], dict[str, str]]:
    names = {
        str(item["nameEn"]).casefold(): str(item["name"])
        for item in pokemon
        if item.get("nameEn") and item.get("name")
    }
    alternatives = sorted((re.escape(name) for name in names), key=len, reverse=True)
    pattern = re.compile(
        LATIN_NAME_BOUNDARY.format(names="|".join(alternatives)),
        flags=re.IGNORECASE,
    )
    return pattern, names


def prepare_source(
    source: str,
    name_pattern: re.Pattern[str],
    localized_names: dict[str, str],
) -> str:
    prepared = name_pattern.sub(
        lambda match: localized_names.get(match.group(0).casefold(), match.group(0)),
        source,
    )
    return re.sub(r"Pok[eé]mon", "宝可梦", prepared, flags=re.IGNORECASE)


def clean_translation(value: str) -> str:
    cleaned = value.replace("神奇宝贝", "宝可梦")
    cleaned = cleaned.replace("口袋妖怪", "宝可梦").replace("宠物小精灵", "宝可梦")
    cleaned = re.sub(r"Pok[eé]mon", "宝可梦", cleaned, flags=re.IGNORECASE)
    cleaned = SPACE_BEFORE_PUNCTUATION.sub(r"\1", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def find_codex(explicit: str | None) -> str:
    if explicit:
        return explicit
    discovered = shutil.which("codex")
    if discovered:
        return discovered
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        candidate = (
            Path(local_app_data)
            / "Programs"
            / "OpenAI"
            / "Codex"
            / "bin"
            / "codex.exe"
        )
        if candidate.exists():
            return str(candidate)
    raise FileNotFoundError("Codex CLI was not found; pass --codex-command")


def load_overlay(force: bool) -> dict[str, Any]:
    if not force and DESTINATION.exists():
        overlay = json.loads(DESTINATION.read_text(encoding="utf-8"))
        if overlay.get("provider") == PROVIDER:
            return overlay
    return {
        "schemaVersion": 1,
        "targetLanguage": "zh-hans",
        "provider": PROVIDER,
        "generatedAt": None,
        "pokemon": {},
    }


def save_overlay(overlay: dict[str, Any]) -> None:
    overlay["generatedAt"] = datetime.now(UTC).isoformat()
    overlay["pokemon"] = dict(
        sorted(overlay["pokemon"].items(), key=lambda item: int(item[0]))
    )
    temporary = DESTINATION.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(overlay, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(DESTINATION)


def make_batches(
    work: list[dict[str, Any]],
    character_budget: int,
) -> list[list[dict[str, Any]]]:
    batches: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    current_size = 0
    for item in work:
        item_size = len(item["source"]) + 120
        if current and current_size + item_size > character_budget:
            batches.append(current)
            current = []
            current_size = 0
        current.append(item)
        current_size += item_size
    if current:
        batches.append(current)
    return batches


def translation_prompt(batch: list[dict[str, Any]]) -> str:
    payload = [
        {
            "pokemonId": item["pokemonId"],
            "index": item["index"],
            "nameZh": item["nameZh"],
            "genusZh": item["genusZh"],
            "source": item["prepared"],
        }
        for item in batch
    ]
    return (
        "你是宝可梦图鉴的中文本地化译者。请把下方 JSON 中每条 source "
        "独立翻译为自然、准确、简洁的简体中文。\n"
        "要求：\n"
        "1. 严格保留原文事实、语气和句子数量，不补充原文没有的信息。\n"
        "2. 使用 payload 已给出的中文宝可梦名称；Pokémon 一律译为“宝可梦”。\n"
        "3. 根据生物动作选择准确词义，例如飞行生物的 dive 通常译为“俯冲”，"
        "不要误写成潜入水中。\n"
        "4. 使用中文全角标点，表达像正式图鉴文本，不要逐字硬译。\n"
        "5. 每个 pokemonId 与 index 必须原样返回且恰好一次。只返回 schema "
        "要求的 JSON。\n\n"
        + json.dumps(payload, ensure_ascii=False)
    )


def run_codex_batch(
    codex_command: str,
    batch: list[dict[str, Any]],
    schema_path: Path,
    output_path: Path,
    timeout_seconds: int,
) -> dict[tuple[int, int], str]:
    command = [
        codex_command,
        "exec",
        "--ephemeral",
        "--ignore-rules",
        "--sandbox",
        "read-only",
        "--output-schema",
        str(schema_path),
        "--output-last-message",
        str(output_path),
        "--color",
        "never",
        "-C",
        str(PROJECT_ROOT),
        "-",
    ]
    completed = subprocess.run(
        command,
        input=translation_prompt(batch),
        text=True,
        capture_output=True,
        encoding="utf-8",
        timeout=timeout_seconds,
        check=False,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout)[-3000:]
        raise RuntimeError(f"Codex translation failed ({completed.returncode}): {detail}")
    response = json.loads(output_path.read_text(encoding="utf-8"))
    translations: dict[tuple[int, int], str] = {}
    for item in response["translations"]:
        key = (int(item["pokemonId"]), int(item["index"]))
        if key in translations:
            raise ValueError(f"Codex returned duplicate translation key {key}")
        value = clean_translation(str(item["translation"]))
        if not value or not CHINESE_PATTERN.search(value):
            raise ValueError(f"Codex returned non-Chinese translation for {key}")
        translations[key] = value
    expected = {(item["pokemonId"], item["index"]) for item in batch}
    if set(translations) != expected:
        missing = sorted(expected - set(translations))
        extra = sorted(set(translations) - expected)
        raise ValueError(f"Codex translation keys mismatch; missing={missing}, extra={extra}")
    return translations


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Translate English-only PokeAPI flavor text with OpenAI Codex."
    )
    parser.add_argument("--character-budget", type=int, default=12000)
    parser.add_argument("--limit-pokemon", type=int)
    parser.add_argument("--timeout-seconds", type=int, default=900)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--codex-command")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ensure_directories()
    dataset = load_dataset()
    pokemon = dataset["pokemon"]
    targets = [item for item in pokemon if item["descriptionLanguage"] == "en"]
    if args.limit_pokemon is not None:
        targets = targets[: args.limit_pokemon]

    codex_command = find_codex(args.codex_command)
    name_pattern, localized_names = build_name_pattern(pokemon)
    overlay = load_overlay(args.force)
    work: list[dict[str, Any]] = []

    for item in targets:
        pokemon_id = str(item["id"])
        record = overlay["pokemon"].setdefault(
            pokemon_id,
            {
                "name": item["name"],
                "sourceLanguage": "en",
                "entries": [],
            },
        )
        existing = {
            entry.get("sourceSha256"): entry
            for entry in record.get("entries", [])
            if isinstance(entry, dict)
        }
        entries = []
        for index, source in enumerate(item["descriptions"]):
            digest = source_sha256(source)
            previous = existing.get(digest)
            translation = "" if args.force or not previous else previous.get("translation", "")
            entries.append(
                {
                    "source": source,
                    "sourceSha256": digest,
                    "translation": translation,
                }
            )
            if not translation or not CHINESE_PATTERN.search(translation):
                work.append(
                    {
                        "pokemonId": int(item["id"]),
                        "index": index,
                        "nameZh": item["name"],
                        "genusZh": item["genus"],
                        "source": source,
                        "prepared": prepare_source(source, name_pattern, localized_names),
                    }
                )
        record["name"] = item["name"]
        record["entries"] = entries

    batches = make_batches(work, max(1000, args.character_budget))
    with tempfile.TemporaryDirectory(prefix="pokepath-codex-translation-") as temporary:
        temporary_root = Path(temporary)
        schema_path = temporary_root / "schema.json"
        schema_path.write_text(json.dumps(OUTPUT_SCHEMA), encoding="utf-8")

        with Progress() as progress:
            task = progress.add_task("Codex 翻译英文图鉴", total=len(work))
            for batch_index, batch in enumerate(batches):
                output_path = temporary_root / f"batch-{batch_index:03d}.json"
                last_error: Exception | None = None
                for attempt in range(max(1, args.retries)):
                    try:
                        translations = run_codex_batch(
                            codex_command,
                            batch,
                            schema_path,
                            output_path,
                            args.timeout_seconds,
                        )
                        break
                    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
                        last_error = error
                        if attempt + 1 == max(1, args.retries):
                            raise
                else:
                    raise RuntimeError("Codex translation failed") from last_error

                for item in batch:
                    record = overlay["pokemon"][str(item["pokemonId"])]
                    entry = record["entries"][item["index"]]
                    entry["translation"] = translations[
                        (item["pokemonId"], item["index"])
                    ]
                    progress.advance(task)
                save_overlay(overlay)

    translated_entries = [
        entry
        for record in overlay["pokemon"].values()
        for entry in record["entries"]
        if entry.get("translation")
    ]
    invalid = [
        entry
        for entry in translated_entries
        if not CHINESE_PATTERN.search(entry["translation"])
    ]
    if invalid:
        raise RuntimeError(f"{len(invalid)} saved translations do not contain Chinese")
    save_overlay(overlay)
    print(
        f"Saved {len(overlay['pokemon'])} Pokémon and "
        f"{len(translated_entries)} Codex translations to {DESTINATION}"
    )


if __name__ == "__main__":
    main()
