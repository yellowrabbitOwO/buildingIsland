import { useId, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { isSwatchRef, swatchIdFromRef } from "../../data/colorResolve";
import type { ChartBranchStyle, ChartDataPoint, ChartSeries, ChartType, NumberLineMode } from "../../data/types";
import { PALETTE, PannableCanvas, DraggableNode, ArrowMarkerDefs, EdgeLabel, NodeShape, branchPath, type ManualPositions } from "../common/GraphPrimitives";
import { useLanguage } from "../../i18n";

export type { ManualPositions };

/** 圖表右下角拖曳縮放把手 */
function ResizeHandle({
  width,
  height,
  onResize,
}: {
  width: number;
  height: number;
  onResize: (size: { width: number; height: number }) => void;
}) {
  const dragState = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const { t } = useLanguage();

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, origW: width, origH: height };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const { startX, startY, origW, origH } = dragState.current;
    onResize({
      width: Math.max(200, Math.round(origW + (e.clientX - startX))),
      height: Math.max(120, Math.round(origH + (e.clientY - startY))),
    });
  };
  const handlePointerUp = () => {
    dragState.current = null;
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      title={t("chartView.resizeTitle")}
      style={{
        position: "absolute",
        right: 2,
        bottom: 2,
        width: 14,
        height: 14,
        cursor: "nwse-resize",
        touchAction: "none",
        borderRight: "2px solid var(--text-faint)",
        borderBottom: "2px solid var(--text-faint)",
        borderRadius: "0 0 4px 0",
      }}
    />
  );
}

interface ChartViewProps {
  chartType: ChartType;
  data: ChartDataPoint[];
  width?: number;
  height?: number;
  maxValue?: number;
  axisMin?: number;
  axisMax?: number;
  yAxisMin?: number;
  yAxisMax?: number;
  numberLineMode?: NumberLineMode;
  backgroundColor?: string;
  branchStyle?: ChartBranchStyle;
  /** 分支型圖表（樹狀圖／心智圖）節點手動位置覆寫；提供 onNodeDrag 時可拖曳節點更新 */
  manualPositions?: ManualPositions;
  onNodeDrag?: (id: string, pos: { x: number; y: number }) => void;
  /** 提供時右下角會顯示拖曳縮放把手 */
  onResize?: (size: { width: number; height: number }) => void;
  /** 折線圖／雷達圖多線模式 */
  series?: ChartSeries[];
  /** 樹狀圖／心智圖：點擊連接線時回報該線（以子節點 id 識別） */
  onEdgeClick?: (childId: string) => void;
  /** 樹狀圖／心智圖：目前選取中的連接線（子節點 id），用於高亮顯示 */
  selectedEdgeId?: string;
}

