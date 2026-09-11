import type { ChartFieldConfig, FieldDef, FieldType, FieldValue, ScaleFieldConfig } from "../../data/types";
import { TYPE_LABELS, CHART_TYPE_LABELS, SCALE_MODE_LABELS } from "../../data/fieldTypeLabels";
import FieldRenderer from "./FieldRenderer";
import ExtraSlotsRow from "./ExtraSlotsRow";
import FieldActionsMenu from "./FieldActionsMenu";
import FieldHint from "../common/FieldHint";
import { useLanguage } from "../../i18n";

interface FieldRowProps {
  field: FieldDef;
  value: FieldValue | undefined;
  editing: boolean;
  worldId: string;
  currentEntryId?: string;
  starred?: boolean;
  onChange?: (value: unknown) => void;
  onChangeExtraSlotValue?: (slotId: string, value: unknown) => void;
  onChangeExtraSlotType?: (slotId: string, type: FieldType) => void;
  onChangeExtraSlotChartConfig?: (slotId: string, patch: Partial<ChartFieldConfig>) => void;
  onToggleStar?: () => void;
  onRemove?: () => void;
  onDuplicate?: () => void;
  onLabelChange?: (label: string) => void;
  onTypeChange?: (type: FieldType) => void;
  onChartConfigChange?: (patch: Partial<ChartFieldConfig>) => void;
  onScaleConfigChange?: (patch: Partial<ScaleFieldConfig>) => void;
  onOpenSettings?: () => void;
}

/** 單行「欄位名：內容」列，行距小，用於獨立欄位；群組/模組欄位由 FieldsList 外包一層框 */
export default function FieldRow({
  field,
  value,
  editing,
  worldId,
  currentEntryId,
  starred,
  onChange,
  onChangeExtraSlotValue,
  onChangeExtraSlotType,
  onChangeExtraSlotChartConfig,
  onToggleStar,
  onRemove,
  onDuplicate,
  onLabelChange,
  onTypeChange,
  onChartConfigChange,
  onScaleConfigChange,
  onOpenSettings,
}: FieldRowProps) {
  // 線性刻度／星級的內容（滑桿或星星＋手動輸入）較寬，編輯階段與欄位名同一行容易擠爆，故讓它自動換到下一行獨占一行
  const wrapContentToNewLine = editing && field.type === "scale";
  const { t } = useLanguage();
  return (
    <div style={{ padding: "0.5px 0" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: wrapContentToNewLine ? "wrap" : undefined }}>
        {onToggleStar && (
          <button
            className="btn-ghost"
            style={{ color: starred ? "var(--accent)" : "var(--text-faint)", flexShrink: 0 }}
            onClick={onToggleStar}
            title={t("fieldRow.starFieldTitle")}
          >
            {starred ? "★" : "☆"}
          </button>
        )}
        {editing && onLabelChange ? (
          <input
            value={field.label}
            onChange={(e) => onLabelChange(e.target.value)}
            style={{ minWidth: 84, maxWidth: 110, flexShrink: 0, fontSize: 13, padding: "1px 4px" }}
          />
        ) : (
          <span style={{ minWidth: 84, flexShrink: 0, color: "var(--text-muted)", fontSize: 13, paddingTop: 3 }}>
            {field.label}
          </span>
        )}
        <span style={{ color: "var(--text-faint)", paddingTop: 3 }}>:</span>
        {editing && onTypeChange && field.allowedTypes && field.allowedTypes.length > 1 && (
          <select
            value={field.type}
            onChange={(e) => onTypeChange(e.target.value as FieldType)}
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
            onChange={(e) => onChartConfigChange({ chartType: e.target.value as ChartFieldConfig["chartType"] })}
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
            onChange={(e) => onScaleConfigChange({ mode: e.target.value as ScaleFieldConfig["mode"] })}
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
            value={value}
            editing={editing}
            worldId={worldId}
            currentEntryId={currentEntryId}
            onChange={onChange ?? (() => {})}
            onChartConfigChange={onChartConfigChange}
          />
        </span>
        <span style={wrapContentToNewLine ? { order: 1 } : undefined}>
          <FieldActionsMenu onOpenSettings={onOpenSettings} onDuplicate={onDuplicate} onRemove={onRemove} />
        </span>
      </div>
      <ExtraSlotsRow
        field={field}
        value={value}
        editing={editing}
        worldId={worldId}
        currentEntryId={currentEntryId}
        onChangeSlotValue={onChangeExtraSlotValue}
        onChangeSlotType={onChangeExtraSlotType}
        onChangeSlotChartConfig={onChangeExtraSlotChartConfig}
      />
      {editing && <FieldHint field={field} style={{ marginLeft: 92 }} />}
    </div>
  );
}
