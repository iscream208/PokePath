from __future__ import annotations

from pathlib import Path

import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer


class OnnxSentenceEncoder:
    def __init__(self, repo_id: str, cache_root: Path, max_length: int = 512) -> None:
        model_path = hf_hub_download(
            repo_id=repo_id,
            filename="onnx/model.onnx",
            cache_dir=cache_root,
        )
        tokenizer_path = hf_hub_download(
            repo_id=repo_id,
            filename="onnx/tokenizer.json",
            cache_dir=cache_root,
        )
        self.tokenizer = Tokenizer.from_file(tokenizer_path)
        self.tokenizer.enable_truncation(max_length=max_length)
        pad_token = "<pad>"
        pad_id = self.tokenizer.token_to_id(pad_token)
        if pad_id is None:
            pad_token = "[PAD]"
            pad_id = self.tokenizer.token_to_id(pad_token)
        if pad_id is None:
            raise ValueError("Tokenizer does not define a padding token")
        self.tokenizer.enable_padding(pad_id=pad_id, pad_token=pad_token)
        self.session = ort.InferenceSession(
            model_path,
            providers=["CPUExecutionProvider"],
        )
        self.input_names = {item.name for item in self.session.get_inputs()}

    def encode(self, texts: list[str], batch_size: int = 16) -> np.ndarray:
        batches: list[np.ndarray] = []
        for start in range(0, len(texts), batch_size):
            encodings = self.tokenizer.encode_batch(texts[start : start + batch_size])
            input_ids = np.asarray([item.ids for item in encodings], dtype=np.int64)
            attention_mask = np.asarray(
                [item.attention_mask for item in encodings],
                dtype=np.int64,
            )
            feed = {
                "input_ids": input_ids,
                "attention_mask": attention_mask,
            }
            if "token_type_ids" in self.input_names:
                feed["token_type_ids"] = np.asarray(
                    [item.type_ids for item in encodings],
                    dtype=np.int64,
                )
            hidden_state = self.session.run(None, feed)[0]
            mask = attention_mask[..., None].astype(np.float32)
            pooled = (hidden_state * mask).sum(axis=1) / np.clip(mask.sum(axis=1), 1, None)
            norms = np.linalg.norm(pooled, axis=1, keepdims=True)
            batches.append((pooled / np.clip(norms, 1e-12, None)).astype(np.float32))
        return np.concatenate(batches, axis=0)
