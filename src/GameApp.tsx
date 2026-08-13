import { FormEvent, useMemo, useState } from "react";
import { generateChallenge, randomIdentity, type Challenge } from "./game/challenge";
import { neighbors, pokemonById, type Neighbor, type Pokemon } from "./game/data";
import { decodeChallenge, encodeChallenge, type ChallengeIdentity } from "./game/prng";
import { buildChallengeShareText } from "./game/share";
import PathMap from "./PathMap";
import "./game.css";

type Screen = "home" | "start" | "playing" | "won";
type HeaderPreview = "current" | "target";

const NEIGHBORS_PER_PAGE = 5;
const DEPLOYED_GAME_URL = "https://iscream208.github.io/PokePath/";

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

function cardDescriptionSentence(pokemon: Pokemon): string {
  const candidates = pokemon.descriptions
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((description) => {
      const chineseSentence = description.match(/^.*?[。！？]/)?.[0];
      if (chineseSentence) return chineseSentence;
      return description.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? description;
    });

  if (candidates.length === 0) return firstDescriptionSentence(pokemon);

  const readingLength = (value: string) => Array.from(value).reduce(
    (total, character) => total + (/[^\u0000-\u00ff]/.test(character) ? 2 : 1),
    0,
  );

  return candidates.reduce((shortest, candidate) => (
    readingLength(candidate) < readingLength(shortest) ? candidate : shortest
  ));
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
  const [challengeCode, setChallengeCode] = useState(
    () => new URLSearchParams(window.location.search).get("challenge") ?? "",
  );
  const [error, setError] = useState("");
  const [lastEdge, setLastEdge] = useState<Neighbor | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const [neighborPage, setNeighborPage] = useState(0);
  const [hoveredPreview, setHoveredPreview] = useState<HeaderPreview | null>(null);
  const [focusedPreview, setFocusedPreview] = useState<HeaderPreview | null>(null);
  const [pinnedPreview, setPinnedPreview] = useState<HeaderPreview | null>(null);

  const target = challenge ? pokemonById.get(challenge.targetId)! : null;
  const start = challenge ? pokemonById.get(challenge.startId)! : null;
  const hasMap = challenge?.identity.mode !== "H";
  const modeName = hasMap ? "简单模式" : "困难模式";
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
      setShareMessage("");
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
    if (!challengeCode.trim()) {
      setError("请先输入挑战码，或点击左侧按钮生成一个新挑战。");
      return;
    }
    const identity = decodeChallenge(challengeCode);
    if (!identity) {
      setError("这个挑战码无法识别，请检查是否完整复制。 ");
      return;
    }
    openChallenge(identity);
  }

  function beginChallenge() {
    if (!challenge) return;
    setPath([challenge.startId]);
    setNeighborPage(0);
    setShareMessage("");
    setScreen("playing");
  }

  function chooseNeighbor(edge: Neighbor) {
    if (!challenge || !currentId) return;
    setLastEdge(edge);
    setNeighborPage(0);
    setHoveredPreview(null);
    setFocusedPreview(null);
    setPinnedPreview(null);
    setShareMessage("");
    setPath((previous) => [...previous, edge.id]);
    if (edge.id === challenge.targetId) setScreen("won");
  }

  function undo() {
    if (path.length <= 1) return;
    setPath((previous) => previous.slice(0, -1));
    setLastEdge(null);
    setNeighborPage(0);
    setShareMessage("");
  }

  function changeNeighborPage(direction: -1 | 1) {
    setNeighborPage((previous) => {
      const nextPage = Math.min(Math.max(previous + direction, 0), neighborPageCount - 1);
      return nextPage;
    });
  }

  async function shareChallenge() {
    if (!challenge || !start || !target) return;
    const url = new URL(DEPLOYED_GAME_URL);
    url.searchParams.set("challenge", encodeChallenge(challenge.identity));
    const text = buildChallengeShareText({
      startName: start.name,
      targetName: target.name,
      steps: Math.max(0, path.length - 1),
      won: screen === "won",
      url: url.toString(),
    });
    await navigator.clipboard.writeText(text);
    setShareMessage(screen === "won" ? "通关结果与挑战链接已复制" : "当前进度与挑战链接已复制");
  }

  const distanceTrend = useMemo(() => {
    if (!challenge || path.length < 2) return null;
    const before = challenge.distances[path[path.length - 2]];
    const after = challenge.distances[path[path.length - 1]];
    return after < before ? "更接近目标" : after > before ? "暂时绕远了" : "与目标距离不变";
  }, [challenge, path]);

  if (screen === "home") {
    return (
      <main id="main-content" className="game-shell home-screen">
        <header className="topbar">
          <span className="brand"><i aria-hidden="true">◉</i> PokéPath</span>
          <span className="edition">全国图鉴 · 图谱 01</span>
        </header>
        <div className="home-workspace">
          <section className="home-hero">
            <div className="home-hero__copy">
            <p className="kicker">宝可梦关系探索</p>
            <h1>从一只宝可梦，<br />走到另一只。</h1>
            <p className="lead">从随机起点出发，沿着图鉴描述、生态与属性形成的联系，寻找通往目标的路径。</p>
            <div className="mode-actions" aria-label="选择游戏模式">
              <button className="mode-button mode-button--easy" onClick={() => openChallenge(randomIdentity(createSeed(), "E"))}>
                <span><strong>简单模式</strong><small>显示关系地图</small></span>
                <i aria-hidden="true">E</i>
              </button>
              <button className="mode-button mode-button--hard" onClick={() => openChallenge(randomIdentity(createSeed(), "H"))}>
                <span><strong>困难模式</strong><small>隐藏关系地图</small></span>
                <i aria-hidden="true">H</i>
              </button>
            </div>
            </div>
          </section>
          <section className="code-panel">
            <div>
              <p className="section-number">挑战码</p>
              <h2>复现同一条出发线</h2>
              <p>挑战码会固定随机起点与目标。朋友打开相同链接，就会面对同一局。</p>
            </div>
            <form onSubmit={submitCode}>
              <label htmlFor="challenge-code">输入挑战码</label>
              <div className="code-entry">
                <input id="challenge-code" value={challengeCode} onChange={(event) => setChallengeCode(event.target.value)} placeholder="例如：P1-G6-A2-E-002N9C" />
                <button className="action dark" type="submit">进入挑战</button>
              </div>
              <p className="error-text" aria-live="polite">{error}</p>
            </form>
          </section>
        </div>
        <footer><span>免费、非商业的非官方同人实验</span><span>数据来源 PokéAPI</span></footer>
      </main>
    );
  }

  if (!challenge || !target || !start) return null;

  if (screen === "start") {
    return (
      <main id="main-content" className="game-shell challenge-screen">
        <header className="topbar">
          <button className="brand brand-button" onClick={() => setScreen("home")}>◉ PokéPath</button>
          <span className="edition">{encodeChallenge(challenge.identity)}</span>
        </header>
        <section className="route-preview">
          <div className="route-preview__heading">
            <p className="kicker">本局路线</p>
            <h1>从这里，走到那里。</h1>
          </div>
          <div className="route-pair">
            <article className="route-specimen route-specimen--start">
              <span className="route-label">随机起点</span>
              <PokemonImage pokemon={start} />
              <div><h2>{start.name}</h2><TypeLabels pokemon={start} /><p>{firstDescriptionSentence(start)}</p></div>
            </article>
            <span className="route-arrow" aria-hidden="true">→</span>
            <article className="route-specimen route-specimen--target">
              <span className="route-label">目标</span>
              <PokemonImage pokemon={target} />
              <div><h2>{target.name}</h2><TypeLabels pokemon={target} /><p>{firstDescriptionSentence(target)}</p></div>
            </article>
          </div>
          <div className="route-actions">
            <span><strong>{modeName}</strong> · {hasMap ? "游玩时显示关系地图" : "游玩时不显示关系地图"} · 理论最短路径至少 3 步</span>
            <div className="route-action-buttons">
              <button className="action secondary" type="button" onClick={shareChallenge}>复制挑战链接</button>
              <button className="action secondary" type="button" onClick={() => openChallenge(randomIdentity(createSeed(), challenge.identity.mode))}>随机重选</button>
              <button className="action primary" type="button" onClick={beginChallenge}>从这里出发</button>
            </div>
            <p className="share-feedback" aria-live="polite">{shareMessage}</p>
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
        <span className="step-count">{modeName} · {Math.max(0, path.length - 1)} 步</span>
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

      <div className={"play-workspace " + (hasMap ? "with-map " : "without-map ") + (won ? "is-won" : "")}>
        {hasMap && (
          <aside className="graph-sidebar">
            <PathMap path={path} targetId={target.id} />
          </aside>
        )}
        <div className="play-primary">
          {won ? (
            <section className="result-panel">
              <div className="result-copy">
                <div>
                  <p className="kicker">路径完成</p>
                  <h1>抵达 {target.name}</h1>
                  <p>你用了 {path.length - 1} 步；从所选起点出发的最短路径是 {challenge.distances[path[0]]} 步。</p>
                </div>
                <div className="home-actions">
                  <button className="action primary" onClick={shareChallenge}>复制挑战链接</button>
                  <button className="action secondary" onClick={() => openChallenge(randomIdentity(createSeed(), challenge.identity.mode))}>再来一局</button>
                </div>
              </div>
              <p className="success-text" aria-live="polite">{shareMessage}</p>
            </section>
          ) : (
          <section className="next-section">
            <div className="next-heading">
              <div><p className="section-number">下一步</p><h2>选择一个相似节点</h2></div>
              <div className="next-heading-actions">
                <button className="text-action" type="button" onClick={shareChallenge}>复制挑战链接</button>
                <button className="text-action" onClick={undo} disabled={path.length <= 1}>撤回上一步</button>
              </div>
            </div>
            <p className="share-feedback share-feedback--playing" aria-live="polite">{shareMessage}</p>
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
                        <span className="neighbor-description">{cardDescriptionSentence(item)}</span>
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
        </div>
      </div>
    </main>
  );
}

export default App;