export default function ChartView({
  chartType,
  data,
  width = 420,
  height = 200,
  maxValue,
  axisMin,
  axisMax,
  yAxisMin,
  yAxisMax,
  numberLineMode,
  backgroundColor,
  branchStyle,
  manualPositions,
  onNodeDrag,
  onResize,
  series,
  onEdgeClick,
  selectedEdgeId,
}: ChartViewProps) {
  const swatches = useLiveQuery(() => db.colorSwatches.toArray(), []);
  const resolveColor = (value?: string): string | undefined => {
    if (!value) return undefined;
    if (isSwatchRef(value)) return swatches?.find((s) => s.id === swatchIdFromRef(value))?.color;
    return value;
  };
  if (data.length === 0) return null;
  const resolvedData = data.map((d) => (d.color ? { ...d, color: resolveColor(d.color) } : d));
  const resolvedBackground = resolveColor(backgroundColor);
  const resolvedSeries = series?.map((s) => (s.color ? { ...s, color: resolveColor(s.color) } : s));
  const wrap = (child: React.ReactNode) => (
    <div
      style={{
        display: "inline-block",
        position: "relative",
        background: resolvedBackground || undefined,
        borderRadius: 6,
        padding: resolvedBackground ? 8 : 0,
      }}
    >
      {child}
      {onResize && <ResizeHandle width={width} height={height} onResize={onResize} />}
    </div>
  );
  if (chartType === "pie") return wrap(<PieChart data={resolvedData} size={height} />);
  if (chartType === "line")
    return wrap(<LineChart data={resolvedData} width={width} height={height} axisMin={axisMin} axisMax={axisMax} series={resolvedSeries} />);
  if (chartType === "radar")
    return wrap(<RadarChart data={resolvedData} size={Math.max(height, 220)} maxValue={maxValue} series={resolvedSeries} />);
  if (chartType === "numberline")
    return wrap(
      numberLineMode === "xy" ? (
        <NumberLineXYChart data={resolvedData} width={width} height={height} axisMin={axisMin} axisMax={axisMax} yAxisMin={yAxisMin} yAxisMax={yAxisMax} />
      ) : (
        <NumberLineXChart data={resolvedData} width={width} height={height} axisMin={axisMin} axisMax={axisMax} />
      )
    );
  if (chartType === "tree")
    return wrap(
      <TreeChart
        data={resolvedData}
        width={width}
        height={height}
        branchStyle={branchStyle ?? "elbow"}
        manualPositions={manualPositions}
        onNodeDrag={onNodeDrag}
        onEdgeClick={onEdgeClick}
        selectedEdgeId={selectedEdgeId}
      />
    );
  if (chartType === "mindmap")
    return wrap(
      <MindmapChart
        data={resolvedData}
        width={width}
        height={height}
        branchStyle={branchStyle ?? "curved"}
        manualPositions={manualPositions}
        onNodeDrag={onNodeDrag}
        onEdgeClick={onEdgeClick}
        selectedEdgeId={selectedEdgeId}
      />
    );
  if (chartType === "fishbone") return wrap(<FishboneChart data={resolvedData} width={width} height={height} />);
  return wrap(<BarChart data={resolvedData} width={width} height={height} axisMin={axisMin} axisMax={axisMax} />);
}

/** 依 parentId 建立節點的子節點索引；找不到對應父節點者視為頂層節點 */
function buildChildMap(data: ChartDataPoint[]) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const d of data) {
    if (d.parentId && byId.has(d.parentId)) {
      if (!children.has(d.parentId)) children.set(d.parentId, []);
      children.get(d.parentId)!.push(d.id);
    } else {
      roots.push(d.id);
    }
  }
  return { byId, children: (id: string) => children.get(id) ?? [], roots };
}

/** 樹狀圖／心智圖共用：畫出一條連接線（含可選箭頭／文字標註／點擊選取），並在旁疊一條加寬的透明線以利點擊 */
function Edge({
  d,
  x1,
  y1,
  x2,
  y2,
  defaultStyle,
  arrowMarkerId,
  onEdgeClick,
  selected,
}: {
  d: ChartDataPoint;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  defaultStyle: ChartBranchStyle;
  arrowMarkerId: string;
  onEdgeClick?: (childId: string) => void;
  selected: boolean;
}) {
  const style = d.edgeStyle ?? defaultStyle;
  const path = branchPath(x1, y1, x2, y2, style);
  const clickable = !!onEdgeClick;
  return (
    <g>
      {clickable && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          style={{ cursor: "pointer" }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onEdgeClick(d.id);
          }}
        />
      )}
      <path
        d={path}
        fill="none"
        stroke={selected ? "var(--accent)" : "var(--border)"}
        strokeWidth={selected ? 2.5 : 1.5}
        markerEnd={d.edgeArrow ? `url(#${arrowMarkerId})` : undefined}
        style={{ pointerEvents: "none" }}
      />
      {d.edgeLabel && <EdgeLabel x1={x1} y1={y1} x2={x2} y2={y2} text={d.edgeLabel} />}
    </g>
  );
}

