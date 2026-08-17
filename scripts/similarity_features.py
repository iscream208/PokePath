from __future__ import annotations


EXCLUDED_EGG_GROUPS = frozenset({"no-eggs"})


def similarity_egg_groups(egg_groups: list[str]) -> list[str]:
    return [group for group in egg_groups if group not in EXCLUDED_EGG_GROUPS]
