import { useState } from "react";
import Modal from "../common/Modal";
import { useConfirm } from "../common/ConfirmProvider";
import VersionHistoryDialog from "../common/VersionHistoryDialog";
import EntryTreePicker from "../storyboard/EntryTreePicker";
import FieldsList from "../entry-editor/FieldsList";
import AddFieldMenu from "../entry-editor/AddFieldMenu";
import AddFieldDialog from "../entry-editor/AddFieldDialog";
import DateValueEditor, { defaultValueFor } from "../common/DateValueEditor";
import ColorInput from "../common/ColorInput";
import { PALETTE } from "../common/GraphPrimitives";
import { DATE_MODE_LABELS } from "../../data/fieldTypeLabels";
import { buildInitialValues } from "../../data/fieldDefaults";
import { newId } from "../../data/db";
import { eventDate } from "../../data/repositories/timelineEvent";
import { updateCharacterBirthOrDeathDate } from "../../data/repositories/characterTimeline";
import { syncTimelineEventToEntry } from "../../data/repositories/timelineEventSync";
import { useSaveShortcut } from "../../data/useSaveShortcut";
import type { Calendar, DateFieldMode, DateFieldValue, DateTimePrecision, FieldDef, FieldValue, TimelineEvent } from "../../data/types";
import { useLanguage, type TranslationKey } from "../../i18n";

interface EventDraft {
  name: string;
  date: DateFieldValue;
  color?: string;
  fields: FieldDef[];
  values: Record<string, FieldValue>;
  relatedEntryIds: string[];
}

function draftFromEvent(event: TimelineEvent): EventDraft {
  return {
    name: event.name,
    date: eventDate(event),
    color: event.color,
    fields: event.fields,
    values: event.values,
    relatedEntryIds: event.relatedEntryIds,
  };
}

/** 找出 instanceId 該群組區塊最後一個欄位之後的插入位置；找不到則插到最後——
 * 比照 EntryPage.tsx 的同名私有函式，這裡的欄位陣列跟 Entry 一樣是 FieldDef[]，邏輯完全一樣 */
function insertAfterGroupIndex(fields: FieldDef[], instanceId: string): number {
  for (let i = fields.length - 1; i >= 0; i--) {
    if (fields[i].groupInstanceId === instanceId) return i + 1;
  }
  return fields.length;
}

/** 事件編輯彈窗：名稱／日期（依所選曆法的月份限制天數範圍）／相關資訊卡／自訂欄位。
 * 自訂欄位比照資訊卡的 FieldsList，但只做新增/刪除/改標籤/改值/拖曳排序跟群組的基本操作——
 * 圖表/刻度設定、複製欄位、群組合併這些進階功能留給之後有需要再補，不是這次「像資訊卡一樣
 * 能自訂欄位」的核心訴求。群組/模組選單只列 restrictedCategoryIds 為空的（AddFieldMenu 的
 * categoryId 篩選規則：categoryId 給假值時只會通過沒有分類限制的群組/模組），因為時間線事件
 * 不是分類，套用「限定特定分類」的群組模組語意上不合 */
