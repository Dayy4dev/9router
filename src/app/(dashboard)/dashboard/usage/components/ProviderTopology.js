"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import {
  ReactFlow,
  Handle,
  Position,
  Controls,
  BaseEdge,
  getBezierPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc, markProviderIconMissing } from "@/shared/utils/providerIcon";
import { isCustomLogo } from "@/shared/utils/providerLogo";
import useThemeStore from "@/store/themeStore";
import { isTopologyBg } from "@/shared/utils/topologyBackground";

// Force-stop FE animation if a provider stays active longer than this
const FE_ACTIVE_TIMEOUT_MS = 60000;
const FE_ACTIVE_TICK_MS = 1000;

// Kame + electric particles along active edges
const KAME_PARTICLE_COUNT = 6;
const SPARK_COUNT = 5;

function getProviderConfig(providerId) {
  return AI_PROVIDERS[providerId] || { color: "#6b7280", name: providerId };
}

function getProviderImageUrl(providerId) {
  return getProviderIconSrc(providerId);
}

// Custom provider node - rectangle with image + name
function ProviderNode({ data }) {
  const { label, color, imageUrl, textIcon, active } = data;
  const [imgError, setImgError] = useState(false);
  const activeColor = "var(--color-primary, #10B981)";
  return (
    <div
      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border-2 transition-all duration-300 bg-surface/50 hover:bg-surface/75 backdrop-blur-md"
      style={{
        borderColor: active ? activeColor : "color-mix(in srgb, var(--color-border) 60%, transparent)",
        boxShadow: active
          ? `0 0 18px color-mix(in srgb, var(--color-primary, #10B981) 45%, transparent), inset 0 0 12px color-mix(in srgb, var(--color-primary, #10B981) 15%, transparent)`
          : "0 4px 14px -2px rgba(0, 0, 0, 0.25), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)",
        minWidth: "145px",
      }}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

      {/* Provider icon */}
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors"
        style={{
          backgroundColor: active
            ? "color-mix(in srgb, var(--color-primary, #10B981) 18%, transparent)"
            : `${color}15`,
        }}
      >
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={label}
            className="w-6 h-6 rounded-sm object-contain"
            loading="lazy"
            decoding="async"
            onError={() => {
              const m = imageUrl?.match(/^\/providers\/([^/]+)\.png$/i);
              if (m) markProviderIconMissing(m[1]);
              setImgError(true);
            }}
          />
        ) : (
          <span className="text-sm font-bold" style={{ color: active ? activeColor : color }}>
            {textIcon}
          </span>
        )}
      </div>

      {/* Provider name */}
      <span
        className="text-base font-medium truncate transition-colors"
        style={{ color: active ? "#ffffff" : "var(--color-text)" }}
      >
        {label}
      </span>

      {/* Active indicator */}
      {active && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: activeColor }}
          />
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ backgroundColor: activeColor }}
          />
        </span>
      )}
    </div>
  );
}

ProviderNode.propTypes = {
  data: PropTypes.object.isRequired,
};

