import { useLiveQuery } from "dexie-react-hooks";
import type {
  ChartDataPoint,
  ChartFieldConfig,
  ChoiceFieldConfig,
  DateFieldConfig,
  EntryLinkFieldConfig,
  FieldDef,
  FieldSlotDef,
  FieldType,
  FieldValue,
  NestedFieldConfig,
  NumberFieldConfig,
  ScaleFieldConfig,
} from "../../data/types";
import { db } from "../../data/db";
import { useAssetUrl } from "../../data/useAssetUrl";
import ColorInput from "../common/ColorInput";
import ImageUpload from "../common/ImageUpload";
import VideoUpload from "../common/VideoUpload";
import ResolvedColor from "../common/ResolvedColor";
import EntryLinkPicker from "./EntryLinkPicker";
import ChartEditor from "./ChartEditor";
import ChartView from "./ChartView";
import NestedValuePicker from "./NestedValuePicker";
import ChoiceValuePicker from "./ChoiceValuePicker";
import ScaleValuePicker from "./ScaleValuePicker";
import DateFieldPicker from "./DateFieldPicker";
import { useLanguage } from "../../i18n";

/** 影片欄位的閱覽模式：欄位值是 assetId，查對應的 Asset 拿 Blob 轉成 object URL 播放，
 * 找不到（可能已被刪除）時顯示提示文字而不是整片空白 */
function VideoFieldDisplay({ assetId }: { assetId: string }) {
  const asset = useLiveQuery(() => db.assets.get(assetId), [assetId]);
  const url = useAssetUrl(asset?.blob);
  const { t } = useLanguage();
  if (!url) return <span style={{ color: "var(--text-faint)" }}>{t("fieldRenderer.videoNotFound")}</span>;
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video controls src={url} style={{ maxWidth: 320, maxHeight: 220, borderRadius: 6 }} />
  );
}

/** 主值（FieldDef）與額外子值格（FieldSlotDef）共用的內容描述形狀 */
export interface FieldContent {
  type: FieldType;
  hint?: string;
  numberConfig?: NumberFieldConfig;
  entryLinkConfig?: EntryLinkFieldConfig;
  chartConfig?: ChartFieldConfig;
  nestedConfig?: NestedFieldConfig;
  choiceConfig?: ChoiceFieldConfig;
  scaleConfig?: ScaleFieldConfig;
  dateConfig?: DateFieldConfig;
}

interface FieldRendererProps {
  field: FieldDef;
  value: FieldValue | undefined;
  editing: boolean;
  worldId: string;
  currentEntryId?: string;
  onChange: (value: unknown) => void;
  onChartConfigChange?: (patch: Partial<ChartFieldConfig>) => void;
}

export default function FieldRenderer({ field, value, editing, worldId, currentEntryId, onChange, onChartConfigChange }: FieldRendererProps) {
  const current = value?.current;

  if (!editing) {
    return <FieldContentDisplay content={field} value={current} worldId={worldId} currentEntryId={currentEntryId} />;
  }

  return (
    <FieldContentEditor
      content={field}
      value={current}
      worldId={worldId}
      currentEntryId={currentEntryId}
      onChange={onChange}
      onChartConfigChange={onChartConfigChange}
    />
  );
}