export default function TimelineEventEditorModal({
  event,
  worldId,
  calendar,
  timePrecision,
  branchColor,
  onClose,
  onSave,
  onDelete,
}: {
  event: TimelineEvent;
  worldId: string;
  calendar: Calendar;
  timePrecision?: DateTimePrecision;
  /** 所在分支目前生效的顏色（未設定則分支本身也是用預設橘色），供事件顏色選擇器顯示「留空時實際
   * 會是這個顏色」，而不是格狀的「未設定」圖案——分支的線從來就不是真的沒有顏色 */
  branchColor?: string;
  onClose: () => void;
  onSave: (patch: Partial<Omit<TimelineEvent, "id" | "timelineId" | "worldId" | "branchId" | "createdAt">>) => void;
  onDelete: () => void;
}) {
  const confirm = useConfirm();
  const { t } = useLanguage();
  const [draft, setDraft] = useState<EventDraft>(() => draftFromEvent(event));
  // 「同步建立/更新事件資訊卡」勾選框，預設勾選；取消後存檔只會解除連結（見 syncTimelineEventToEntry），
  // 不會刪掉已經建立的資訊卡本身
  const [syncToEntry, setSyncToEntry] = useState(true);
  const [showAddField, setShowAddField] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [addFieldGroupTarget, setAddFieldGroupTarget] = useState<{ instanceId: string; label: string; insertAfterInstanceId?: string } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFromEvent(event));

  const isAutoSynced = !!event.autoKind;
  // 出生/死亡事件的日期可以直接在這裡改（改了會寫回角色資訊卡的出生日期欄位，見 handleSave）；
  // 受孕事件是從出生日期＋孕期長度推算出來的，沒有獨立的值可以改，維持鎖定
  const dateEditableForAutoSync = event.autoKind === "birth" || event.autoKind === "death";

  const requestClose = async () => {
    if (dirty) {
      const ok = await confirm({
        title: t("timelineEventEditorModal.discardConfirm.title"),
        message: t("timelineEventEditorModal.discardConfirm.message"),
        confirmLabel: t("timelineEventEditorModal.discardConfirm.confirmLabel"),
      });
      if (!ok) return;
    }
    onClose();
  };

  const handleSave = async () => {
    if (isAutoSynced) {
      // 出生/死亡/受孕事件的名稱與日期都不是使用者在這裡直接填的值（受孕是從出生日期＋孕期長度推算，
      // 沒有獨立的值可以改），一律不能走下面一般事件的 syncTimelineEventToEntry 流程，否則會平白建立/
      // 更新一張「事件」分類的資訊卡。名稱/日期以外的內容（顏色、自訂欄位、相關資訊卡）照一般流程存——
      // onSave 底層是合併 patch，不會覆蓋掉還沒存的日期
      onSave({ color: draft.color, fields: draft.fields, values: draft.values, relatedEntryIds: draft.relatedEntryIds });
      if (dateEditableForAutoSync && draft.date.mode === "single") {
        // 出生/死亡的日期可以直接在這裡改，改用 updateCharacterBirthOrDeathDate 寫回角色資訊卡的出生
        // 日期欄位，再由它觸發 syncCharacterTimeline 整條重新同步（含這個事件本身的名稱/日期）
        const entryId = event.relatedEntryIds[0];
        if (entryId) {
          await updateCharacterBirthOrDeathDate(entryId, event.autoKind as "birth" | "death", calendar, draft.date);
        }
      }
      onClose();
      return;
    }
    const name = draft.name.trim() || t("timeline.defaultEventName");
    const linkedEntryId = await syncTimelineEventToEntry(worldId, { name, date: draft.date, linkedEntryId: event.linkedEntryId }, syncToEntry);
    onSave({
      name,
      date: draft.date,
      color: draft.color,
      fields: draft.fields,
      values: draft.values,
      relatedEntryIds: draft.relatedEntryIds,
      linkedEntryId,
    });
    onClose();
  };
  // Ctrl/Cmd+S：對話框開著時直接存檔並關閉，行為等同按下方的「儲存」按鈕
  useSaveShortcut(handleSave, true);

  const handleDelete = async () => {
    const ok = await confirm({
      title: t("timelineEventEditorModal.deleteConfirm.title"),
      message: t("entryCard.deleteConfirm.message", { name: event.name }),
    });
    if (!ok) return;
    onDelete();
    onClose();
  };

  const addFields = (fields: FieldDef[]) => {
    setDraft((prev) => {
      const tagged = addFieldGroupTarget
        ? fields.map((f) => ({ ...f, groupInstanceId: addFieldGroupTarget.instanceId, groupLabel: addFieldGroupTarget.label }))
        : fields;
      const afterInstanceId = addFieldGroupTarget?.insertAfterInstanceId;
      const insertAt = afterInstanceId ? insertAfterGroupIndex(prev.fields, afterInstanceId) : prev.fields.length;
      return {
        ...prev,
        fields: [...prev.fields.slice(0, insertAt), ...tagged, ...prev.fields.slice(insertAt)],
        values: buildInitialValues(tagged, prev.values),
      };
    });
    setShowAddField(false);
    setAddFieldGroupTarget(null);
  };

  return (
    <Modal title={t("timelineEventEditorModal.title")} onClose={requestClose} width={720}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {isAutoSynced && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
            {dateEditableForAutoSync
              ? t("timelineEventEditorModal.autoSyncEditableHint")
              : t("timelineEventEditorModal.autoSyncLockedHint")}
          </p>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {t("common.nameLabel")}
          <input
            autoFocus
            value={draft.name}
            disabled={isAutoSynced}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </label>
        <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
          {(Object.entries(DATE_MODE_LABELS) as [DateFieldMode, TranslationKey][]).map(([mode, key]) => (
            <label key={mode} style={{ display: "flex", alignItems: "center", gap: 4, opacity: isAutoSynced ? 0.5 : 1 }}>
              <input
                type="radio"
                disabled={isAutoSynced}
                checked={draft.date.mode === mode}
                onChange={() => setDraft((d) => ({ ...d, date: d.date.mode === mode ? d.date : defaultValueFor(mode) }))}
              />
              {t(key)}
            </label>
          ))}
        </div>
        <DateValueEditor
          calendar={calendar}
          mode={draft.date.mode}
          precision={timePrecision}
          value={draft.date}
          editing={!isAutoSynced || dateEditableForAutoSync}
          onChange={(date) => setDraft((d) => ({ ...d, date }))}
        />
        <ColorInput
          label={t("timelineEventEditorModal.colorLabel")}
          value={draft.color}
          onChange={(color) => setDraft((d) => ({ ...d, color: color || undefined }))}
          allowClear
          worldId={worldId}
          fallbackColor={branchColor ?? PALETTE[0]}
          fallbackLabel={t("timelineEventEditorModal.branchFallbackLabel")}
        />
        {!isAutoSynced && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={syncToEntry} onChange={(e) => setSyncToEntry(e.target.checked)} />
            {t("timelineEventEditorModal.syncToEntryCheckbox")}
          </label>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {t("timelineEventEditorModal.relatedEntriesLabel")}
          <EntryTreePicker
            worldId={worldId}
            value={draft.relatedEntryIds}
            onChange={(ids) => setDraft((d) => ({ ...d, relatedEntryIds: ids }))}
          />
        </label>

        <FieldsList
          fields={draft.fields}
          values={draft.values}
          editing
          worldId={worldId}
          onChangeValue={(fieldId, value) =>
            setDraft((prev) => ({ ...prev, values: { ...prev.values, [fieldId]: { ...prev.values[fieldId], current: value } } }))
          }
          onRemoveField={(fieldId) =>
            setDraft((prev) => {
              const fields = prev.fields.filter((f) => f.id !== fieldId);
              const values = { ...prev.values };
              delete values[fieldId];
              return { ...prev, fields, values };
            })
          }
          onRelabelField={(fieldId, label) =>
            setDraft((prev) => ({ ...prev, fields: prev.fields.map((f) => (f.id === fieldId ? { ...f, label } : f)) }))
          }
          onRelabelGroup={(groupInstanceId, label) =>
            setDraft((prev) => ({
              ...prev,
              fields: prev.fields.map((f) => (f.groupInstanceId === groupInstanceId ? { ...f, groupLabel: label } : f)),
            }))
          }
          onAddFieldToGroup={(groupInstanceId, groupLabel) => {
            setAddFieldGroupTarget({ instanceId: groupInstanceId, label: groupLabel });
            setShowAddField(true);
          }}
          onAddBlankGroupAfter={(afterInstanceId) => {
            setAddFieldGroupTarget({ instanceId: newId(), label: t("entryPage.newGroupLabel"), insertAfterInstanceId: afterInstanceId });
            setShowAddField(true);
          }}
          onReorderFields={(newFields) => setDraft((prev) => ({ ...prev, fields: newFields }))}
        />

        <AddFieldMenu
          worldId={worldId}
          categoryId=""
          onAddSingleField={() => setShowAddField(true)}
          onAddBlankGroup={() => {
            setAddFieldGroupTarget({ instanceId: newId(), label: t("entryPage.newGroupLabel") });
            setShowAddField(true);
          }}
          onAddExpanded={addFields}
        />

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-danger" onClick={handleDelete}>
              {t("timelineEventEditorModal.deleteButton")}
            </button>
            <button className="btn" onClick={() => setShowHistory(true)}>
              {t("common.versionHistory")}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={requestClose}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              {t("common.save")}
            </button>
          </div>
        </div>
      </div>

      {showAddField && (
        <AddFieldDialog
          worldId={worldId}
          onClose={() => {
            setShowAddField(false);
            setAddFieldGroupTarget(null);
          }}
          onSubmit={(f) => addFields([f])}
        />
      )}
      {showHistory && <VersionHistoryDialog entityType="timelineEvents" entityId={event.id} onClose={() => setShowHistory(false)} />}
    </Modal>
  );
}