// Center 9Router node - pulse/glow on card only (no expanding rings)
function RouterNode({ data }) {
  const powering = (data.activeCount || 0) > 0;
  return (
    <div
      className={`relative z-[1] flex items-center justify-center px-5 py-3 rounded-xl border-2 min-w-[130px] transition-all duration-300 backdrop-blur-md ${
        powering
          ? "topology-router-core border-primary bg-gradient-to-br from-primary/35 via-surface/60 to-primary/15 shadow-[0_0_24px_-2px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]"
          : "border-primary/50 bg-surface/40 hover:bg-surface/70 shadow-[var(--shadow-elev)]"
      }`}
    >
      <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

      {/* Dynamic 9Router Theme Icon */}
      <svg
        viewBox="0 0 32 32"
        className={`w-6 h-6 mr-2 shrink-0 rounded-md overflow-hidden ${powering ? "topology-router-icon" : ""}`}
        aria-label="9Router"
      >
        <defs>
          <linearGradient id="router-node-icon-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--color-primary, #f97815)" />
            <stop offset="1" stopColor="color-mix(in srgb, var(--color-primary, #c2590a) 70%, #000000)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="6" fill="url(#router-node-icon-grad)" />
        <text
          x="16"
          y="23"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize="19"
          fontWeight="800"
          fill="#ffffff"
          textAnchor="middle"
        >
          9
        </text>
      </svg>
      <span className={`text-sm font-bold ${powering ? "topology-router-label text-primary" : "text-primary"}`}>
        9Router
      </span>
      {data.activeCount > 0 && (
        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-primary text-white text-xs font-bold topology-router-badge">
          {data.activeCount}
        </span>
      )}
    </div>
  );
}

RouterNode.propTypes = {
  data: PropTypes.object.isRequired,
};

// Active: electric kame beam (multi-layer stroke + sparks). Idle/last/error: solid BaseEdge.
function TopologyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const active = !!data?.active;
  const stroke = style.stroke || "var(--color-border)";
  const filterId = `topo-electric-${id}`;

  if (!active) {
    return <BaseEdge id={id} path={edgePath} style={{ ...style, stroke }} />;
  }

  return (
    <g className="topology-edge-electric">
      <defs>
        <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="2" result="noise">
            <animate attributeName="baseFrequency" values="0.8;1.4;0.8" dur="0.25s" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      {/* Outer electric halo */}
      <path
        d={edgePath}
        fill="none"
        style={{ stroke: "var(--color-primary, #22d3ee)" }}
        strokeWidth={10}
        strokeOpacity={0.4}
        strokeLinecap="round"
        filter={`url(#${filterId})`}
        className="topology-edge-halo"
      />
      {/* Mid plasma */}
      <path
        d={edgePath}
        fill="none"
        style={{ stroke: "color-mix(in srgb, var(--color-primary, #4ade80) 75%, #ffffff)" }}
        strokeWidth={5}
        strokeOpacity={0.85}
        strokeLinecap="round"
        filter={`url(#${filterId})`}
        className="topology-edge-plasma"
      />
      {/* Hot white core */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: "#ffffff", strokeWidth: 2.2, opacity: 1 }}
        className="topology-edge-kame"
      />
      {/* Energy orbs */}
      {Array.from({ length: KAME_PARTICLE_COUNT }, (_, i) => (
        <circle
          key={`${id}-p-${i}`}
          r={i % 2 === 0 ? 4 : 2.5}
          style={{
            fill: i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? "var(--color-primary, #67e8f9)" : "color-mix(in srgb, var(--color-primary, #fde047) 50%, #ffffff)",
            filter: "drop-shadow(0 0 5px var(--color-primary, #22d3ee))",
          }}
          opacity={0.95}
        >
          <animateMotion
            dur={`${0.4 + i * 0.08}s`}
            repeatCount="indefinite"
            path={edgePath}
            begin={`${i * 0.09}s`}
          />
        </circle>
      ))}
      {/* Electric sparks (short-lived blink along path) */}
      {Array.from({ length: SPARK_COUNT }, (_, i) => (
        <circle
          key={`${id}-s-${i}`}
          r={1.8}
          style={{ fill: "color-mix(in srgb, var(--color-primary, #e0f2fe) 40%, #ffffff)" }}
          opacity={0}
        >
          <animate
            attributeName="opacity"
            values="0;1;0;0;1;0"
            dur={`${0.35 + (i % 3) * 0.1}s`}
            begin={`${i * 0.07}s`}
            repeatCount="indefinite"
          />
          <animateMotion
            dur={`${0.28 + i * 0.05}s`}
            repeatCount="indefinite"
            path={edgePath}
            begin={`${i * 0.11}s`}
          />
        </circle>
      ))}
    </g>
  );
}

TopologyEdge.propTypes = {
  id: PropTypes.string,
  sourceX: PropTypes.number,
  sourceY: PropTypes.number,
  targetX: PropTypes.number,
  targetY: PropTypes.number,
  sourcePosition: PropTypes.string,
  targetPosition: PropTypes.string,
  style: PropTypes.object,
  data: PropTypes.object,
};

const nodeTypes = { provider: ProviderNode, router: RouterNode };
const edgeTypes = { topology: TopologyEdge };