function TreeChart({
  data,
  width,
  height,
  branchStyle,
  manualPositions,
  onNodeDrag,
  onEdgeClick,
  selectedEdgeId,
}: {
  data: ChartDataPoint[];
  width: number;
  height: number;
  branchStyle: ChartBranchStyle;
  manualPositions?: ManualPositions;
  onNodeDrag?: (id: string, pos: { x: number; y: number }) => void;
  onEdgeClick?: (childId: string) => void;
  selectedEdgeId?: string;
}) {
  const arrowId = useId();
  const { t } = useLanguage();
  const { children, roots } = buildChildMap(data);
  const nodeW = 92;
  const nodeH = 32;
  let leafCounter = 0;
  let maxDepth = 0;
  const pos = new Map<string, { x: number; depth: number }>();

  function visit(id: string, depth: number): number {
    maxDepth = Math.max(maxDepth, depth);
    const kids = children(id);
    if (kids.length === 0) {
      const x = leafCounter++;
      pos.set(id, { x, depth });
      return x;
    }
    const xs = kids.map((k) => visit(k, depth + 1));
    const x = xs.reduce((a, b) => a + b, 0) / xs.length;
    pos.set(id, { x, depth });
    return x;
  }
  roots.forEach((r) => visit(r, 0));

  const leafCount = Math.max(1, leafCounter);
  const xSpacing = Math.max(nodeW + 16, (width - 40) / leafCount);
  const levelHeight = Math.max(nodeH + 32, (height - 40) / Math.max(1, maxDepth + 1));
  const contentWidth = Math.max(width, leafCount * xSpacing + 40);
  const contentHeight = Math.max(height, (maxDepth + 1) * levelHeight + 40);
  const px = (x: number) => 20 + x * xSpacing + xSpacing / 2;
  const py = (depth: number) => 20 + depth * levelHeight + nodeH / 2;

  const effectivePos = (id: string): { x: number; y: number } | undefined => {
    const manual = manualPositions?.[id];
    if (manual) return manual;
    const p = pos.get(id);
    return p ? { x: px(p.x), y: py(p.depth) } : undefined;
  };

  const content = (
    <>
      <ArrowMarkerDefs id={arrowId} />
      {data.map((d) => {
        if (!d.parentId) return null;
        const p = effectivePos(d.parentId);
        const c = effectivePos(d.id);
        if (!p || !c) return null;
        return (
          <Edge
            key={`edge-${d.id}`}
            d={d}
            x1={p.x}
            y1={p.y + nodeH / 2}
            x2={c.x}
            y2={c.y - nodeH / 2}
            defaultStyle={branchStyle}
            arrowMarkerId={arrowId}
            onEdgeClick={onEdgeClick}
            selected={selectedEdgeId === d.id}
          />
        );
      })}
      {data.map((d, i) => {
        const p = effectivePos(d.id);
        if (!p) return null;
        const shape = d.shape ?? "roundedRect";
        return (
          <DraggableNode key={d.id} id={d.id} x={p.x} y={p.y} onDrag={onNodeDrag}>
            <NodeShape shape={shape} x={p.x} y={p.y} w={nodeW} h={nodeH} fill={d.color ?? PALETTE[i % PALETTE.length]} />
            <text x={p.x} y={p.y + 4} fontSize={13} textAnchor="middle" fill="#1a1a1a">
              {d.label.length > 9 ? d.label.slice(0, 9) + "…" : d.label || t("common.unnamed")}
            </text>
          </DraggableNode>
        );
      })}
    </>
  );

  return <PannableCanvas width={width} height={height} contentWidth={contentWidth} contentHeight={contentHeight}>{content}</PannableCanvas>;
}

