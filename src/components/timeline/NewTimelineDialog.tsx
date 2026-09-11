import { useState } from "react";
import Modal from "../common/Modal";
import ColorInput from "../common/ColorInput";
import type { Calendar } from "../../data/types";
import { useLanguage } from "../../i18n";

interface NewTimelineDialogProps {
  worldId: string;
  calendars: Calendar[];
  onClose: () => void;
  onSubmit: (input: { name: string; description?: string; tagColor?: string; calendarId: string }) => void;
}

/** 新增時間線：跟一般的 NewFolderDialog（名稱／簡介／標籤色）多一個必選的曆法下拉——
 * 不直接沿用 NewFolderDialog 是因為曆法選擇是時間線專屬的，硬塞進那個通用元件反而破壞它的泛用性 */
export default function NewTimelineDialog({ worldId, calendars, onClose, onSubmit }: NewTimelineDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagColor, setTagColor] = useState<string | undefined>(undefined);
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const { t } = useLanguage();

  const canSubmit = name.trim().length > 0 && calendarId.length > 0;

  return (
    <Modal title={t("newTimelineDialog.title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {t("common.nameLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          {t("newFolderDialog.descLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          {t("fieldSlotEditor.calendarLabel")}
          <select style={{ width: "100%", marginTop: 4 }} value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <ColorInput label={t("worldEdit.tagColorLabel")} value={tagColor} onChange={(c) => setTagColor(c || undefined)} allowClear worldId={worldId} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            className="btn btn-primary"
            disabled={!canSubmit}
            onClick={() => onSubmit({ name: name.trim(), description: description.trim() || undefined, tagColor, calendarId })}
          >
            {t("common.create")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