/** 型態分派的編輯器；供主值（FieldRenderer）與額外子值格共用同一套渲染邏輯 */
export function FieldContentEditor({
  content,
  value: current,
  worldId,
  currentEntryId,
  onChange,
  onChartConfigChange,
}: {
  content: FieldContent | FieldSlotDef;
  value: unknown;
  worldId: string;
  currentEntryId?: string;
  onChange: (value: unknown) => void;
  onChartConfigChange?: (patch: Partial<ChartFieldConfig>) => void;
}) {
  switch (content.type) {
    case "text":
      return (
        <input
          style={{ width: "100%" }}
          value={(current as string) ?? ""}
          placeholder={content.hint || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "textarea":
      return (
        <textarea
          style={{ width: "100%", minHeight: 90 }}
          value={(current as string) ?? ""}
          placeholder={content.hint || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number": {
      const cfg = content.numberConfig;
      return (
        <input
          type="number"
          style={{ width: "100%" }}
          value={current === undefined || current === null ? "" : (current as number)}
          min={cfg?.min}
          max={cfg?.max}
          step={cfg?.mode === "integer" ? 1 : "any"}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      );
    }
    case "color":
      return <ColorInput value={current as string | undefined} onChange={onChange} allowClear worldId={worldId} />;
    case "image":
      return <ImageUpload value={current as string | undefined} onChange={onChange} />;
    case "video":
      return <VideoUpload value={current as string | undefined} onChange={onChange} worldId={worldId} />;
    case "entryLink":
      return (
        <EntryLinkPicker
          worldId={worldId}
          currentEntryId={currentEntryId}
          config={content.entryLinkConfig ?? { allowedCategoryIds: [], allowedBuiltInCategoryKeys: [], multiple: false }}
          value={current}
          editing
          onChange={onChange}
        />
      );
    case "chart":
      return (
        <ChartEditor
          worldId={worldId}
          chartConfig={content.chartConfig ?? { chartType: "bar" }}
          data={(current as ChartDataPoint[]) ?? []}
          onDataChange={onChange}
          onConfigChange={(patch) => onChartConfigChange?.(patch)}
        />
      );
    case "nested":
      return (
        <NestedValuePicker
          worldId={worldId}
          config={content.nestedConfig ?? { mode: "manual", options: [] }}
          value={current as string[] | undefined}
          editing
          onChange={onChange}
        />
      );
    case "choice":
      return (
        <ChoiceValuePicker
          config={content.choiceConfig ?? { options: [] }}
          value={current}
          editing
          onChange={onChange}
        />
      );
    case "scale":
      return (
        <ScaleValuePicker
          config={content.scaleConfig ?? { mode: "linear", precision: "smooth", min: 0, max: 100 }}
          value={current}
          editing
          onChange={onChange}
        />
      );
    case "date":
      return (
        <DateFieldPicker
          config={content.dateConfig ?? { calendarId: "", mode: "single" }}
          value={current}
          editing
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

/** 型態分派的顯示（閱覽模式）；供主值與額外子值格共用 */
export function FieldContentDisplay({
  content,
  value,
  worldId,
  currentEntryId,
}: {
  content: FieldContent | FieldSlotDef;
  value: unknown;
  worldId: string;
  currentEntryId?: string;
}) {
  const { t } = useLanguage();
  const empty = <span style={{ color: "var(--text-faint)" }}>{t("common.notSet")}</span>;

  switch (content.type) {
    case "text":
    case "textarea":
      return value ? <span style={{ whiteSpace: "pre-wrap" }}>{value as string}</span> : empty;
    case "number":
      return value !== undefined && value !== null ? <span>{value as number}</span> : empty;
    case "color":
      return value ? (
        <ResolvedColor value={value as string}>
          {(hex) => (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: hex,
                  border: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              />
              {hex}
            </span>
          )}
        </ResolvedColor>
      ) : (
        empty
      );
    case "image":
      return value ? (
        <img src={value as string} alt="" style={{ maxWidth: 120, maxHeight: 120, borderRadius: 6 }} />
      ) : (
        empty
      );
    case "video":
      return value ? <VideoFieldDisplay assetId={value as string} /> : empty;
    case "entryLink":
      return (
        <EntryLinkPicker
          worldId={worldId}
          currentEntryId={currentEntryId}
          config={content.entryLinkConfig ?? { allowedCategoryIds: [], allowedBuiltInCategoryKeys: [], multiple: false }}
          value={value}
          editing={false}
          onChange={() => {}}
        />
      );
    case "chart": {
      const data = (value as ChartDataPoint[]) ?? [];
      return data.length > 0 ? (
        <ChartView
          chartType={content.chartConfig?.chartType ?? "bar"}
          data={data}
          width={content.chartConfig?.width}
          height={content.chartConfig?.height}
          maxValue={content.chartConfig?.maxValue}
          axisMin={content.chartConfig?.axisMin}
          axisMax={content.chartConfig?.axisMax}
          yAxisMin={content.chartConfig?.yAxisMin}
          yAxisMax={content.chartConfig?.yAxisMax}
          numberLineMode={content.chartConfig?.numberLineMode}
          backgroundColor={content.chartConfig?.backgroundColor}
          branchStyle={content.chartConfig?.branchStyle}
          manualPositions={content.chartConfig?.manualPositions}
          series={content.chartConfig?.series}
        />
      ) : (
        empty
      );
    }
    case "nested":
      return (
        <NestedValuePicker
          worldId={worldId}
          config={content.nestedConfig ?? { mode: "manual", options: [] }}
          value={value as string[] | undefined}
          editing={false}
          onChange={() => {}}
        />
      );
    case "choice":
      return (
        <ChoiceValuePicker
          config={content.choiceConfig ?? { options: [] }}
          value={value}
          editing={false}
          onChange={() => {}}
        />
      );
    case "scale":
      return (
        <ScaleValuePicker
          config={content.scaleConfig ?? { mode: "linear", precision: "smooth", min: 0, max: 100 }}
          value={value}
          editing={false}
          onChange={() => {}}
        />
      );
    case "date":
      return (
        <DateFieldPicker
          config={content.dateConfig ?? { calendarId: "", mode: "single" }}
          value={value}
          editing={false}
          onChange={() => {}}
        />
      );
    default:
      return empty;
  }
}