function MindmapChart({
  data,
  width,
  height,
  branchStyle,
  manualPositions,
  onNodeDrag,
  onEdgeClick,
  selectedEdgeId,
}: {
  data: ChartDataPoint[];
  width: number;
  height: number;
  branchStyle: ChartBranchStyle;
  manualPositions?: ManualPositions;
  onNodeDrag?: (id: string, pos: { x: number; y: number }) => void;
  onEdgeClick?: (childId: string) => void;
  selectedEdgeId?: string;
}) {
  const arrowId = useId();
  const { t } = useLanguage();
  const { children, roots } = buildChildMap(data);
  const size = Math.max(width, height, 320);
  let leafCounter = 0;
  const angleUnit = new Map<string, number>();
  const depthOf = new Map<string, number>();

  function visit(id: string, depth: number): number {
    depthOf.set(id, depth);
    const kids = children(id);
    if (kids.length === 0) {
      const a = leafCounter++;
      angleUnit.set(id, a);
      return a;
    }
    const as = kids.map((k) => visit(k, depth + 1));
    const a = as.reduce((x, y) => x + y, 0) / as.length;
    angleUnit.set(id, a);
    return a;
  }
  roots.forEach((r) => visit(r, 0));

  const leafCount = Math.max(1, leafCounter);
  const maxDepth = Math.max(1, ...Array.from(depthOf.values()));
  const cx = size / 2;
  const cy = size / 2;
  const levelR = (size / 2 - 60) / maxDepth;

  const defaultPosOf = (id: string) => {
    const depth = depthOf.get(id) ?? 0;
    if (depth === 0 && roots.length <= 1) return { x: cx, y: cy };
    // 有多個根節點時，若仍固定在正中央會互相重疊，改比照第一層節點依角度分散
    const effectiveDepth = depth === 0 ? 1 : depth;
    const angle = ((angleUnit.get(id) ?? 0) / leafCount) * Math.PI * 2 - Math.PI / 2;
    const r = effectiveDepth * levelR;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };
  const posOf = (id: string) => manualPositions?.[id] ?? defaultPosOf(id);

  const content = (
    <>
      <ArrowMarkerDefs id={arrowId} />
      {data.map((d) => {
        if (!d.parentId) return null;
        const p = posOf(d.parentId);
        const c = posOf(d.id);
        return (
          <Edge
            key={`edge-${d.id}`}
            d={d}
            x1={p.x}
            y1={p.y}
            x2={c.x}
            y2={c.y}
            defaultStyle={branchStyle}
            arrowMarkerId={arrowId}
            onEdgeClick={onEdgeClick}
            selected={selectedEdgeId === d.id}
          />
        );
      })}
      {data.map((d, i) => {
        const p = posOf(d.id);
        const depth = depthOf.get(d.id) ?? 0;
        const isRoot = depth === 0;
        const shape = d.shape ?? "circle";
        const r = isRoot ? 26 : 20;
        return (
          <DraggableNode key={d.id} id={d.id} x={p.x} y={p.y} onDrag={onNodeDrag}>
            <NodeShape shape={shape} x={p.x} y={p.y} w={r * 2} h={r * 2} fill={d.color ?? (isRoot ? "var(--accent)" : PALETTE[i % PALETTE.length])} />
            <text x={p.x} y={p.y + 4} fontSize={isRoot ? 13 : 12} textAnchor="middle" fill="#1a1a1a">
              {(d.label || t("common.unnamed")).length > 7 ? d.label.slice(0, 7) + "…" : d.label || t("common.unnamed")}
            </text>
          </DraggableNode>
        );
      })}
    </>
  );

  return <PannableCanvas width={size} height={size} contentWidth={size} contentHeight={size}>{content}</PannableCanvas>;
}

