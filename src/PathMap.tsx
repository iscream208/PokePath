import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { graphLayout, neighbors, pokemon, pokemonById } from "./game/data";

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 620;
const MAP_PADDING = 46;
const MIN_VIEW_WIDTH = 220;

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PathMapProps {
  path: number[];
  revealGraph: boolean;
  compact?: boolean;
}

function pointFor(id: number) {
  const position = graphLayout.positions[String(id)] ?? [0.5, 0.5];
  return {
    x: MAP_PADDING + position[0] * (MAP_WIDTH - MAP_PADDING * 2),
    y: MAP_PADDING + (1 - position[1]) * (MAP_HEIGHT - MAP_PADDING * 2),
  };
}

const contextEdges = (() => {
  const seen = new Set<string>();
  const edges: Array<{ from: number; to: number }> = [];
  for (const item of pokemon) {
    for (const neighbor of (neighbors[String(item.id)] ?? []).slice(0, 3)) {
      const key = item.id < neighbor.id
        ? item.id + ":" + neighbor.id
        : neighbor.id + ":" + item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: item.id, to: neighbor.id });
    }
  }
  return edges;
})();

const initialView: ViewBox = { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };

function fitPath(points: Array<{ x: number; y: number }>): ViewBox {
  if (!points.length) return initialView;
  const minimumX = Math.min(...points.map((point) => point.x));
  const maximumX = Math.max(...points.map((point) => point.x));
  const minimumY = Math.min(...points.map((point) => point.y));
  const maximumY = Math.max(...points.map((point) => point.y));
  const width = Math.min(
    MAP_WIDTH,
    Math.max(360, maximumX - minimumX + 180, (maximumY - minimumY + 100) * 4.5),
  );
  const height = width / 4.5;
  const centerX = (minimumX + maximumX) / 2;
  const centerY = (minimumY + maximumY) / 2;
  return {
    x: Math.max(0, Math.min(MAP_WIDTH - width, centerX - width / 2)),
    y: Math.max(0, Math.min(MAP_HEIGHT - height, centerY - height / 2)),
    width,
    height,
  };
}

