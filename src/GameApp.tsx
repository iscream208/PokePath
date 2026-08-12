import { FormEvent, useMemo, useState } from "react";
import { generateChallenge, randomIdentity, type Challenge } from "./game/challenge";
import { neighbors, pokemonById, type Neighbor, type Pokemon } from "./game/data";
import { decodeChallenge, encodeChallenge, seedFromDate, type ChallengeIdentity } from "./game/prng";
import "./game.css";

type Screen = "home" | "start" | "playing" | "won";
type HeaderPreview = "current" | "target";

const NEIGHBORS_PER_PAGE = 5;

const TYPE_ZH: Record<string, string> = {
  normal: "一般", fire: "火", water: "水", electric: "电", grass: "草",
  ice: "冰", fighting: "格斗", poison: "毒", ground: "地面", flying: "飞行",
  psychic: "超能力", bug: "虫", rock: "岩石", ghost: "幽灵", dragon: "龙",
  dark: "恶", steel: "钢", fairy: "妖精",
};

function PokemonImage({ pokemon, className = "" }: { pokemon: Pokemon; className?: string }) {
  return <img className={className} src={pokemon.image} alt={pokemon.name} loading="eager" />;
}

function TypeLabels({ pokemon }: { pokemon: Pokemon }) {
  return (
    <span className="type-list">
      {pokemon.types.map((type) => <span key={type} data-type={type}>{TYPE_ZH[type] ?? type}</span>)}
    </span>
  );
}

function firstDescriptionSentence(pokemon: Pokemon): string {
  const description = pokemon.descriptions[0]?.replace(/\s+/g, " ").trim() ?? "暂无图鉴描述。";
  const chineseSentence = description.match(/^.*?[。！？]/)?.[0];
  if (chineseSentence) return chineseSentence;
  return description.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? description;
}

function createSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}

