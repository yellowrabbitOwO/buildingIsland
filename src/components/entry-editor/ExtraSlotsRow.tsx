import type { ChartFieldConfig, FieldDef, FieldType, FieldValue } from "../../data/types";
import { TYPE_LABELS } from "../../data/fieldTypeLabels";
import { FieldContentDisplay, FieldContentEditor } from "./FieldRenderer";
import FieldHint from "../common/FieldHint";
import { useLanguage } from "../../i18n";

interface ExtraSlotsRowProps {
  field: FieldDef;
  value: FieldValue | undefined;
  editing: boolean;
  worldId: string;
  currentEntryId?: string;
  onChangeSlotValue?: (slotId: string, value: unknown) => void;
  onChangeSlotType?: (slotId: string, type: FieldType) => void;
  onChangeSlotChartConfig?: (slotId: string, patch: Partial<ChartFieldConfig>) => void;
}

/** 渲染一個欄位實例的額外子值格（主值之外的部分），如「職業」欄位主值之外再掛的「年份」子值 */
export default function ExtraSlotsRow({
  field,
  value,
  editing,
  worldId,
  currentEntryId,
  onChangeSlotValue,
  onChangeSlotType,
  onChangeSlotChartConfig,
}: ExtraSlotsRowProps) {
  const { t } = useLanguage();
  const slots = field.extraSlots;
  if (!slots || slots.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 2, marginLeft: 16 }}>
      {slots.map((slot) => (
        <div key={slot.id} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
            {slot.label && (
              <span style={{ fontSize: 12, color: "var(--text-faint)", flexShrink: 0 }}>{slot.label}</span>
            )}
            {editing && onChangeSlotType && slot.allowedTypes && slot.allowedTypes.length > 1 && (
              <select
                value={slot.type}
                onChange={(e) => onChangeSlotType(slot.id, e.target.value as FieldType)}
                style={{ fontSize: 12, flexShrink: 0 }}
              >
                {slot.allowedTypes.map((ft) => (
                  <option key={ft} value={ft}>
                    {t(TYPE_LABELS[ft])}
                  </option>
                ))}
              </select>
            )}
            {editing ? (
              <FieldContentEditor
                content={slot}
                value={value?.extraSlotValues?.[slot.id]}
                worldId={worldId}
                currentEntryId={currentEntryId}
                onChange={(v) => onChangeSlotValue?.(slot.id, v)}
                onChartConfigChange={(patch) => onChangeSlotChartConfig?.(slot.id, patch)}
              />
            ) : (
              <FieldContentDisplay
                content={slot}
                value={value?.extraSlotValues?.[slot.id]}
                worldId={worldId}
                currentEntryId={currentEntryId}
              />
            )}
          </div>
          {editing && <FieldHint field={slot} />}
        </div>
      ))}
    </div>
  );
}
