import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useRef } from "react";
import { graphLayout, neighbors, pokemon } from "./game/data";

interface PathMapProps {
  path: number[];
  targetId: number;
}

interface MapNode extends SimulationNodeDatum {
  id: number;
  anchorX: number;
  anchorY: number;
  phase: number;
}

interface MapLink extends SimulationLinkDatum<MapNode> {
  source: number | MapNode;
  target: number | MapNode;
}

const nodes: MapNode[] = pokemon.map((item) => {
  const [x, y] = graphLayout.positions[String(item.id)] ?? [0.5, 0.5];
  return {
    id: item.id,
    x,
    y: 1 - y,
    anchorX: x,
    anchorY: 1 - y,
    phase: (item.id * 2.399963229728653) % (Math.PI * 2),
  };
});

const nodeById = new Map(nodes.map((node) => [node.id, node]));
const allLinks: MapLink[] = pokemon.flatMap((item) =>
  (neighbors[String(item.id)] ?? []).map((neighbor) => ({
    source: item.id,
    target: neighbor.id,
  })),
);
const forceLinks: MapLink[] = pokemon.flatMap((item) =>
  (neighbors[String(item.id)] ?? []).slice(0, 4).map((neighbor) => ({
    source: item.id,
    target: neighbor.id,
  })),
);

function prepareBalancedLayout() {
  const simulation = forceSimulation(nodes)
    .randomSource(() => 0.5)
    .alpha(1)
    .alphaDecay(0.035)
    .velocityDecay(0.38)
    .force("charge", forceManyBody().strength(-0.0045).distanceMax(0.085))
    .force("collision", forceCollide<MapNode>(0.009).strength(0.92).iterations(2))
    .force(
      "links",
      forceLink<MapNode, MapLink>(forceLinks)
        .id((node) => node.id)
        .distance(0.032)
        .strength(0.055),
    )
    .force("x", forceX<MapNode>((node) => node.anchorX).strength(0.17))
    .force("y", forceY<MapNode>((node) => node.anchorY).strength(0.17))
    .force("center", forceCenter(0.5, 0.5))
    .stop();

  for (let index = 0; index < 140; index += 1) simulation.tick();
  for (const node of nodes) {
    node.x = Math.min(0.985, Math.max(0.015, node.x ?? node.anchorX));
    node.y = Math.min(0.985, Math.max(0.015, node.y ?? node.anchorY));
    node.vx = 0;
    node.vy = 0;
  }
}

prepareBalancedLayout();

function resolveNode(value: number | MapNode): MapNode {
  return typeof value === "number" ? nodeById.get(value)! : value;
}

function dot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: string,
  stroke?: string,
) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.lineWidth = 2;
    context.strokeStyle = stroke;
    context.stroke();
  }
}

