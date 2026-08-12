from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np

from scripts.embedding_onnx import OnnxSentenceEncoder
from scripts.pipeline_config import DERIVED_ROOT, PROCESSED_ROOT, PROJECT_ROOT, ensure_directories

DEFAULT_MODEL = "intfloat/multilingual-e5-small"


def load_documents(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def aggregate_hash(documents: list[dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    for document in documents:
        digest.update(str(document["id"]).encode("ascii"))
        digest.update(str(document.get("index", "")).encode("ascii"))
        digest.update(str(document["sha256"]).encode("ascii"))
    return digest.hexdigest()


def normalize_vector(vector: np.ndarray) -> np.ndarray:
    return vector / np.clip(np.linalg.norm(vector), 1e-12, None)


def average_embeddings_by_id(
    vectors: np.ndarray,
    documents: list[dict[str, Any]],
    pokemon_ids: list[int],
    dimensions: int | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    if len(vectors) != len(documents):
        raise ValueError("Description document and vector counts do not match")
    if dimensions is None:
        if vectors.ndim != 2 or not vectors.shape[1]:
            raise ValueError("Embedding dimensions are required for an empty vector set")
        dimensions = int(vectors.shape[1])

    rows_by_id: dict[int, list[int]] = {}
    for row, document in enumerate(documents):
        rows_by_id.setdefault(int(document["id"]), []).append(row)

    averaged = np.zeros((len(pokemon_ids), dimensions), dtype=np.float32)
    available = np.zeros(len(pokemon_ids), dtype=np.bool_)
    for output_row, pokemon_id in enumerate(pokemon_ids):
        rows = rows_by_id.get(pokemon_id)
        if not rows:
            continue
        averaged[output_row] = normalize_vector(vectors[rows].mean(axis=0)).astype(np.float32)
        available[output_row] = True
    return averaged, available


def cache_is_current(
    metadata_path: Path,
    output_paths: tuple[Path, ...],
    model: str,
    source_hash: str,
    force: bool,
) -> bool:
    if force or not metadata_path.exists() or not all(path.exists() for path in output_paths):
        return False
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    return metadata.get("model") == model and metadata.get("sourceHash") == source_hash


def write_metadata(path: Path, **metadata: Any) -> None:
    path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build split local semantic embeddings.")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    ensure_directories()
    profile_documents = load_documents(PROCESSED_ROOT / "profile-documents.jsonl")
    description_documents = load_documents(PROCESSED_ROOT / "description-documents.jsonl")
    pokemon_ids = [int(document["id"]) for document in profile_documents]

    profile_hash = aggregate_hash(profile_documents)
    id_hash = hashlib.sha256(",".join(map(str, pokemon_ids)).encode("ascii")).hexdigest()
    description_hash = hashlib.sha256(
        (aggregate_hash(description_documents) + id_hash).encode("ascii")
    ).hexdigest()

    profile_path = DERIVED_ROOT / "profile-embeddings.npy"
    profile_metadata_path = DERIVED_ROOT / "profile-embedding-metadata.json"
    description_path = DERIVED_ROOT / "description-embeddings.npy"
    description_available_path = DERIVED_ROOT / "description-embedding-available.npy"
    description_metadata_path = DERIVED_ROOT / "description-embedding-metadata.json"

    profile_current = cache_is_current(
        profile_metadata_path,
        (profile_path,),
        args.model,
        profile_hash,
        args.force,
    )
    description_current = cache_is_current(
        description_metadata_path,
        (description_path, description_available_path),
        args.model,
        description_hash,
        args.force,
    )
    if profile_current and description_current:
        print("Profile and description embeddings are current")
        return

    model = OnnxSentenceEncoder(args.model, PROJECT_ROOT / "models")

    if profile_current:
        profile_vectors = np.load(profile_path)
        print(f"Profile embeddings are current: {profile_path}")
    else:
        profile_vectors = model.encode(
            [str(document["text"]) for document in profile_documents],
            batch_size=args.batch_size,
        ).astype(np.float32)
        np.save(profile_path, profile_vectors)
        write_metadata(
            profile_metadata_path,
            model=args.model,
            sourceHash=profile_hash,
            count=len(profile_documents),
            dimensions=int(profile_vectors.shape[1]),
            normalized=True,
            dtype=str(profile_vectors.dtype),
            documentKind="structured-profile",
        )
        print(f"Wrote profile embeddings {profile_vectors.shape} to {profile_path}")

    if description_current:
        print(f"Description embeddings are current: {description_path}")
        return

    if description_documents:
        description_rows = model.encode(
            [str(document["text"]) for document in description_documents],
            batch_size=args.batch_size,
        ).astype(np.float32)
    else:
        description_rows = np.empty((0, profile_vectors.shape[1]), dtype=np.float32)
    description_vectors, description_available = average_embeddings_by_id(
        description_rows,
        description_documents,
        pokemon_ids,
        dimensions=int(profile_vectors.shape[1]),
    )
    np.save(description_path, description_vectors)
    np.save(description_available_path, description_available)
    write_metadata(
        description_metadata_path,
        model=args.model,
        sourceHash=description_hash,
        documentCount=len(description_documents),
        pokemonCount=len(pokemon_ids),
        availableCount=int(description_available.sum()),
        dimensions=int(description_vectors.shape[1]),
        normalized=True,
        aggregation="normalized-mean-of-normalized-description-vectors",
        dtype=str(description_vectors.dtype),
    )
    print(
        f"Wrote description embeddings {description_vectors.shape} "
        f"({int(description_available.sum())} available) to {description_path}"
    )


if __name__ == "__main__":
    main()
