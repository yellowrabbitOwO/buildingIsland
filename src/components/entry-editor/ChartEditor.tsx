import { useState } from "react";
import { newId } from "../../data/db";
import type { ChartBranchStyle, ChartDataPoint, ChartFieldConfig, ChartNodeShape, ChartSeries } from "../../data/types";
import { BRANCHING_CHART_TYPES } from "../../data/fieldTypeLabels";
import { useDragReorder } from "../../data/reorder";
import ColorInput from "../common/ColorInput";
import ChartConfigEditor from "./ChartConfigEditor";
import ChartView from "./ChartView";
import { useLanguage, type TranslationKey } from "../../i18n";

const BRANCH_STYLE_KEYS: Record<ChartBranchStyle, TranslationKey> = {
  straight: "chartEditor.branchStyle.straight",
  curved: "chartEditor.branchStyle.curved",
  elbow: "chartEditor.branchStyle.elbow",
};

const NODE_SHAPE_KEYS: Record<ChartNodeShape, TranslationKey> = {
  circle: "chartEditor.nodeShape.circle",
  rect: "chartEditor.nodeShape.rect",
  roundedRect: "chartEditor.nodeShape.roundedRect",
  diamond: "chartEditor.nodeShape.diamond",
};

interface ChartEditorProps {
  worldId: string;
  chartConfig: ChartFieldConfig;
  data: ChartDataPoint[];
  onDataChange: (data: ChartDataPoint[]) => void;
  onConfigChange: (patch: Partial<ChartFieldConfig>) => void;
}

/** 判斷 candidateId 是否為 id 的子孫節點（用來避免上層節點選擇造成循環） */
function isDescendant(data: ChartDataPoint[], id: string, candidateId: string): boolean {
  const byParent = new Map<string, string[]>();
  for (const d of data) {
    if (!d.parentId) continue;
    if (!byParent.has(d.parentId)) byParent.set(d.parentId, []);
    byParent.get(d.parentId)!.push(d.id);
  }
  const stack = [...(byParent.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === candidateId) return true;
    stack.push(...(byParent.get(cur) ?? []));
  }
  return false;
}

