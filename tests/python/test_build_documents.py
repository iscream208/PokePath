from scripts.build_documents import (
    build_profile_document,
    deduplicate_descriptions,
    normalize_description,
)


def pokemon_fixture() -> dict:
    return {
        "name": "喷火龙",
        "nameEn": "Charizard",
        "genus": "火焰宝可梦",
        "types": ["fire", "flying"],
        "eggGroups": ["monster", "dragon"],
        "color": "red",
        "shape": "upright",
        "habitat": "mountain",
        "abilities": ["blaze"],
        "isLegendary": False,
        "isMythical": False,
        "isBaby": False,
        "descriptions": ["会在空中飞翔，寻找强大的对手。"],
    }


def test_profile_document_is_stable_and_excludes_descriptions() -> None:
    document = build_profile_document(pokemon_fixture())
    assert document.startswith("passage: 宝可梦结构化档案。")
    assert "分类：火焰宝可梦。" in document
    assert "形态：upright。" in document
    assert "图鉴颜色：red。" in document
    assert "会在空中飞翔" not in document
    assert "属性：" not in document
    assert "喷火龙" not in document
    assert "Charizard" not in document


def test_profile_document_excludes_no_eggs_instead_of_marking_it_unknown() -> None:
    fixture = pokemon_fixture()
    fixture["eggGroups"] = ["no-eggs"]

    document = build_profile_document(fixture)

    assert "no-eggs" not in document
    assert "蛋群：" not in document


def test_description_normalization_and_exact_deduplication() -> None:
    descriptions = [
        "  会在空中\n飞翔。  ",
        "会在空中 飞翔。",
        "它会寻找强大的对手。",
    ]
    assert normalize_description(descriptions[0]) == "会在空中 飞翔。"
    assert deduplicate_descriptions(descriptions) == [
        "会在空中 飞翔。",
        "它会寻找强大的对手。",
    ]