export default function PathMap({ path, targetId }: PathMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathRef = useRef(path);
  const targetRef = useRef(targetId);
  const pulseRef = useRef({ nodeId: path.at(-1), startedAt: performance.now() });
  const previousCurrentRef = useRef(path.at(-1));
  pathRef.current = path;
  targetRef.current = targetId;

  useEffect(() => {
    const currentId = path.at(-1);
    if (!currentId || currentId === previousCurrentRef.current) return;
    previousCurrentRef.current = currentId;
    pulseRef.current = { nodeId: currentId, startedAt: performance.now() };
  }, [path]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasElement = canvas;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let lastDraw = -Infinity;
    let resizeObserver: ResizeObserver | null = null;

    function draw(time = 0) {
      const bounds = canvasElement.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      if (canvasElement.width !== Math.round(width * ratio)) {
        canvasElement.width = Math.round(width * ratio);
        canvasElement.height = Math.round(height * ratio);
      }
      const context = canvasElement.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const padding = Math.max(8, Math.min(width, height) * 0.035);
      const plotWidth = width - padding * 2;
      const plotHeight = height - padding * 2;
      const tremorX = reduceMotion ? 0 : 1.55 / Math.max(plotWidth, 1);
      const tremorY = reduceMotion ? 0 : 1.35 / Math.max(plotHeight, 1);
      const seconds = time / 1000;
      const pulse = pulseRef.current;
      const pulseOrigin = pulse.nodeId ? nodeById.get(pulse.nodeId) : undefined;
      const pulseAge = Math.max(0, time - pulse.startedAt);
      const pulseProgress = reduceMotion ? 1 : Math.min(1, pulseAge / 1850);
      const pulseRadius = pulseProgress * 0.42;
      const pulseEnvelope = Math.sin(pulseProgress * Math.PI) * (1 - pulseProgress * 0.38);
      const projectedPoints = new Map<number, { x: number; y: number }>();
      const project = (node: MapNode) => {
        const cached = projectedPoints.get(node.id);
        if (cached) return cached;

        const trembleX = (
          Math.sin(seconds * 1.7 + node.phase)
          + Math.sin(seconds * 3.8 + node.phase * 1.71) * 0.36
        ) * tremorX;
        const trembleY = (
          Math.cos(seconds * 1.45 + node.phase * 1.13)
          + Math.sin(seconds * 3.15 + node.phase * 0.83) * 0.34
        ) * tremorY;

        let waveX = 0;
        let waveY = 0;
        if (pulseOrigin && pulseProgress < 1) {
          const dx = (node.x ?? node.anchorX) - (pulseOrigin.x ?? pulseOrigin.anchorX);
          const dy = (node.y ?? node.anchorY) - (pulseOrigin.y ?? pulseOrigin.anchorY);
          const distance = Math.hypot(dx, dy);
          const shell = Math.exp(-Math.pow((distance - pulseRadius) / 0.065, 2));
          const directionX = distance > 0.0001 ? dx / distance : Math.cos(node.phase);
          const directionY = distance > 0.0001 ? dy / distance : Math.sin(node.phase);
          const displacement = shell * pulseEnvelope * 0.018;
          waveX = directionX * displacement;
          waveY = directionY * displacement;
        }

        const point = {
          x: padding + ((node.x ?? node.anchorX) + trembleX + waveX) * plotWidth,
          y: padding + ((node.y ?? node.anchorY) + trembleY + waveY) * plotHeight,
        };
        projectedPoints.set(node.id, point);
        return point;
      };

      context.beginPath();
      for (const link of allLinks) {
        const from = project(resolveNode(link.source));
        const to = project(resolveNode(link.target));
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
      }
      context.strokeStyle = "rgba(74, 77, 69, 0.035)";
      context.lineWidth = 0.38;
      context.stroke();

      const activePath = pathRef.current;
      if (activePath.length > 1) {
        context.beginPath();
        activePath.forEach((id, index) => {
          const point = project(nodeById.get(id)!);
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.strokeStyle = "rgba(104, 171, 205, 0.84)";
        context.lineWidth = 2.4;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.stroke();
      }

      const baseRadius = Math.max(0.62, Math.min(1, width / 240));
      for (const node of nodes) {
        const point = project(node);
        dot(context, point.x, point.y, baseRadius, "rgba(105, 107, 100, 0.66)");
      }

      for (const id of activePath.slice(0, -1)) {
        const point = project(nodeById.get(id)!);
        dot(context, point.x, point.y, 3.1, "#8fc8e3", "#f3f0df");
      }

      const target = project(nodeById.get(targetRef.current)!);
      dot(context, target.x, target.y, 4.2, "#c84b45", "#f3f0df");

      const currentId = activePath.at(-1);
      if (currentId) {
        const current = project(nodeById.get(currentId)!);
        if (currentId === targetRef.current) {
          dot(context, current.x, current.y, 6.3, "transparent", "#2f72b7");
        } else {
          dot(context, current.x, current.y, 4.6, "#2f72b7", "#f3f0df");
        }

      }
    }

    function animate(time: number) {
      if (time - lastDraw >= 40) {
        draw(time);
        lastDraw = time;
      }
      frame = window.requestAnimationFrame(animate);
    }

    if (reduceMotion) {
      draw();
      resizeObserver = new ResizeObserver(() => draw());
      resizeObserver.observe(canvasElement);
    } else {
      frame = window.requestAnimationFrame(animate);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, []);

  const currentId = path.at(-1);
  return (
    <section className="path-map" aria-label="完整宝可梦关系图">
      <header className="path-map__header">
        <span>弹性关系图</span>
        <strong>{nodes.length} 节点 · {allLinks.length} 连接</strong>
      </header>
      <div className="path-map__field">
        <canvas
          ref={canvasRef}
          className="path-map__canvas"
          role="img"
          aria-label="灰色为未选择，浅蓝为已走路径，蓝色为当前宝可梦，红色为目标宝可梦"
          data-node-count={nodes.length}
          data-edge-count={allLinks.length}
          data-current-id={currentId}
          data-target-id={targetId}
          data-visited-count={Math.max(0, path.length - 1)}
          data-layout="anchored-force"
          data-motion={window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "elastic"}
          data-pulse-node={currentId}
        />
      </div>
      <div className="path-map__legend" aria-label="地图图例">
        <span><i className="legend-dot legend-dot--target" />目标</span>
        <span><i className="legend-dot legend-dot--current" />当前</span>
        <span><i className="legend-dot legend-dot--visited" />已走</span>
        <span><i className="legend-dot legend-dot--idle" />其他</span>
      </div>
    </section>
  );
}