// Place N nodes evenly along an ellipse around the router center.
function buildLayout(providers, activeSet, lastSet, errorSet) {
  const nodeW = 180;
  const nodeH = 30;
  const routerW = 120;
  const routerH = 44;
  const nodeGap = 24;

  const count = providers.length;

  // Compute rx so arc spacing between nodes >= nodeW + nodeGap
  const minRx = ((nodeW + nodeGap) * count) / (2 * Math.PI);
  const rx = Math.max(320, minRx);
  const ry = Math.max(200, rx * 0.55); // ellipse ratio ~0.55
  if (count === 0) {
    return {
      nodes: [{ id: "router", type: "router", position: { x: 0, y: 0 }, data: { activeCount: 0 }, draggable: false }],
      edges: [],
    };
  }

  const nodes = [];
  const edges = [];

  nodes.push({
    id: "router",
    type: "router",
    position: { x: -routerW / 2, y: -routerH / 2 },
    data: { activeCount: activeSet.size },
    draggable: false,
  });

  const edgeStyle = (active, last, error) => {
    if (error) return { stroke: "#ef4444", strokeWidth: 2.5, opacity: 0.9 };
    if (active) return { stroke: "#22d3ee", strokeWidth: 3.5, opacity: 1 };
    if (last) return { stroke: "var(--color-primary, #f59e0b)", strokeWidth: 2, opacity: 0.85 };
    return { stroke: "var(--color-border)", strokeWidth: 1, opacity: 0.3 };
  };

  providers.forEach((p, i) => {
    const config = getProviderConfig(p.provider);
    const active = activeSet.has(p.provider?.toLowerCase());
    const last = !active && lastSet.has(p.provider?.toLowerCase());
    const error = !active && errorSet.has(p.provider?.toLowerCase());
    const nodeId = `provider-${p.provider}`;
    const data = {
      label: (config.name !== p.provider ? config.name : null) || p.nodeName || p.name || p.provider,
      color: config.color || "#6b7280",
      imageUrl: isCustomLogo(p.nodeLogo) || getProviderImageUrl(p.provider),
      textIcon: config.textIcon || (p.provider || "?").slice(0, 2).toUpperCase(),
      active,
    };

    // Distribute evenly starting from top (−π/2), clockwise
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    const cx = rx * Math.cos(angle);
    const cy = ry * Math.sin(angle);

    // Pick router handle closest to the node direction
    let sourceHandle, targetHandle;
    if (Math.abs(angle + Math.PI / 2) < Math.PI / 4 || Math.abs(angle - 3 * Math.PI / 2) < Math.PI / 4) {
      sourceHandle = "top"; targetHandle = "bottom";
    } else if (Math.abs(angle - Math.PI / 2) < Math.PI / 4) {
      sourceHandle = "bottom"; targetHandle = "top";
    } else if (cx > 0) {
      sourceHandle = "right"; targetHandle = "left";
    } else {
      sourceHandle = "left"; targetHandle = "right";
    }

    nodes.push({
      id: nodeId,
      type: "provider",
      position: { x: cx - nodeW / 2, y: cy - nodeH / 2 },
      data,
      draggable: false,
    });

    edges.push({
      id: `e-${nodeId}`,
      type: "topology",
      source: "router",
      sourceHandle,
      target: nodeId,
      targetHandle,
      // Built-in animated uses stroke-dasharray (CPU-heavy); use particle beam instead
      animated: false,
      data: { active },
      style: edgeStyle(active, last, error),
    });
  });

  return { nodes, edges };
}

