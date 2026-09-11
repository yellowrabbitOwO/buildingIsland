import { useState } from "react";
import Modal from "../common/Modal";
import ColorInput from "../common/ColorInput";
import type { Calendar, StoryChapterTemplate } from "../../data/types";
import { useLanguage } from "../../i18n";

interface NewStoryOutlineDialogProps {
  worldId: string;
  calendars: Calendar[];
  chapterTemplates: StoryChapterTemplate[];
  onClose: () => void;
  onSubmit: (input: { name: string; description?: string; tagColor?: string; calendarId?: string; chapterTemplateId?: string }) => void;
}

/** 新增章節大綱：比照 NewFolderDialog 多兩個選填下拉——曆法（跟 NewTimelineDialog 不同的是這裡
 * 曆法選填而非必選，「不使用曆法」讓時間類欄位只能填自由文字，建立後鎖定不可改，見
 * StoryOutline.calendarId 的欄位說明）跟章節範本（可隨時更換，不鎖定，見 chapterTemplateId 說明）。 */
export default function NewStoryOutlineDialog({ worldId, calendars, chapterTemplates, onClose, onSubmit }: NewStoryOutlineDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagColor, setTagColor] = useState<string | undefined>(undefined);
  const [calendarId, setCalendarId] = useState("");
  const [chapterTemplateId, setChapterTemplateId] = useState("");
  const { t } = useLanguage();

  return (
    <Modal title={t("newStoryOutlineDialog.title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {t("common.nameLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          {t("mapCreateDialog.descriptionLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          {t("newStoryOutlineDialog.calendarLabel")}
          <select style={{ width: "100%", marginTop: 4 }} value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
            <option value="">{t("newStoryOutlineDialog.noCalendarOption")}</option>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("newStoryOutlineDialog.chapterTemplateLabel")}
          <select style={{ width: "100%", marginTop: 4 }} value={chapterTemplateId} onChange={(e) => setChapterTemplateId(e.target.value)}>
            <option value="">{t("newStoryOutlineDialog.noTemplateOption")}</option>
            {chapterTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </label>
        <ColorInput label={t("worldEdit.tagColorLabel")} value={tagColor} onChange={setTagColor} allowClear worldId={worldId} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                description: description.trim() || undefined,
                tagColor,
                calendarId: calendarId || undefined,
                chapterTemplateId: chapterTemplateId || undefined,
              })
            }
          >
            {t("common.create")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
