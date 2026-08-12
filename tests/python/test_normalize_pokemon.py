from scripts.normalize_pokemon import clean_text, flavor_texts, localized_genus, localized_name


def test_clean_text_removes_game_control_whitespace() -> None:
    assert clean_text("第一行\n第二行\u000c  结束") == "第一行 第二行 结束"


def test_localized_name_selects_requested_language() -> None:
    entries = [
        {"name": "Bulbasaur", "language": {"name": "en"}},
        {"name": "妙蛙种子", "language": {"name": "zh-hans"}},
    ]
    assert localized_name(entries, "zh-hans") == "妙蛙种子"
    assert localized_name(entries, "fr") is None


def test_localized_genus_selects_requested_language() -> None:
    entries = [
        {"genus": "Seed Pokémon", "language": {"name": "en"}},
        {"genus": "种子宝可梦", "language": {"name": "zh-hans"}},
    ]
    assert localized_genus(entries, "zh-hans") == "种子宝可梦"


def test_flavor_texts_prefers_latest_unique_entries() -> None:
    entries = [
        {"flavor_text": "旧描述", "language": {"name": "zh-hans"}},
        {"flavor_text": "新\n描述", "language": {"name": "zh-hans"}},
        {"flavor_text": "新 描述", "language": {"name": "zh-hans"}},
    ]
    assert flavor_texts(entries, "zh-hans") == ["新 描述", "旧描述"]