export default function PathMap({ path, revealGraph, compact = false }: PathMapProps) {
  const [viewBox, setViewBox] = useState<ViewBox>(initialView);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; viewBox: ViewBox } | null>(null);
  const pathPoints = useMemo(() => path.map(pointFor), [path]);
  const hoveredPokemon = hoveredId ? pokemonById.get(hoveredId) : null;
  const mode = revealGraph ? "full" : "live";

  useEffect(() => {
    if (compact) setViewBox(fitPath(pathPoints));
  }, [compact, pathPoints]);

  function zoom(
    factor: number,
    centerX = viewBox.x + viewBox.width / 2,
    centerY = viewBox.y + viewBox.height / 2,
  ) {
    setViewBox((current) => {
      const width = Math.min(MAP_WIDTH, Math.max(MIN_VIEW_WIDTH, current.width * factor));
      const height = width * MAP_HEIGHT / MAP_WIDTH;
      const ratioX = (centerX - current.x) / current.width;
      const ratioY = (centerY - current.y) / current.height;
      return {
        x: Math.max(0, Math.min(MAP_WIDTH - width, centerX - width * ratioX)),
        y: Math.max(0, Math.min(MAP_HEIGHT - height, centerY - height * ratioY)),
        width,
        height,
      };
    });
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const centerX = viewBox.x + ((event.clientX - bounds.left) / bounds.width) * viewBox.width;
    const centerY = viewBox.y + ((event.clientY - bounds.top) / bounds.height) * viewBox.height;
    zoom(event.deltaY > 0 ? 1.14 : 0.86, centerX, centerY);
  }

  function beginDrag(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, viewBox };
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - drag.current.x) / bounds.width * drag.current.viewBox.width;
    const dy = (event.clientY - drag.current.y) / bounds.height * drag.current.viewBox.height;
    setViewBox({
      ...drag.current.viewBox,
      x: Math.max(
        0,
        Math.min(MAP_WIDTH - drag.current.viewBox.width, drag.current.viewBox.x - dx),
      ),
      y: Math.max(
        0,
        Math.min(MAP_HEIGHT - drag.current.viewBox.height, drag.current.viewBox.y - dy),
      ),
    });
  }

  return (
    <section
      className={["path-map", compact ? "path-map--compact" : "path-map--complete"].join(" ")}
      aria-label={revealGraph ? "通关后的完整关系图与本次路径" : "当前已选路径"}
    >
      <header className="path-map__header">
        <div>
          <span>{revealGraph ? "图谱展开" : "行进轨迹"}</span>
          <strong>{revealGraph ? "本次路径在关系图中的位置" : "只显示已经选择的路径"}</strong>
        </div>
        <div className="path-map__controls" aria-label="地图缩放">
          <button type="button" onClick={() => zoom(0.8)} aria-label="放大地图">＋</button>
          <button type="button" onClick={() => zoom(1.25)} aria-label="缩小地图">−</button>
          <button type="button" onClick={() => setViewBox(initialView)}>全局</button>
        </div>
      </header>
      <div className="path-map__field">
        <svg
          viewBox={[viewBox.x, viewBox.y, viewBox.width, viewBox.height].join(" ")}
          role="img"
          aria-label={
            revealGraph
              ? "完整图谱中的 " + path.length + " 个路径节点"
              : path.length + " 个已选路径节点"
          }
          onWheel={handleWheel}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        >
          <defs>
            <pattern
              id={"map-grid-" + mode}
              width="50"
              height="50"
              patternUnits="userSpaceOnUse"
            >
              <path d="M 50 0 L 0 0 0 50" className="map-grid-line" />
            </pattern>
            {path.map((id, index) => (
              <clipPath id={"path-node-" + mode + "-" + index} key={id + "-" + index + "-clip"}>
                <circle
                  cx={pathPoints[index].x}
                  cy={pathPoints[index].y}
                  r={index === path.length - 1 ? 24 : 19}
                />
              </clipPath>
            ))}
          </defs>
          <rect width={MAP_WIDTH} height={MAP_HEIGHT} className="map-paper" />
          <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill={"url(#map-grid-" + mode + ")"} />
          {revealGraph && (
            <g className="map-context-edges" aria-hidden="true">
              {contextEdges.map((edge) => {
                const from = pointFor(edge.from);
                const to = pointFor(edge.to);
                return (
                  <line
                    key={edge.from + "-" + edge.to}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                  />
                );
              })}
            </g>
          )}
          {revealGraph && (
            <g className="map-context-nodes">
              {pokemon.map((item) => {
                const point = pointFor(item.id);
                return (
                  <circle
                    className="map-context-node"
                    key={item.id}
                    cx={point.x}
                    cy={point.y}
                    r="3.2"
                    aria-label={item.name}
                    onPointerEnter={() => setHoveredId(item.id)}
                    onPointerLeave={() => setHoveredId(null)}
                  />
                );
              })}
            </g>
          )}
          <g className="map-path-lines" aria-hidden="true">
            {pathPoints.slice(1).map((point, index) => (
              <line
                key={path[index] + "-" + path[index + 1] + "-" + index}
                x1={pathPoints[index].x}
                y1={pathPoints[index].y}
                x2={point.x}
                y2={point.y}
              />
            ))}
          </g>
          <g className="map-path-nodes">
            {path.map((id, index) => {
              const item = pokemonById.get(id)!;
              const point = pathPoints[index];
              const current = index === path.length - 1;
              const radius = current ? 24 : 19;
              return (
                <g
                  className={current ? "map-path-node is-current" : "map-path-node"}
                  key={id + "-" + index}
                  tabIndex={0}
                  aria-label={"第 " + (index + 1) + " 个节点：" + item.name}
                >
                  <circle cx={point.x} cy={point.y} r={radius + 5} />
                  <image
                    href={item.image}
                    x={point.x - radius}
                    y={point.y - radius}
                    width={radius * 2}
                    height={radius * 2}
                    preserveAspectRatio="xMidYMid meet"
                    clipPath={"url(#path-node-" + mode + "-" + index + ")"}
                  />
                  <text x={point.x + radius + 8} y={point.y - 5}>
                    {String(index + 1).padStart(2, "0")}
                  </text>
                  <text
                    className="map-node-name"
                    x={point.x + radius + 8}
                    y={point.y + 13}
                  >
                    {item.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {hoveredPokemon && revealGraph && (
          <div className="path-map__inspector">
            <img src={hoveredPokemon.image} alt="" />
            <span>
              <small>NO. {String(hoveredPokemon.id).padStart(4, "0")}</small>
              <strong>{hoveredPokemon.name}</strong>
            </span>
          </div>
        )}
        {!revealGraph && <p className="path-map__fog-note">未探索的节点与目标位置暂不显示</p>}
      </div>
    </section>
  );
}