export default function ProviderTopology({ providers = [], activeRequests = [], lastProvider = "", errorProvider = "" }) {
  // Serialize to stable string keys so useMemo only re-runs when values actually change
  const activeKey = useMemo(
    () => activeRequests.map((r) => r.provider?.toLowerCase()).filter(Boolean).sort().join(","),
    [activeRequests]
  );
  const lastKey = lastProvider?.toLowerCase() || "";
  const errorKey = errorProvider?.toLowerCase() || "";

  const rawActiveSet = useMemo(() => new Set(activeKey ? activeKey.split(",") : []), [activeKey]);
  const lastSet = useMemo(() => new Set(lastKey ? [lastKey] : []), [lastKey]);
  const errorSet = useMemo(() => new Set(errorKey ? [errorKey] : []), [errorKey]);

  // Track firstSeen per active provider; drop provider if running too long (BE stuck)
  const firstSeenRef = useRef({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const seen = firstSeenRef.current;
    const now = Date.now();
    for (const p of rawActiveSet) {
      if (!seen[p]) seen[p] = now;
    }
    for (const p of Object.keys(seen)) {
      if (!rawActiveSet.has(p)) delete seen[p];
    }
  }, [rawActiveSet]);

  useEffect(() => {
    if (rawActiveSet.size === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), FE_ACTIVE_TICK_MS);
    return () => clearInterval(id);
  }, [rawActiveSet]);

  const activeSet = useMemo(() => {
    const now = Date.now();
    const filtered = new Set();
    for (const p of rawActiveSet) {
      const ts = firstSeenRef.current[p];
      if (!ts || now - ts < FE_ACTIVE_TIMEOUT_MS) filtered.add(p);
    }
    return filtered;
  }, [rawActiveSet, tick]);

  const { nodes, edges } = useMemo(
    () => buildLayout(providers, activeSet, lastSet, errorSet),
    [providers, activeSet, lastSet, errorSet]
  );

  // Stable key - only remount when provider list changes
  const providersKey = useMemo(
    () => providers.map((p) => p.provider).sort().join(","),
    [providers]
  );

  const topologyBg = useThemeStore((state) => state.topologyBg);
  const topologyBgDim = useThemeStore((state) => state.topologyBgDim);
  const validatedBg = useMemo(() => isTopologyBg(topologyBg), [topologyBg]);
  // Normalise dim value: boolean true maps to 60%, numbers map 0-100 to 0.0-1.0
  const dimOpacity = useMemo(() => {
    if (typeof topologyBgDim === "boolean") return topologyBgDim ? 0.6 : 0;
    const n = Number(topologyBgDim);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(1, Math.max(0, n / 100));
  }, [topologyBgDim]);

  const rfInstance = useRef(null);
  const containerRef = useRef(null);
  const fitOpts = { padding: 0.2, duration: 200 };
  const onInit = useCallback((instance) => {
    rfInstance.current = instance;
    setTimeout(() => instance.fitView(fitOpts), 50);
  }, []);

  // Re-fit on container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (rfInstance.current) rfInstance.current.fitView(fitOpts);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fit when node count/layout changes
  useEffect(() => {
    if (rfInstance.current) {
      const id = setTimeout(() => rfInstance.current.fitView(fitOpts), 50);
      return () => clearTimeout(id);
    }
  }, [nodes.length]);

  return (
    <div
      ref={containerRef}
      className="relative h-[320px] w-full min-w-0 overflow-hidden rounded-[var(--r-card)] border border-border-subtle bg-surface shadow-[var(--elev-1)] sm:h-[420px]"
    >
      {/* Custom backdrop behind nodes/edges. Kept in a separate layer so it
          never re-renders ReactFlow and does not stretch the image. */}
      {validatedBg && (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-opacity duration-300"
            style={{ backgroundImage: `url("${validatedBg.replace(/"/g, "")}")` }}
            aria-hidden="true"
          />
          {dimOpacity > 0 && (
            <div
              className="pointer-events-none absolute inset-0 z-0 bg-black transition-opacity duration-150"
              style={{ opacity: dimOpacity }}
              aria-hidden="true"
            />
          )}
        </>
      )}

      {providers.length === 0 ? (
        <div className="relative z-[1] h-full flex items-center justify-center text-text-muted text-sm">
          No providers connected
        </div>
      ) : (
        <ReactFlow
          key={providersKey}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={fitOpts}
          minZoom={0.1}
          maxZoom={2}
          onInit={onInit}
          proOptions={{ hideAttribution: true }}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick
          preventScrolling={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Controls showInteractive={false} className="react-flow-controls-custom" />
        </ReactFlow>
      )}
    </div>
  );
}

ProviderTopology.propTypes = {
  providers: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    provider: PropTypes.string,
    name: PropTypes.string,
  })),
  activeRequests: PropTypes.arrayOf(PropTypes.shape({
    provider: PropTypes.string,
    model: PropTypes.string,
    account: PropTypes.string,
  })),
  lastProvider: PropTypes.string,
  errorProvider: PropTypes.string,
};
