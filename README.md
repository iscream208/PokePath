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
uv run python -m scripts.fetch_pokemon --limit 10
uv run python -m scripts.build_graph
```

完整产品与算法方案见 `Pokemon-Synonymy-方案.md`。
