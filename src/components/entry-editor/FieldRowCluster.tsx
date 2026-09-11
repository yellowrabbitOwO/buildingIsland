import type { ChartFieldConfig, FieldDef, FieldType, FieldValue, ScaleFieldConfig } from "../../data/types";
import { TYPE_LABELS, CHART_TYPE_LABELS, SCALE_MODE_LABELS } from "../../data/fieldTypeLabels";
import FieldRenderer from "./FieldRenderer";
import ExtraSlotsRow from "./ExtraSlotsRow";
import FieldRow from "./FieldRow";
import FieldActionsMenu from "./FieldActionsMenu";
import FieldHint from "../common/FieldHint";
import { useDragReorder } from "../../data/reorder";
import { useLanguage } from "../../i18n";

interface FieldRowClusterProps {
  label: string;
  fields: FieldDef[];
  values: Record<string, FieldValue>;
  editing: boolean;
  worldId: string;
  currentEntryId?: string;
  starredFieldIds: string[];
  onChangeValue?: (fieldId: string, value: unknown) => void;
  onChangeExtraSlotValue?: (fieldId: string, slotId: string, value: unknown) => void;
  onChangeExtraSlotType?: (fieldId: string, slotId: string, type: FieldType) => void;
  onChangeExtraSlotChartConfig?: (fieldId: string, slotId: string, patch: Partial<ChartFieldConfig>) => void;
  onToggleStar?: (fieldId: string) => void;
  onRemoveField?: (fieldId: string) => void;
  onDuplicateField?: (fieldId: string) => void;
  onRelabel?: (newBaseLabel: string) => void;
  onTypeChange?: (fieldId: string, type: FieldType) => void;
  onChartConfigChange?: (fieldId: string, patch: Partial<ChartFieldConfig>) => void;
  onScaleConfigChange?: (fieldId: string, patch: Partial<ScaleFieldConfig>) => void;
  onOpenFieldSettings?: (clusterFields: FieldDef[]) => void;
  /** 同一叢集裡有多個實例（「階段」）時，拖曳調整彼此順序 */
  onReorderInstances?: (orderedFieldIds: string[]) => void;
}