function FishboneChart({ data, width, height }: { data: ChartDataPoint[]; width: number; height: number }) {
  const { t } = useLanguage();
  const { children, roots } = buildChildMap(data);
  const w = Math.max(width, 520);
  const h = Math.max(height, 260);
  const spineY = h / 2;
  const spineStartX = 30;
  const headId = roots[0];
  const bones = headId ? children(headId) : [];
  const spineEndX = w - 90;
  const boneCount = Math.max(1, bones.length);
  const usableWidth = spineEndX - spineStartX - 20;
  const boneSpacing = usableWidth / boneCount;
  const boneReach = Math.min(70, h / 2 - 30);

  const content = (
    <>
      <line x1={spineStartX} y1={spineY} x2={spineEndX} y2={spineY} stroke="var(--text-muted)" strokeWidth={2} />
      <polygon points={`${spineEndX},${spineY - 8} ${spineEndX + 14},${spineY} ${spineEndX},${spineY + 8}`} fill="var(--text-muted)" />
      {headId && (
        <g>
          <rect x={spineEndX + 16} y={spineY - 16} width={Math.max(60, w - spineEndX - 30)} height={32} rx={6} fill="var(--accent)" />
          <text x={spineEndX + 16 + Math.max(60, w - spineEndX - 30) / 2} y={spineY + 4} fontSize={13} textAnchor="middle" fill="#1a1a1a">
            {data.find((d) => d.id === headId)?.label || t("common.unnamed")}
          </text>
        </g>
      )}
      {bones.map((boneId, i) => {
        const bone = data.find((d) => d.id === boneId);
        if (!bone) return null;
        const attachX = spineStartX + boneSpacing * (i + 1);
        const up = i % 2 === 0;
        const tipY = up ? spineY - boneReach : spineY + boneReach;
        const tipX = attachX - boneReach * 0.5;
        const subs = children(boneId);
        return (
          <g key={boneId}>
            <line x1={attachX} y1={spineY} x2={tipX} y2={tipY} stroke={bone.color ?? PALETTE[i % PALETTE.length]} strokeWidth={2} />
            <text
              x={tipX}
              y={up ? tipY - 8 : tipY + 16}
              fontSize={13}
              textAnchor="middle"
              fill="var(--text)"
              fontWeight={600}
            >
              {bone.label || t("common.unnamed")}
            </text>
            {subs.map((subId, j) => {
              const sub = data.find((d) => d.id === subId);
              if (!sub) return null;
              const frac = subs.length > 1 ? (j + 1) / (subs.length + 1) : 0.5;
              const sx = attachX + (tipX - attachX) * frac;
              const sy = spineY + (tipY - spineY) * frac;
              const tickX = sx + (up ? 14 : -14);
              const tickY = sy - (up ? 6 : -6);
              return (
                <g key={subId}>
                  <line x1={sx} y1={sy} x2={tickX} y2={tickY} stroke="var(--text-faint)" strokeWidth={1} />
                  <text x={tickX} y={tickY + (up ? -4 : 12)} fontSize={11} textAnchor="middle" fill="var(--text-faint)">
                    {(sub.label || "").length > 6 ? sub.label.slice(0, 6) + "…" : sub.label || t("common.unnamed")}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </>
  );

  return <PannableCanvas width={width} height={height} contentWidth={w} contentHeight={h}>{content}</PannableCanvas>;
}

function BarChart({ data, width, height, axisMin, axisMax }: { data: ChartDataPoint[]; width: number; height: number; axisMin?: number; axisMax?: number }) {
  const values = data.map((d) => d.value);
  const min = axisMin ?? Math.min(0, ...values);
  const max = axisMax ?? Math.max(1, ...values);
  const range = Math.max(1e-6, max - min);
  const padding = 24;
  const chartHeight = height - padding;
  const barGap = 8;
  const barWidth = Math.max(8, (width - padding * 2 - barGap * (data.length - 1)) / data.length);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: "100%" }}>
      <line x1={padding} y1={chartHeight} x2={width - 4} y2={chartHeight} stroke="var(--border)" />
      {data.map((d, i) => {
        const barHeight = ((d.value - min) / range) * (chartHeight - 10);
        const x = padding + i * (barWidth + barGap);
        const y = chartHeight - barHeight;
        return (
          <g key={d.id}>
            <rect x={x} y={y} width={barWidth} height={barHeight} fill={d.color ?? PALETTE[i % PALETTE.length]} rx={2} />
            <text x={x + barWidth / 2} y={chartHeight + 14} fontSize={12} textAnchor="middle" fill="var(--text-muted)">
              {d.label.length > 6 ? d.label.slice(0, 6) + "…" : d.label}
            </text>
            <text x={x + barWidth / 2} y={y - 4} fontSize={12} textAnchor="middle" fill="var(--text-faint)">
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({
  data,
  width,
  height,
  axisMin,
  axisMax,
  series,
}: {
  data: ChartDataPoint[];
  width: number;
  height: number;
  axisMin?: number;
  axisMax?: number;
  series?: ChartSeries[];
}) {
  const { t } = useLanguage();
  const isMulti = !!series && series.length > 0;
  const groups = isMulti
    ? series!.map((s, i) => ({ label: s.label, color: s.color ?? PALETTE[i % PALETTE.length], points: data.filter((d) => d.seriesId === s.id) }))
    : [{ label: "", color: data[0]?.color ?? PALETTE[0], points: data }];

  const lineValues = data.map((d) => d.value);
  const min = axisMin ?? Math.min(0, ...lineValues);
  const max = axisMax ?? Math.max(1, ...lineValues);
  const range = Math.max(1e-6, max - min);
  const padding = 24;
  const chartHeight = height - padding;
  const itemCount = Math.max(1, ...groups.map((g) => g.points.length));
  const stepX = itemCount > 1 ? (width - padding * 2) / (itemCount - 1) : 0;
  const itemLabels = groups[0]?.points.map((p) => p.label) ?? [];

  const plotted = groups.map((g) => ({
    ...g,
    pts: g.points.map((d, i) => ({ x: padding + i * stepX, y: chartHeight - ((d.value - min) / range) * (chartHeight - 10), d })),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: "100%" }}>
        <line x1={padding} y1={chartHeight} x2={width - 4} y2={chartHeight} stroke="var(--border)" />
        {plotted.map((g, gi) => (
          <g key={gi}>
            <polyline points={g.pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={g.color} strokeWidth={2} />
            {g.pts.map((p) => (
              <circle key={p.d.id} cx={p.x} cy={p.y} r={3.5} fill={g.color} />
            ))}
          </g>
        ))}
        {itemLabels.map((label, i) => (
          <text key={i} x={padding + i * stepX} y={chartHeight + 14} fontSize={12} textAnchor="middle" fill="var(--text-muted)">
            {label.length > 6 ? label.slice(0, 6) + "…" : label}
          </text>
        ))}
        {!isMulti &&
          plotted[0]?.pts.map((p) => (
            <text key={`v-${p.d.id}`} x={p.x} y={p.y - 8} fontSize={12} textAnchor="middle" fill="var(--text-faint)">
              {p.d.value}
            </text>
          ))}
      </svg>
      {isMulti && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11 }}>
          {plotted.map((g, gi) => (
            <span key={gi} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: g.color, flexShrink: 0 }} />
              {g.label || t("chartView.lineFallback", { n: gi + 1 })}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RadarChart({ data, size, maxValue, series }: { data: ChartDataPoint[]; size: number; maxValue?: number; series?: ChartSeries[] }) {
  const { t } = useLanguage();
  const isMulti = !!series && series.length > 0;
  const groups = isMulti
    ? series!.map((s, i) => ({ label: s.label, color: s.color ?? PALETTE[i % PALETTE.length], points: data.filter((d) => d.seriesId === s.id) }))
    : [{ label: "", color: data[0]?.color ?? PALETTE[0], points: data }];

  const n = groups[0]?.points.length ?? 0;
  const max = maxValue && maxValue > 0 ? maxValue : Math.max(1, ...data.map((d) => d.value));
  const labelMargin = 34;
  const radius = size / 2 - labelMargin;
  const cx = size / 2;
  const cy = size / 2;
  const angleStep = n > 0 ? (Math.PI * 2) / n : 0;
  const angleFor = (i: number) => -Math.PI / 2 + i * angleStep;
  const axisLabels = groups[0]?.points.map((p) => p.label) ?? [];

  const plotted = groups.map((g) => {
    const points = g.points.map((d, i) => {
      const angle = angleFor(i);
      const r = (Math.max(0, d.value) / max) * radius;
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), d };
    });
    return { ...g, points, polygonPoints: points.map((p) => `${p.x},${p.y}`).join(" ") };
  });

  const rings = [0.25, 0.5, 0.75, 1].map((f) =>
    axisLabels.map((_, i) => {
      const angle = angleFor(i);
      return `${cx + f * radius * Math.cos(angle)},${cy + f * radius * Math.sin(angle)}`;
    }).join(" ")
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: "100%" }}>
        {rings.map((r, i) => (
          <polygon key={i} points={r} fill="none" stroke="var(--border)" />
        ))}
        {axisLabels.map((label, i) => {
          const angle = angleFor(i);
          const x2 = cx + radius * Math.cos(angle);
          const y2 = cy + radius * Math.sin(angle);
          const lx = cx + (radius + 16) * Math.cos(angle);
          const ly = cy + (radius + 16) * Math.sin(angle);
          return (
            <g key={i}>
              <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="var(--border)" />
              <text x={lx} y={ly} fontSize={12} textAnchor="middle" fill="var(--text-muted)">
                {label.length > 6 ? label.slice(0, 6) + "…" : label}
              </text>
            </g>
          );
        })}
        {plotted.map((g, gi) => (
          <g key={gi}>
            <polygon points={g.polygonPoints} fill={`${g.color}55`} stroke={g.color} strokeWidth={2} />
            {g.points.map((p) => (
              <circle key={p.d.id} cx={p.x} cy={p.y} r={3} fill={g.color} />
            ))}
          </g>
        ))}
      </svg>
      {n < 3 && <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0 }}>{t("chartView.radarHint")}</p>}
      {isMulti && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11 }}>
          {plotted.map((g, gi) => (
            <span key={gi} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: g.color, flexShrink: 0 }} />
              {g.label || t("chartView.lineFallback", { n: gi + 1 })}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PieChart({ data, size }: { data: ChartDataPoint[]; size: number }) {
  const { t } = useLanguage();
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0) || 1;
  const radius = size / 2 - 4;
  const cx = radius + 4;
  const cy = radius + 4;
  let angle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    const fraction = Math.max(0, d.value) / total;
    const start = angle;
    const end = angle + fraction * Math.PI * 2;
    angle = end;
    const x1 = cx + radius * Math.cos(start);
    const y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(end);
    const y2 = cy + radius * Math.sin(end);
    const largeArc = end - start > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { path, color: d.color ?? PALETTE[i % PALETTE.length], d, fraction };
  });

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={cx + radius + 4} height={cy + radius + 4} viewBox={`0 0 ${cx + radius + 4} ${cy + radius + 4}`}>
        {slices.map((s) => (
          <path key={s.d.id} d={s.path} fill={s.color} stroke="var(--bg)" strokeWidth={1} />
        ))}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {slices.map((s) => (
          <div key={s.d.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span>{s.d.label || t("common.unnamed")}</span>
            <span style={{ color: "var(--text-faint)" }}>{Math.round(s.fraction * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 數線圖：僅 X 軸版本（如問卷 1~10 分），資料點沿單一水平數線標註，標籤上下交錯以減少重疊 */
function NumberLineXChart({ data, width, height, axisMin, axisMax }: { data: ChartDataPoint[]; width: number; height: number; axisMin?: number; axisMax?: number }) {
  const { t } = useLanguage();
  const values = data.map((d) => d.value);
  const min = axisMin ?? Math.min(0, ...values);
  const max = axisMax ?? Math.max(1, ...values);
  const range = Math.max(1e-6, max - min);
  const padding = 30;
  const lineY = height / 2;
  const px = (v: number) => padding + ((v - min) / range) * (width - padding * 2);

  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => min + (range * i) / tickCount);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: "100%" }}>
      <line x1={padding} y1={lineY} x2={width - padding} y2={lineY} stroke="var(--border)" strokeWidth={2} />
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={px(t)} y1={lineY - 4} x2={px(t)} y2={lineY + 4} stroke="var(--border)" />
        </g>
      ))}
      {data.map((d, i) => {
        const x = px(d.value);
        const up = i % 2 === 0;
        return (
          <g key={d.id}>
            <line x1={x} y1={lineY} x2={x} y2={up ? lineY - 10 : lineY + 10} stroke={d.color ?? PALETTE[i % PALETTE.length]} strokeWidth={2} />
            <circle cx={x} cy={lineY} r={5} fill={d.color ?? PALETTE[i % PALETTE.length]} />
            <text x={x} y={up ? lineY - 15 : lineY + 24} fontSize={12} textAnchor="middle" fill="var(--text)">
              {d.label || t("common.unnamed")}
            </text>
            <text x={x} y={up ? lineY - 28 : lineY + 37} fontSize={11} textAnchor="middle" fill="var(--text-faint)">
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 數線圖：X+Y 雙軸版本，將每筆資料以 (value, y) 座標點顯示，支援縮放平移 */
function NumberLineXYChart({
  data,
  width,
  height,
  axisMin,
  axisMax,
  yAxisMin,
  yAxisMax,
}: {
  data: ChartDataPoint[];
  width: number;
  height: number;
  axisMin?: number;
  axisMax?: number;
  yAxisMin?: number;
  yAxisMax?: number;
}) {
  const { t } = useLanguage();
  const xs = data.map((d) => d.value);
  const ys = data.map((d) => d.y ?? 0);
  const xMin = axisMin ?? Math.min(0, ...xs);
  const xMax = axisMax ?? Math.max(1, ...xs);
  const yMin = yAxisMin ?? Math.min(0, ...ys);
  const yMax = yAxisMax ?? Math.max(1, ...ys);
  const xRange = Math.max(1e-6, xMax - xMin);
  const yRange = Math.max(1e-6, yMax - yMin);
  const padding = 36;
  const contentWidth = Math.max(width, 320);
  const contentHeight = Math.max(height, 260);
  const px = (v: number) => padding + ((v - xMin) / xRange) * (contentWidth - padding * 2);
  const py = (v: number) => contentHeight - padding - ((v - yMin) / yRange) * (contentHeight - padding * 2);

  const tickCount = 5;
  const xTicks = Array.from({ length: tickCount + 1 }, (_, i) => xMin + (xRange * i) / tickCount);
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => yMin + (yRange * i) / tickCount);
  const zeroX = xMin <= 0 && xMax >= 0 ? px(0) : undefined;
  const zeroY = yMin <= 0 && yMax >= 0 ? py(0) : undefined;

  const content = (
    <>
      <rect x={padding} y={padding} width={contentWidth - padding * 2} height={contentHeight - padding * 2} fill="none" stroke="var(--border)" />
      {xTicks.map((t, i) => (
        <line key={`vx${i}`} x1={px(t)} y1={padding} x2={px(t)} y2={contentHeight - padding} stroke="var(--border)" strokeWidth={0.5} opacity={0.5} />
      ))}
      {yTicks.map((t, i) => (
        <line key={`hy${i}`} x1={padding} y1={py(t)} x2={contentWidth - padding} y2={py(t)} stroke="var(--border)" strokeWidth={0.5} opacity={0.5} />
      ))}
      {zeroX !== undefined && <line x1={zeroX} y1={padding} x2={zeroX} y2={contentHeight - padding} stroke="var(--text-faint)" strokeWidth={1.5} />}
      {zeroY !== undefined && <line x1={padding} y1={zeroY} x2={contentWidth - padding} y2={zeroY} stroke="var(--text-faint)" strokeWidth={1.5} />}
      {xTicks.map((t, i) => (
        <text key={`xt${i}`} x={px(t)} y={contentHeight - padding + 16} fontSize={11} textAnchor="middle" fill="var(--text-faint)">
          {Number(t.toFixed(2))}
        </text>
      ))}
      {yTicks.map((t, i) => (
        <text key={`yt${i}`} x={padding - 8} y={py(t) + 4} fontSize={11} textAnchor="end" fill="var(--text-faint)">
          {Number(t.toFixed(2))}
        </text>
      ))}
      {data.map((d, i) => (
        <g key={d.id}>
          <circle cx={px(d.value)} cy={py(d.y ?? 0)} r={5} fill={d.color ?? PALETTE[i % PALETTE.length]} />
          <text x={px(d.value)} y={py(d.y ?? 0) - 10} fontSize={11} textAnchor="middle" fill="var(--text)">
            {d.label || t("common.unnamed")}
          </text>
        </g>
      ))}
    </>
  );

  return <PannableCanvas width={width} height={height} contentWidth={contentWidth} contentHeight={contentHeight}>{content}</PannableCanvas>;
}