export default function ChartEditor({ worldId, chartConfig, data, onDataChange, onConfigChange }: ChartEditorProps) {
  const { t } = useLanguage();
  const { chartType } = chartConfig;
  const [showSettings, setShowSettings] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const isBranching = BRANCHING_CHART_TYPES.includes(chartType);
  const isEdgeEditable = chartType === "tree" || chartType === "mindmap";
  const selectedEdgePoint = isEdgeEditable ? data.find((d) => d.id === selectedEdgeId) : undefined;
  const isNumberLineXY = chartType === "numberline" && chartConfig.numberLineMode === "xy";
  const isPannable = chartType === "tree" || chartType === "mindmap" || chartType === "fishbone" || isNumberLineXY;
  const isMultiCapable = chartType === "line" || chartType === "radar";
  const series = chartConfig.series ?? [];
  const isMultiSeries = isMultiCapable && series.length > 0;
  const update = (id: string, patch: Partial<ChartDataPoint>) => {
    onDataChange(data.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };
  const remove = (id: string) => {
    const byParent = new Map<string, string[]>();
    for (const d of data) {
      if (!d.parentId) continue;
      if (!byParent.has(d.parentId)) byParent.set(d.parentId, []);
      byParent.get(d.parentId)!.push(d.id);
    }
    const toRemove = new Set<string>([id]);
    const stack = [...(byParent.get(id) ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      toRemove.add(cur);
      stack.push(...(byParent.get(cur) ?? []));
    }
    onDataChange(data.filter((d) => !toRemove.has(d.id)));
    if (selectedEdgeId && toRemove.has(selectedEdgeId)) setSelectedEdgeId(null);
  };
  const add = () => onDataChange([...data, { id: newId(), label: "", value: 0 }]);

  const pointsFor = (seriesId: string) => data.filter((d) => d.seriesId === seriesId);
  const itemLabels = series[0] ? pointsFor(series[0].id).map((p) => p.label) : [];

  const enableMultiSeries = () => {
    const s1 = newId();
    const s2 = newId();
    const taggedExisting = data.map((d) => ({ ...d, seriesId: s1 }));
    const series2Points = data.map((d) => ({ id: newId(), label: d.label, value: 0, seriesId: s2 }));
    onDataChange([...taggedExisting, ...series2Points]);
    onConfigChange({
      series: [
        { id: s1, label: t("chartView.lineFallback", { n: 1 }), color: data[0]?.color },
        { id: s2, label: t("chartView.lineFallback", { n: 2 }) },
      ],
    });
  };
  const updateSeries = (id: string, patch: Partial<ChartSeries>) => {
    onConfigChange({ series: series.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  };
  const removeSeries = (id: string) => {
    onConfigChange({ series: series.filter((s) => s.id !== id) });
    onDataChange(data.filter((d) => d.seriesId !== id));
  };
  const addSeries = () => {
    const newSeriesId = newId();
    const newPoints = itemLabels.map((label) => ({ id: newId(), label, value: 0, seriesId: newSeriesId }));
    onConfigChange({ series: [...series, { id: newSeriesId, label: t("chartView.lineFallback", { n: series.length + 1 }) }] });
    onDataChange([...data, ...newPoints]);
  };
  const addItem = () => {
    const newPoints = series.map((s) => ({ id: newId(), label: "", value: 0, seriesId: s.id }));
    onDataChange([...data, ...newPoints]);
  };
  const removeItemAt = (index: number) => {
    const idsToRemove = new Set(series.map((s) => pointsFor(s.id)[index]?.id).filter((x): x is string => !!x));
    onDataChange(data.filter((d) => !idsToRemove.has(d.id)));
  };
  const renameItemAt = (index: number, label: string) => {
    const idsToRename = new Set(series.map((s) => pointsFor(s.id)[index]?.id).filter((x): x is string => !!x));
    onDataChange(data.map((d) => (idsToRename.has(d.id) ? { ...d, label } : d)));
  };
  const updateSeriesValueAt = (seriesId: string, index: number, value: number) => {
    const point = pointsFor(seriesId)[index];
    if (!point) return;
    onDataChange(data.map((d) => (d.id === point.id ? { ...d, value } : d)));
  };

  const {
    handleProps: dataHandleProps,
    rowProps: dataRowProps,
    dragIndex: dataDragIndex,
    dropIndicatorStyle: dataDropIndicatorStyle,
  } = useDragReorder(data, onDataChange, true);
  const {
    handleProps: seriesHandleProps,
    rowProps: seriesRowProps,
    dragIndex: seriesDragIndex,
    dropIndicatorStyle: seriesDropIndicatorStyle,
  } = useDragReorder(series, (newSeries) => onConfigChange({ series: newSeries }), true);
  const itemOrder = itemLabels.map((_, i) => i);
  const {
    handleProps: itemHandleProps,
    rowProps: itemRowProps,
    dragIndex: itemDragIndex,
    dropIndicatorStyle: itemDropIndicatorStyle,
  } = useDragReorder(
    itemOrder,
    (newOrder) => onDataChange(series.flatMap((s) => newOrder.map((idx) => pointsFor(s.id)[idx]))),
    true
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {isMultiSeries ? (
        <>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-faint)", fontWeight: 600, marginBottom: 4 }}>{t("chartEditor.seriesHeader")}</div>
            {series.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  marginBottom: 4,
                  opacity: seriesDragIndex === i ? 0.5 : 1,
                  ...seriesDropIndicatorStyle(i),
                }}
                {...seriesRowProps(i)}
              >
                <span {...seriesHandleProps(i)} style={{ cursor: "grab", color: "var(--text-faint)", flexShrink: 0 }} title={t("common.dragToReorder")}>
                  ⠿
                </span>
                <input style={{ flex: 1 }} placeholder={t("chartEditor.seriesNamePlaceholder")} value={s.label} onChange={(e) => updateSeries(s.id, { label: e.target.value })} />
                <ColorInput value={s.color} onChange={(c) => updateSeries(s.id, { color: c || undefined })} allowClear worldId={worldId} />
                <button className="btn-ghost" onClick={() => removeSeries(s.id)} title={t("chartEditor.removeSeriesTitle")}>
                  ✕
                </button>
              </div>
            ))}
            <button className="btn-ghost" style={{ alignSelf: "flex-start" }} onClick={addSeries}>
              {t("chartEditor.addSeries")}
            </button>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-faint)", fontWeight: 600, marginBottom: 4 }}>{t("chartEditor.itemsHeader")}</div>
            {itemLabels.map((label, i) => (
              <div
                key={series[0] ? (pointsFor(series[0].id)[i]?.id ?? i) : i}
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  marginBottom: 4,
                  opacity: itemDragIndex === i ? 0.5 : 1,
                  ...itemDropIndicatorStyle(i),
                }}
                {...itemRowProps(i)}
              >
                <span {...itemHandleProps(i)} style={{ cursor: "grab", color: "var(--text-faint)", flexShrink: 0 }} title={t("common.dragToReorder")}>
                  ⠿
                </span>
                <input style={{ width: 110 }} placeholder={t("chartEditor.itemNamePlaceholder")} value={label} onChange={(e) => renameItemAt(i, e.target.value)} />
                {series.map((s) => (
                  <input
                    key={s.id}
                    type="number"
                    style={{ width: 70 }}
                    title={s.label}
                    value={pointsFor(s.id)[i]?.value ?? 0}
                    onChange={(e) => updateSeriesValueAt(s.id, i, Number(e.target.value) || 0)}
                  />
                ))}
                <button className="btn-ghost" onClick={() => removeItemAt(i)} title={t("chartEditor.removeItemTitle")}>
                  ✕
                </button>
              </div>
            ))}
            <button className="btn-ghost" style={{ alignSelf: "flex-start" }} onClick={addItem}>
              {t("chartEditor.addItem")}
            </button>
          </div>
        </>
      ) : (
        <>
          {data.map((d, i) => (
            <div
              key={d.id}
              style={{ display: "flex", gap: 6, alignItems: "center", opacity: dataDragIndex === i ? 0.5 : 1, ...dataDropIndicatorStyle(i) }}
              {...dataRowProps(i)}
            >
              <span {...dataHandleProps(i)} style={{ cursor: "grab", color: "var(--text-faint)", flexShrink: 0 }} title={t("common.dragToReorder")}>
                ⠿
              </span>
              <input
                style={{ flex: 1 }}
                placeholder={t("chartEditor.itemNamePlaceholder")}
                value={d.label}
                onChange={(e) => update(d.id, { label: e.target.value })}
              />
              {!isBranching && (
                <input
                  type="number"
                  style={{ width: 90 }}
                  title={isNumberLineXY ? "X" : undefined}
                  placeholder={isNumberLineXY ? "X" : undefined}
                  value={d.value}
                  onChange={(e) => update(d.id, { value: Number(e.target.value) || 0 })}
                />
              )}
              {isNumberLineXY && (
                <input
                  type="number"
                  style={{ width: 90 }}
                  title="Y"
                  placeholder="Y"
                  value={d.y ?? 0}
                  onChange={(e) => update(d.id, { y: Number(e.target.value) || 0 })}
                />
              )}
              {isBranching && (
                <select
                  style={{ width: 130 }}
                  value={d.parentId ?? ""}
                  onChange={(e) => update(d.id, { parentId: e.target.value || undefined })}
                >
                  <option value="">{t("chartEditor.topLevelNode")}</option>
                  {data
                    .filter((other) => other.id !== d.id && !isDescendant(data, d.id, other.id))
                    .map((other) => (
                      <option key={other.id} value={other.id}>
                        {t("chartEditor.parentOptionLabel", { label: other.label || t("common.unnamed") })}
                      </option>
                    ))}
                </select>
              )}
              {(chartType === "tree" || chartType === "mindmap") && (
                <select
                  style={{ width: 96 }}
                  title={t("chartEditor.nodeShapeTitle")}
                  value={d.shape ?? (chartType === "tree" ? "roundedRect" : "circle")}
                  onChange={(e) => update(d.id, { shape: e.target.value as ChartNodeShape })}
                >
                  {(Object.entries(NODE_SHAPE_KEYS) as [ChartNodeShape, TranslationKey][]).map(([value, key]) => (
                    <option key={value} value={value}>
                      {t(key)}
                    </option>
                  ))}
                </select>
              )}
              <ColorInput value={d.color} onChange={(c) => update(d.id, { color: c || undefined })} allowClear worldId={worldId} />
              <button className="btn-ghost" onClick={() => remove(d.id)} title={t("chartEditor.removeDataPointTitle")}>
                ✕
              </button>
            </div>
          ))}
          <button className="btn-ghost" style={{ alignSelf: "flex-start" }} onClick={add}>
            {t("chartEditor.addDataPoint")}
          </button>
          {isMultiCapable && data.length > 0 && (
            <button className="btn-ghost" style={{ alignSelf: "flex-start", fontSize: 12 }} onClick={enableMultiSeries}>
              {t("chartEditor.addSecondLine")}
            </button>
          )}
        </>
      )}

      {data.length > 0 && (
        <div style={{ marginTop: 6, position: "relative", display: "inline-block" }}>
          {(isPannable || isEdgeEditable) && (
            <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "0 0 4px" }}>
              {isPannable && t("chartEditor.hint.pannable")}
              {isEdgeEditable && t("chartEditor.hint.edgeEditable")}
              {t("chartEditor.hint.resizeHandle")}
            </p>
          )}
          <ChartView
            chartType={chartType}
            data={data}
            width={chartConfig.width}
            height={chartConfig.height}
            maxValue={chartConfig.maxValue}
            axisMin={chartConfig.axisMin}
            axisMax={chartConfig.axisMax}
            yAxisMin={chartConfig.yAxisMin}
            yAxisMax={chartConfig.yAxisMax}
            numberLineMode={chartConfig.numberLineMode}
            backgroundColor={chartConfig.backgroundColor}
            branchStyle={chartConfig.branchStyle}
            manualPositions={chartConfig.manualPositions}
            series={chartConfig.series}
            onNodeDrag={
              chartType === "tree" || chartType === "mindmap"
                ? (id, pos) => onConfigChange({ manualPositions: { ...chartConfig.manualPositions, [id]: pos } })
                : undefined
            }
            onResize={(size) => onConfigChange(size)}
            onEdgeClick={isEdgeEditable ? (id) => setSelectedEdgeId((prev) => (prev === id ? null : id)) : undefined}
            selectedEdgeId={selectedEdgeId ?? undefined}
          />
          <button
            className="btn-ghost"
            onClick={() => setShowSettings((v) => !v)}
            title={t("chartEditor.chartSettingsTitle")}
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              width: 26,
              height: 26,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ⚙
          </button>
          {showSettings && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 19 }} onClick={() => setShowSettings(false)} />
              <div
                className="card"
                style={{
                  position: "absolute",
                  top: 34,
                  right: 4,
                  zIndex: 20,
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  width: 220,
                }}
              >
                <ChartConfigEditor worldId={worldId} chartTypes={[chartType]} config={chartConfig} onChange={onConfigChange} />
                {(chartType === "tree" || chartType === "mindmap") &&
                  chartConfig.manualPositions &&
                  Object.keys(chartConfig.manualPositions).length > 0 && (
                    <button
                      className="btn-ghost"
                      style={{ alignSelf: "flex-start", fontSize: 12 }}
                      onClick={() => onConfigChange({ manualPositions: undefined })}
                    >
                      {t("chartEditor.resetNodePositions")}
                    </button>
                  )}
              </div>
            </>
          )}
        </div>
      )}

      {selectedEdgePoint && (
        <div className="card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 13 }}>
              {t("chartEditor.selectedEdge", {
                from: data.find((p) => p.id === selectedEdgePoint.parentId)?.label || t("common.unnamed"),
                to: selectedEdgePoint.label || t("common.unnamed"),
              })}
            </strong>
            <button className="btn-ghost" onClick={() => setSelectedEdgeId(null)} title={t("chartEditor.deselectTitle")}>
              ✕
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(Object.entries(BRANCH_STYLE_KEYS) as [ChartBranchStyle, TranslationKey][]).map(([value, key]) => (
              <button
                key={value}
                className={
                  (selectedEdgePoint.edgeStyle ?? chartConfig.branchStyle ?? (chartType === "tree" ? "elbow" : "curved")) === value
                    ? "btn btn-primary"
                    : "btn"
                }
                onClick={() => update(selectedEdgePoint.id, { edgeStyle: value })}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={!!selectedEdgePoint.edgeArrow}
              onChange={(e) => update(selectedEdgePoint.id, { edgeArrow: e.target.checked })}
            />
            {t("chartEditor.arrowLabel")}
          </label>
          <label style={{ fontSize: 13 }}>
            {t("chartEditor.edgeLabelLabel")}
            <input
              style={{ width: "100%", marginTop: 4 }}
              value={selectedEdgePoint.edgeLabel ?? ""}
              onChange={(e) => update(selectedEdgePoint.id, { edgeLabel: e.target.value || undefined })}
              placeholder={t("common.optional")}
            />
          </label>
        </div>
      )}
    </div>
  );
}