function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [path, setPath] = useState<number[]>([]);
  const [challengeCode, setChallengeCode] = useState("");
  const [error, setError] = useState("");
  const [lastEdge, setLastEdge] = useState<Neighbor | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const [neighborPage, setNeighborPage] = useState(0);
  const [hoveredPreview, setHoveredPreview] = useState<HeaderPreview | null>(null);
  const [focusedPreview, setFocusedPreview] = useState<HeaderPreview | null>(null);
  const [pinnedPreview, setPinnedPreview] = useState<HeaderPreview | null>(null);

  const target = challenge ? pokemonById.get(challenge.targetId)! : null;
  const currentId = path.at(-1);
  const current = currentId ? pokemonById.get(currentId)! : null;
  const currentNeighbors = current ? neighbors[String(current.id)] ?? [] : [];
  const neighborPageCount = Math.max(1, Math.ceil(currentNeighbors.length / NEIGHBORS_PER_PAGE));
  const visibleNeighborPage = Math.min(neighborPage, neighborPageCount - 1);
  const visibleNeighborStart = visibleNeighborPage * NEIGHBORS_PER_PAGE;
  const visibleNeighbors = currentNeighbors.slice(
    visibleNeighborStart,
    visibleNeighborStart + NEIGHBORS_PER_PAGE,
  );

  function openChallenge(identity: ChallengeIdentity) {
    try {
      const generated = generateChallenge(identity);
      setChallenge(generated);
      setChallengeCode(encodeChallenge(identity));
      setPath([]);
      setLastEdge(null);
      setNeighborPage(0);
      setHoveredPreview(null);
      setFocusedPreview(null);
      setPinnedPreview(null);
      setError("");
      setScreen("start");
      const url = new URL(window.location.href);
      url.searchParams.set("challenge", encodeChallenge(identity));
      window.history.replaceState(null, "", url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "挑战生成失败，请换一个种子。");
    }
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const identity = decodeChallenge(challengeCode);
    if (!identity) {
      setError("这个挑战码无法识别，请检查是否完整复制。 ");
      return;
    }
    openChallenge(identity);
  }

  function chooseStart(id: number) {
    setPath([id]);
    setNeighborPage(0);
    setScreen("playing");
  }

  function chooseNeighbor(edge: Neighbor) {
    if (!challenge || !currentId) return;
    setLastEdge(edge);
    setNeighborPage(0);
    setHoveredPreview(null);
    setFocusedPreview(null);
    setPinnedPreview(null);
    setPath((previous) => [...previous, edge.id]);
    if (edge.id === challenge.targetId) setScreen("won");
  }

  function undo() {
    if (path.length <= 1) return;
    setPath((previous) => previous.slice(0, -1));
    setLastEdge(null);
    setNeighborPage(0);
  }

  function changeNeighborPage(direction: -1 | 1) {
    setNeighborPage((previous) => {
      const nextPage = Math.min(Math.max(previous + direction, 0), neighborPageCount - 1);
      return nextPage;
    });
  }

  async function shareChallenge() {
    if (!challenge) return;
    const url = new URL(window.location.href);
    url.searchParams.set("challenge", encodeChallenge(challenge.identity));
    const text = "宝可梦链挑战 " + encodeChallenge(challenge.identity) + "\n" + url.toString();
    await navigator.clipboard.writeText(text);
    setShareMessage("挑战链接已复制");
  }

  const distanceTrend = useMemo(() => {
    if (!challenge || path.length < 2) return null;
    const before = challenge.distances[path[path.length - 2]];
    const after = challenge.distances[path[path.length - 1]];
    return after < before ? "更接近目标" : after > before ? "暂时绕远了" : "与目标距离不变";
  }, [challenge, path]);

  const queryCode = new URLSearchParams(window.location.search).get("challenge");
  const dailyIdentity = randomIdentity(seedFromDate(new Date().toISOString().slice(0, 10)), "N");

  if (screen === "home") {
    return (
      <main id="main-content" className="game-shell home-screen">
        <header className="topbar">
          <span className="brand"><i aria-hidden="true">◉</i> PokéPath</span>
          <span className="edition">全国图鉴 · 图谱 01</span>
        </header>
        <section className="home-hero">
          <div>
            <p className="kicker">宝可梦关系探索</p>
            <h1>从一只宝可梦，<br />走到另一只。</h1>
            <p className="lead">沿着图鉴描述、生态与属性形成的联系不断跳转，找到通往目标的路径。</p>
            <div className="home-actions">
              <button className="action primary" onClick={() => openChallenge(randomIdentity(createSeed(), "N"))}>生成随机挑战</button>
              <button className="action secondary" onClick={() => openChallenge(dailyIdentity)}>开始今日挑战</button>
            </div>
          </div>
          <div className="orbit-sketch" aria-hidden="true">
            <span className="orbit-node orbit-one">起点</span>
            <span className="orbit-node orbit-two">相似</span>
            <span className="orbit-node orbit-three">转折</span>
            <span className="orbit-node orbit-goal">目标</span>
          </div>
        </section>
        <section className="code-panel">
          <div>
            <p className="section-number">01 / 挑战码</p>
            <h2>带着同一个种子出发</h2>
            <p>目标、开局候选和顺序都会固定。朋友打开相同链接，就会面对同一局。</p>
          </div>
          <form onSubmit={submitCode}>
            <label htmlFor="challenge-code">挑战码</label>
            <div className="code-entry">
              <input id="challenge-code" value={challengeCode} onChange={(event) => setChallengeCode(event.target.value)} placeholder="P1-G6-A1-N-7K4M2Q" />
              <button className="action dark" type="submit">进入挑战</button>
            </div>
            {queryCode && <button className="text-action" type="button" onClick={() => setChallengeCode(queryCode)}>使用链接中的挑战码</button>}
            <p className="error-text" aria-live="polite">{error}</p>
          </form>
        </section>
        <footer><span>免费、非商业的非官方同人实验</span><span>数据来源 PokéAPI</span></footer>
      </main>
    );
  }

  if (!challenge || !target) return null;

  if (screen === "start") {
    return (
      <main id="main-content" className="game-shell challenge-screen">
        <header className="topbar">
          <button className="brand brand-button" onClick={() => setScreen("home")}>◉ PokéPath</button>
          <span className="edition">{encodeChallenge(challenge.identity)}</span>
        </header>
        <section className="target-strip">
          <div><p className="kicker">本局目标</p><h1>{target.name}</h1><TypeLabels pokemon={target} /></div>
          <PokemonImage pokemon={target} className="target-image" />
        </section>
        <section className="start-section">
          <p className="section-number">选择路径起点</p>
          <h2>你准备从哪里出发？</h2>
          <p className="supporting">每个选项都能抵达目标，但路线长度和转折各不相同。</p>
          <div className="pokemon-grid">
            {challenge.startIds.map((id, index) => {
              const item = pokemonById.get(id)!;
              return (
                <button className="pokemon-choice" key={id} onClick={() => chooseStart(id)} style={{ "--order": index } as React.CSSProperties}>
                  <PokemonImage pokemon={item} />
                  <strong>{item.name}</strong>
                  <TypeLabels pokemon={item} />
                </button>
              );
            })}
          </div>
        </section>
      </main>
    );
  }

  if (!current) return null;
  const won = screen === "won";
  const activePreview = focusedPreview ?? hoveredPreview ?? pinnedPreview;
  const previewPokemon = activePreview === "current" ? current : target;
  return (
    <main id="main-content" className="game-shell play-screen">
      <header className="play-header">
        <button className="brand brand-button" onClick={() => setScreen("home")}>◉ PokéPath</button>
        <div className="pokemon-compass" aria-label="当前选择与本局目标">
          <button
            className="pokemon-summary"
            type="button"
            aria-expanded={activePreview === "current"}
            aria-controls="header-pokemon-preview"
            onPointerEnter={(event) => event.pointerType === "mouse" && setHoveredPreview("current")}
            onPointerLeave={(event) => event.pointerType === "mouse" && setHoveredPreview(null)}
            onFocus={() => setFocusedPreview("current")}
            onBlur={() => setFocusedPreview(null)}
            onClick={() => {
              setFocusedPreview(null);
              setPinnedPreview((value) => value === "current" ? null : "current");
            }}
          >
            <PokemonImage pokemon={current} />
            <span><small>已选</small><strong>{current.name}</strong></span>
          </button>
          <span className="compass-arrow" aria-hidden="true">→</span>
          <button
            className="pokemon-summary"
            type="button"
            aria-expanded={activePreview === "target"}
            aria-controls="header-pokemon-preview"
            onPointerEnter={(event) => event.pointerType === "mouse" && setHoveredPreview("target")}
            onPointerLeave={(event) => event.pointerType === "mouse" && setHoveredPreview(null)}
            onFocus={() => setFocusedPreview("target")}
            onBlur={() => setFocusedPreview(null)}
            onClick={() => {
              setFocusedPreview(null);
              setPinnedPreview((value) => value === "target" ? null : "target");
            }}
          >
            <PokemonImage pokemon={target} />
            <span><small>目标</small><strong>{target.name}</strong></span>
          </button>
        </div>
        <span className="step-count">{Math.max(0, path.length - 1)} 步</span>
        {activePreview && (
          <aside
            className={`header-pokemon-preview preview-${activePreview}`}
            id="header-pokemon-preview"
            aria-live="polite"
          >
            <div className="preview-specimen">
              <span>NO. {String(previewPokemon.id).padStart(4, "0")}</span>
              <PokemonImage pokemon={previewPokemon} />
            </div>
            <div className="preview-copy">
              <p className="kicker">{activePreview === "current" ? "当前已选" : "本局目标"}</p>
              <h2>{previewPokemon.name}</h2>
              <TypeLabels pokemon={previewPokemon} />
              <p>{previewPokemon.descriptions[0]}</p>
              {activePreview === "current" && lastEdge && (
                <p className="edge-reason"><strong>{distanceTrend}</strong><br />{lastEdge.reasons.join("，")}</p>
              )}
            </div>
          </aside>
        )}
      </header>

      {won ? (
        <section className="result-panel">
          <p className="kicker">路径完成</p>
          <h1>抵达 {target.name}</h1>
          <p>你用了 {path.length - 1} 步；从所选起点出发的最短路径是 {challenge.distances[path[0]]} 步。</p>
          <div className="path-ribbon result-path">{path.map((id) => <PokemonImage key={id + "-result"} pokemon={pokemonById.get(id)!} />)}</div>
          <div className="home-actions">
            <button className="action primary" onClick={shareChallenge}>复制挑战链接</button>
            <button className="action secondary" onClick={() => openChallenge(randomIdentity(createSeed(), challenge.identity.difficulty))}>再来一局</button>
          </div>
          <p className="success-text" aria-live="polite">{shareMessage}</p>
        </section>
      ) : (
        <section className="next-section">
            <div className="next-heading"><div><p className="section-number">下一步</p><h2>选择一个相似节点</h2></div><button className="text-action" onClick={undo} disabled={path.length <= 1}>撤回上一步</button></div>
            <div className="neighbor-browser">
              <button
                className="neighbor-page-button neighbor-previous"
                type="button"
                onClick={() => changeNeighborPage(-1)}
                disabled={visibleNeighborPage === 0}
                aria-label="上一页相邻宝可梦"
              >
                <span aria-hidden="true">←</span>
                <small>上一组</small>
              </button>
              <div
                className="neighbor-stage"
                key={`${current.id}-${visibleNeighborPage}`}
                style={{ "--visible-count": visibleNeighbors.length } as React.CSSProperties}
                aria-label={`第 ${visibleNeighborPage + 1} 页相邻宝可梦`}
              >
                {visibleNeighbors.map((edge, index) => {
                  const item = pokemonById.get(edge.id)!;
                  return (
                    <button
                      className="neighbor-choice"
                      key={edge.id}
                      onClick={() => chooseNeighbor(edge)}
                      style={{ "--order": index } as React.CSSProperties}
                    >
                      <span className="neighbor-figure">
                        <PokemonImage pokemon={item} />
                        <i aria-hidden="true">{String(visibleNeighborStart + index + 1).padStart(2, "0")}</i>
                      </span>
                      <span className="neighbor-meta">
                        <strong>{item.name}</strong>
                        <span className="neighbor-description">{firstDescriptionSentence(item)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                className="neighbor-page-button neighbor-next"
                type="button"
                onClick={() => changeNeighborPage(1)}
                disabled={visibleNeighborPage >= neighborPageCount - 1}
                aria-label="下一页相邻宝可梦"
              >
                <span aria-hidden="true">→</span>
                <small>下一组</small>
              </button>
            </div>
            <p className="neighbor-page-status" aria-live="polite">
              <span>{String(visibleNeighborPage + 1).padStart(2, "0")} / {String(neighborPageCount).padStart(2, "0")}</span>
              <span>{visibleNeighborStart + 1}—{visibleNeighborStart + visibleNeighbors.length} / {currentNeighbors.length} 个相似节点</span>
            </p>
        </section>
      )}
      <div className="path-dock"><span>路径</span><div className="path-ribbon">{path.map((id, index) => <PokemonImage key={id + "-" + index} pokemon={pokemonById.get(id)!} />)}</div></div>
    </main>
  );
}

export default App;
