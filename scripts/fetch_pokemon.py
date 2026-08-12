from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
from rich.progress import Progress

from scripts.pipeline_config import POKEAPI_BASE_URL, RAW_ROOT, ensure_directories


async def fetch_json(
    client: httpx.AsyncClient,
    url: str,
    destination: Path,
    *,
    force: bool,
) -> dict[str, Any]:
    if destination.exists() and not force:
        return json.loads(destination.read_text(encoding="utf-8"))

    last_error: httpx.HTTPError | None = None
    for attempt in range(5):
        try:
            response = await client.get(url)
            response.raise_for_status()
            payload = response.json()
            break
        except httpx.HTTPError as error:
            last_error = error
            if attempt == 4:
                raise
            await asyncio.sleep(0.5 * (2**attempt))
    else:
        raise RuntimeError("PokéAPI request failed") from last_error
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return payload


async def fetch_species(
    client: httpx.AsyncClient,
    species_id: int,
    *,
    force: bool,
) -> None:
    await fetch_json(
        client,
        POKEAPI_BASE_URL + "/pokemon/" + str(species_id),
        RAW_ROOT / "pokemon" / (str(species_id) + ".json"),
        force=force,
    )
    await fetch_json(
        client,
        POKEAPI_BASE_URL + "/pokemon-species/" + str(species_id),
        RAW_ROOT / "pokemon-species" / (str(species_id) + ".json"),
        force=force,
    )


async def fetch_all(*, limit: int | None, force: bool) -> None:
    ensure_directories()
    async with httpx.AsyncClient(timeout=30) as client:
        index = await fetch_json(
            client,
            POKEAPI_BASE_URL + "/pokemon-species?limit=1",
            RAW_ROOT / "species-index.json",
            force=force,
        )

    count = min(index["count"], limit) if limit else index["count"]
    semaphore = asyncio.Semaphore(6)

    async with httpx.AsyncClient(
        limits=httpx.Limits(max_connections=8, max_keepalive_connections=8),
        timeout=httpx.Timeout(45),
    ) as client:
        async def tracked(species_id: int, progress: Progress, task_id: int) -> None:
            async with semaphore:
                await fetch_species(client, species_id, force=force)
                progress.advance(task_id)

        with Progress() as progress:
            task_id = progress.add_task("下载 PokéAPI 物种数据", total=count)
            await asyncio.gather(
                *(tracked(species_id, progress, task_id) for species_id in range(1, count + 1))
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download and cache PokéAPI species data.")
    parser.add_argument("--limit", type=int, help="Only fetch the first N species.")
    parser.add_argument("--force", action="store_true", help="Replace cached responses.")
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    asyncio.run(fetch_all(limit=arguments.limit, force=arguments.force))
