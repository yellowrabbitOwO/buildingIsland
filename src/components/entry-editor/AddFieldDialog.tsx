import { useEffect, useState } from "react";
import Modal from "../common/Modal";
import { newId } from "../../data/db";
import type { FieldDef, FieldSlotDef } from "../../data/types";
import { createDefaultFieldSlot, seedMissingConfigs } from "../../data/fieldSlotDefaults";
import FieldSlotEditor from "./FieldSlotEditor";
import { useSaveShortcut } from "../../data/useSaveShortcut";
import { useLanguage } from "../../i18n";

interface AddFieldDialogProps {
  worldId: string;
  /** 若提供，代表編輯既有欄位（保留原本的 id／key），而非新增 */
  field?: FieldDef;
  onClose: () => void;
  onSubmit: (field: FieldDef) => void;
}

/** 既有欄位的主要內容轉換成子值格的形狀，供與額外子值格共用同一份編輯 UI；
 * 依目前已選型態補齊缺少的設定（相容於改版前建立、可能缺設定的舊欄位） */
function fieldToPrimarySlot(field: FieldDef): FieldSlotDef {
  const types = field.allowedTypes && field.allowedTypes.length > 0 ? field.allowedTypes : [field.type];
  return seedMissingConfigs(
    {
      id: newId(),
      type: field.type,
      hint: field.hint,
      allowedTypes: field.allowedTypes,
      numberConfig: field.numberConfig,
      entryLinkConfig: field.entryLinkConfig,
      chartConfig: field.chartConfig,
      nestedConfig: field.nestedConfig,
      choiceConfig: field.choiceConfig,
      scaleConfig: field.scaleConfig,
      dateConfig: field.dateConfig,
    },
    types
  );
}

export default function AddFieldDialog({ worldId, field, onClose, onSubmit }: AddFieldDialogProps) {
  const { t } = useLanguage();
  const [label, setLabel] = useState(field?.label ?? "");
  const [slots, setSlots] = useState<FieldSlotDef[]>(() => [
    field ? fieldToPrimarySlot(field) : createDefaultFieldSlot(),
    ...(field?.extraSlots ?? []),
  ]);
  const [error, setError] = useState<string | null>(null);

  // 子值格數量輸入框用獨立的文字狀態暫存：若直接綁定 slots.length，打多位數字時每敲一鍵
  // 都會觸發一次截斷（例如要打「25」，敲下「2」會先把格數砍到 2，永久遺失第 3 格以後的設定），
  // 因此輸入時只更新這裡的文字，離開焦點／按 Enter 才真正提交裁切；slots.length 變動時（含提交、或移除子值格）同步回顯示文字
  const [slotCountText, setSlotCountText] = useState(String(slots.length));
  useEffect(() => setSlotCountText(String(slots.length)), [slots.length]);

  const setSlotCount = (n: number) => {
    const count = Math.max(1, Math.min(51, Math.floor(n) || 1));
    setSlots((prev) => {
      if (count === prev.length) return prev;
      if (count < prev.length) return prev.slice(0, count);
      const additions = Array.from({ length: count - prev.length }, () => createDefaultFieldSlot());
      return [...prev, ...additions];
    });
  };
  const commitSlotCount = () => setSlotCount(Number(slotCountText));
  const updateSlot = (index: number, patch: Partial<FieldSlotDef>) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  const removeSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!label.trim()) {
      setError(t("addFieldDialog.errors.nameRequired"));
      return;
    }
    const missingCalendarSlot = slots.find((s) => {
      const types = s.allowedTypes && s.allowedTypes.length > 0 ? s.allowedTypes : [s.type];
      return types.includes("date") && !s.dateConfig?.calendarId;
    });
    if (missingCalendarSlot) {
      setError(t("common.calendarRequiredError"));
      return;
    }
    setError(null);
    const primary = slots[0];
    const primaryTypes = primary.allowedTypes && primary.allowedTypes.length > 0 ? primary.allowedTypes : [primary.type];
    const extraSlots = slots.slice(1);
    const updated: FieldDef = {
      id: field?.id ?? newId(),
      key: field?.key ?? `custom_${newId().slice(0, 8)}`,
      label: label.trim(),
      type: primary.type,
      hint: primary.hint,
      allowedTypes: primary.allowedTypes,
      numberConfig: primaryTypes.includes("number") ? primary.numberConfig : undefined,
      entryLinkConfig: primaryTypes.includes("entryLink") ? primary.entryLinkConfig : undefined,
      chartConfig: primaryTypes.includes("chart") ? primary.chartConfig : undefined,
      nestedConfig: primaryTypes.includes("nested") ? primary.nestedConfig : undefined,
      choiceConfig: primaryTypes.includes("choice") ? primary.choiceConfig : undefined,
      scaleConfig: primaryTypes.includes("scale") ? primary.scaleConfig : undefined,
      dateConfig: primaryTypes.includes("date") ? primary.dateConfig : undefined,
      extraSlots: extraSlots.length > 0 ? extraSlots : undefined,
    };
    onSubmit(updated);
  };
  // Ctrl/Cmd+S：對話框開著時直接送出，行為等同按下方的「儲存／新增」按鈕
  useSaveShortcut(handleSubmit, true);

  return (
    <Modal title={field ? t("addFieldDialog.titleEdit") : t("addFieldDialog.titleNew")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {t("addFieldDialog.nameLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </label>
        <label>
          {t("addFieldDialog.slotCountLabel")}
          <input
            type="number"
            min={1}
            max={51}
            style={{ width: 80, marginTop: 4, display: "block" }}
            value={slotCountText}
            onChange={(e) => setSlotCountText(e.target.value)}
            onBlur={commitSlotCount}
            onKeyDown={(e) => e.key === "Enter" && commitSlotCount()}
          />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {slots.map((slot, i) => (
            <FieldSlotEditor
              key={i === 0 ? "primary" : slot.id}
              worldId={worldId}
              slot={slot}
              isPrimary={i === 0}
              onChange={(patch) => updateSlot(i, patch)}
              onRemove={() => removeSlot(i)}
            />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          {error && (
            <span style={{ color: "var(--danger, #e08283)", fontSize: 12, marginRight: "auto" }}>{error}</span>
          )}
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {field ? t("common.save") : t("addFieldDialog.submitAdd")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
