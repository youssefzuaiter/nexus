"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GraphNode, GraphEdge } from "@/repositories/link-repository";

const WIDTH = 900;
const HEIGHT = 560;
const ITERATIONS = 300;
const REPULSION = 14000;
const SPRING_LENGTH = 110;
const SPRING_STRENGTH = 0.02;
const CENTER_STRENGTH = 0.008;
const DAMPING = 0.85;

type Point = { x: number; y: number };

/**
 * A minimal force-directed layout, run once to a resting position rather than
 * animated every frame — a personal note graph is small enough (tens to a few
 * hundred nodes) that O(n²) repulsion over a couple hundred iterations settles
 * instantly, so there is no need for a physics library or a continuous
 * simulation loop.
 */
function computeLayout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, Point> {
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const radius = Math.min(WIDTH, HEIGHT) / 3;

  const state = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  nodes.forEach((node, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
    state.set(node.id, {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    });
  });

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = state.get(nodes[i].id)!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = state.get(nodes[j].id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = Math.max(dx * dx + dy * dy, 1);
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    for (const edge of edges) {
      const a = state.get(edge.source);
      const b = state.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const force = (dist - SPRING_LENGTH) * SPRING_STRENGTH;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (const node of nodes) {
      const p = state.get(node.id)!;
      p.vx = (p.vx + (cx - p.x) * CENTER_STRENGTH) * DAMPING;
      p.vy = (p.vy + (cy - p.y) * CENTER_STRENGTH) * DAMPING;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  const positions = new Map<string, Point>();
  for (const [id, p] of state) positions.set(id, { x: p.x, y: p.y });
  return positions;
}

function NodeDot({
  node,
  pos,
  size,
  dimmed,
  toSvgPoint,
  onMove,
  onOpen,
}: {
  node: GraphNode;
  pos: Point;
  size: number;
  dimmed: boolean;
  toSvgPoint: (e: React.PointerEvent) => Point;
  onMove: (id: string, point: Point) => void;
  onOpen: (id: string) => void;
}) {
  const dragRef = useRef<{ moved: boolean } | null>(null);

  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      className="cursor-pointer"
      opacity={dimmed ? 0.35 : 1}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { moved: false };
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return;
        dragRef.current.moved = true;
        onMove(node.id, toSvgPoint(e));
      }}
      onPointerUp={() => {
        const wasDrag = dragRef.current?.moved ?? false;
        dragRef.current = null;
        if (!wasDrag) onOpen(node.id);
      }}
    >
      <circle r={size} fill="var(--accent)" fillOpacity={0.88} />
      <text
        x={size + 5}
        y={4}
        fontSize={11}
        fill="var(--text-muted)"
        className="select-none"
      >
        {node.title}
      </text>
    </g>
  );
}

export function NoteGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const router = useRouter();
  const initialLayout = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);
  const [positions, setPositions] = useState(initialLayout);
  const [hovered, setHovered] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const degree = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of edges) {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
    }
    return counts;
  }, [edges]);

  const neighbors = useMemo(() => {
    if (!hovered) return null;
    const set = new Set<string>([hovered]);
    for (const edge of edges) {
      if (edge.source === hovered) set.add(edge.target);
      if (edge.target === hovered) set.add(edge.source);
    }
    return set;
  }, [hovered, edges]);

  function toSvgPoint(e: React.PointerEvent): Point {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function handleMove(id: string, point: Point) {
    setPositions((prev) => {
      const next = new Map(prev);
      next.set(id, point);
      return next;
    });
  }

  return (
    <div className="flex-1 overflow-hidden rounded-xl border border-border-subtle bg-surface">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-full w-full touch-none"
        onPointerLeave={() => setHovered(null)}
      >
        <g>
          {edges.map((edge, i) => {
            const a = positions.get(edge.source);
            const b = positions.get(edge.target);
            if (!a || !b) return null;
            const dimmed = neighbors ? !(neighbors.has(edge.source) && neighbors.has(edge.target)) : false;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--border-strong)"
                strokeWidth={1}
                opacity={dimmed ? 0.15 : 0.7}
              />
            );
          })}
        </g>
        <g>
          {nodes.map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const size = 4 + Math.min(degree.get(node.id) ?? 0, 10) * 1.1;
            return (
              <g
                key={node.id}
                onPointerEnter={() => setHovered(node.id)}
              >
                <NodeDot
                  node={node}
                  pos={pos}
                  size={size}
                  dimmed={neighbors ? !neighbors.has(node.id) : false}
                  toSvgPoint={toSvgPoint}
                  onMove={handleMove}
                  onOpen={(id) => router.push(`/notes/${id}`)}
                />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
