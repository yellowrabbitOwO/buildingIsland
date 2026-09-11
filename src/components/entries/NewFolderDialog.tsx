import { useState } from "react";
import Modal from "../common/Modal";
import ColorInput from "../common/ColorInput";
import { useLanguage } from "../../i18n";

interface NewFolderDialogProps {
  worldId?: string;
  onClose: () => void;
  onSubmit: (input: { name: string; description?: string; tagColor?: string }) => void;
  title?: string;
  nameLabel?: string;
  submitLabel?: string;
  initial?: { name: string; description?: string; tagColor?: string };
  /** 沒有 initial.tagColor 時的起始顏色；資料夾預設金色方便一眼辨識。
   * 傳 null（而非直接省略，省略時預設參數不會生效於 null 以外的值）可改成透明起始，如關係圖標籤顏色 */
  defaultTagColor?: string | null;
}

export default function NewFolderDialog({
  worldId,
  onClose,
  onSubmit,
  title,
  nameLabel,
  submitLabel,
  initial,
  defaultTagColor = "#c9a463",
}: NewFolderDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [tagColor, setTagColor] = useState<string | undefined>(initial?.tagColor ?? defaultTagColor ?? undefined);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useLanguage();

  const handleSubmit = () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    onSubmit({ name: name.trim(), description: description.trim(), tagColor: tagColor || undefined });
  };

  return (
    <Modal title={title ?? t("newFolderDialog.title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {nameLabel ?? t("newFolderDialog.nameLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          {t("newFolderDialog.descLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <ColorInput label={t("worldEdit.tagColorLabel")} value={tagColor} onChange={setTagColor} allowClear worldId={worldId} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || submitting}>
            {submitLabel ?? t("common.create")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
