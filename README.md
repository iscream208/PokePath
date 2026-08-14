# PokéPath

一款受 Synonymy 启发的非商业宝可梦关系探索游戏。玩家沿着名称、图鉴描述和结构化资料形成的相似关系移动，寻找通往目标宝可梦的路径。

项目已具备完整数据管线、挑战生成、二维路径地图和可游玩的前端流程。

## 前端

```powershell
npm install
npm run dev
```

## 数据管线

```powershell
uv sync --all-extras
uv run python -m scripts.fetch_pokemon
uv run python -m scripts.normalize_pokemon
uv run python -m scripts.translate_descriptions_zh
uv run python -m scripts.normalize_pokemon
uv run python -m scripts.build_documents
uv run python -m scripts.build_embeddings
uv run python -m scripts.build_graph
```

`translate_descriptions_zh` 使用已登录的本机 OpenAI Codex，把 PokeAPI
缺失中文的英文图鉴逐条翻译并保存到
`data/translations/description-zh-hans.json`。脚本支持中断续跑；规范化流程会依次
优先采用 PokeAPI 原生中文、已保存的 Codex 译文，最后才回退英文。

完整产品与算法方案见 `Pokemon-Synonymy-方案.md`。