/** 同一欄位新增的多個實例（新增第二個…）共用一個標題，只在下方堆疊各自的值 */
export default function FieldRowCluster({
  label,
  fields,
  values,
  editing,
  worldId,
  currentEntryId,
  starredFieldIds,
  onChangeValue,
  onChangeExtraSlotValue,
  onChangeExtraSlotType,
  onChangeExtraSlotChartConfig,
  onToggleStar,
  onRemoveField,
  onDuplicateField,
  onRelabel,
  onTypeChange,
  onChartConfigChange,
  onScaleConfigChange,
  onOpenFieldSettings,
  onReorderInstances,
}: FieldRowClusterProps) {
  const { handleProps, rowProps, dragIndex, dropIndicatorStyle } = useDragReorder(
    fields,
    (newFields) => onReorderInstances?.(newFields.map((f) => f.id)),
    editing && !!onReorderInstances && fields.length > 1
  );
  const { t } = useLanguage();

  if (fields.length === 1) {
    const field = fields[0];
    return (
      <FieldRow
        field={field}
        value={values[field.id]}
        editing={editing}
        worldId={worldId}
        currentEntryId={currentEntryId}
        starred={starredFieldIds.includes(field.id)}
        onChange={onChangeValue ? (v) => onChangeValue(field.id, v) : undefined}
        onChangeExtraSlotValue={onChangeExtraSlotValue ? (slotId, v) => onChangeExtraSlotValue(field.id, slotId, v) : undefined}
        onChangeExtraSlotType={onChangeExtraSlotType ? (slotId, t) => onChangeExtraSlotType(field.id, slotId, t) : undefined}
        onChangeExtraSlotChartConfig={
          onChangeExtraSlotChartConfig ? (slotId, patch) => onChangeExtraSlotChartConfig(field.id, slotId, patch) : undefined
        }
        onToggleStar={onToggleStar ? () => onToggleStar(field.id) : undefined}
        onRemove={editing && onRemoveField ? () => onRemoveField(field.id) : undefined}
        onDuplicate={editing && onDuplicateField ? () => onDuplicateField(field.id) : undefined}
        onLabelChange={editing && onRelabel ? onRelabel : undefined}
        onTypeChange={editing && onTypeChange ? (t) => onTypeChange(field.id, t) : undefined}
        onChartConfigChange={editing && onChartConfigChange ? (patch) => onChartConfigChange(field.id, patch) : undefined}
        onScaleConfigChange={editing && onScaleConfigChange ? (patch) => onScaleConfigChange(field.id, patch) : undefined}
        onOpenSettings={editing && onOpenFieldSettings ? () => onOpenFieldSettings(fields) : undefined}
      />
    );
  }

  const first = fields[0];

  return (
    <div style={{ padding: "0.5px 0" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        {editing && onRelabel ? (
          <input
            value={label}
            onChange={(e) => onRelabel(e.target.value)}
            style={{ minWidth: 84, maxWidth: 110, flexShrink: 0, fontSize: 13, padding: "1px 4px" }}
          />
        ) : (
          <span style={{ minWidth: 84, flexShrink: 0, color: "var(--text-muted)", fontSize: 13, paddingTop: 3 }}>{label}</span>
        )}
        <span style={{ color: "var(--text-faint)", paddingTop: 3 }}>:</span>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {fields.map((field, i) => {
            const wrapContentToNewLine = editing && field.type === "scale";
            return (
            <div
              key={field.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                flexWrap: wrapContentToNewLine ? "wrap" : undefined,
                opacity: dragIndex === i ? 0.5 : 1,
                ...dropIndicatorStyle(i),
              }}
              {...rowProps(i)}
            >
              {editing && onReorderInstances && (
                <span {...handleProps(i)} style={{ cursor: "grab", color: "var(--text-faint)", flexShrink: 0, paddingTop: 3 }} title={t("common.dragToReorder")}>
                  ⠿
                </span>
              )}
              {onToggleStar && (
                <button
                  className="btn-ghost"
                  style={{ color: starredFieldIds.includes(field.id) ? "var(--accent)" : "var(--text-faint)", flexShrink: 0 }}
                  onClick={() => onToggleStar(field.id)}
                  title={t("fieldRow.starFieldTitle")}
                >
                  {starredFieldIds.includes(field.id) ? "★" : "☆"}
                </button>
              )}
              {editing && onTypeChange && field.allowedTypes && field.allowedTypes.length > 1 && (
                <select
                  value={field.type}
                  onChange={(e) => onTypeChange(field.id, e.target.value as FieldType)}
                  style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}
                >
                  {field.allowedTypes.map((ft) => (
                    <option key={ft} value={ft}>
                      {t(TYPE_LABELS[ft])}
                    </option>
                  ))}
                </select>
              )}
              {editing && onChartConfigChange && field.type === "chart" && field.chartConfig?.allowedChartTypes && field.chartConfig.allowedChartTypes.length > 1 && (
                <select
                  value={field.chartConfig.chartType}
                  onChange={(e) => onChartConfigChange(field.id, { chartType: e.target.value as ChartFieldConfig["chartType"] })}
                  style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}
                >
                  {field.chartConfig.allowedChartTypes.map((ct) => (
                    <option key={ct} value={ct}>
                      {t(CHART_TYPE_LABELS[ct])}
                    </option>
                  ))}
                </select>
              )}
              {editing && onScaleConfigChange && field.type === "scale" && field.scaleConfig?.allowedModes && field.scaleConfig.allowedModes.length > 1 && (
                <select
                  value={field.scaleConfig.mode}
                  onChange={(e) => onScaleConfigChange(field.id, { mode: e.target.value as ScaleFieldConfig["mode"] })}
                  style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}
                >
                  {field.scaleConfig.allowedModes.map((m) => (
                    <option key={m} value={m}>
                      {t(SCALE_MODE_LABELS[m])}
                    </option>
                  ))}
                </select>
              )}
              <span style={{ flex: 1, minWidth: 0, ...(wrapContentToNewLine ? { flexBasis: "100%", order: 2, marginTop: 4 } : {}) }}>
                <FieldRenderer
                  field={field}
                  value={values[field.id]}
                  editing={editing}
                  worldId={worldId}
                  currentEntryId={currentEntryId}
                  onChange={onChangeValue ? (v) => onChangeValue(field.id, v) : () => {}}
                  onChartConfigChange={onChartConfigChange ? (patch) => onChartConfigChange(field.id, patch) : undefined}
                />
                <ExtraSlotsRow
                  field={field}
                  value={values[field.id]}
                  editing={editing}
                  worldId={worldId}
                  currentEntryId={currentEntryId}
                  onChangeSlotValue={onChangeExtraSlotValue ? (slotId, v) => onChangeExtraSlotValue(field.id, slotId, v) : undefined}
                  onChangeSlotType={onChangeExtraSlotType ? (slotId, t) => onChangeExtraSlotType(field.id, slotId, t) : undefined}
                  onChangeSlotChartConfig={
                    onChangeExtraSlotChartConfig ? (slotId, patch) => onChangeExtraSlotChartConfig(field.id, slotId, patch) : undefined
                  }
                />
              </span>
              <span style={wrapContentToNewLine ? { order: 1 } : undefined}>
                <FieldActionsMenu
                  onOpenSettings={editing && onOpenFieldSettings ? () => onOpenFieldSettings(fields) : undefined}
                  onDuplicate={editing && onDuplicateField ? () => onDuplicateField(field.id) : undefined}
                  onRemove={editing && onRemoveField ? () => onRemoveField(field.id) : undefined}
                />
              </span>
            </div>
            );
          })}
        </div>
      </div>
      {editing && <FieldHint field={first} style={{ marginLeft: 92 }} />}
    </div>
  );
}
