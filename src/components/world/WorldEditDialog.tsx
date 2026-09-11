import { useState } from "react";
import Modal from "../common/Modal";
import ColorInput from "../common/ColorInput";
import type { World } from "../../data/types";
import { useSaveShortcut } from "../../data/useSaveShortcut";
import VersionHistoryDialog from "../common/VersionHistoryDialog";
import { useLanguage } from "../../i18n";

interface WorldEditDialogProps {
  world?: World;
  onClose: () => void;
  onSubmit: (input: { name: string; description?: string; coverColor?: string; tagColor?: string }) => void;
}

export default function WorldEditDialog({ world, onClose, onSubmit }: WorldEditDialogProps) {
  const [name, setName] = useState(world?.name ?? "");
  const [description, setDescription] = useState(world?.description ?? "");
  const [coverColor, setCoverColor] = useState(world?.coverColor ?? "#4a5a6a");
  const [tagColor, setTagColor] = useState(world?.tagColor ?? "#c9a463");
  const [showHistory, setShowHistory] = useState(false);
  const { t } = useLanguage();

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim(), coverColor, tagColor });
  };
  // Ctrl/Cmd+S：對話框開著時直接送出，行為等同按下方的「儲存／建立」按鈕
  useSaveShortcut(handleSubmit, true);

  return (
    <Modal title={world ? t("worldEdit.editTitle") : t("common.createWorld")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {t("worldEdit.nameLabel")}
          <input
            style={{ width: "100%", marginTop: 4 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("worldEdit.namePlaceholder")}
            autoFocus
          />
        </label>
        <label>
          {t("worldEdit.descLabel")}
          <textarea
            style={{ width: "100%", marginTop: 4, minHeight: 70 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("worldEdit.descPlaceholder")}
          />
        </label>
        <div style={{ display: "flex", gap: 24 }}>
          <ColorInput label={t("worldEdit.coverColorLabel")} value={coverColor} onChange={setCoverColor} worldId={world?.id} />
          <ColorInput label={t("worldEdit.tagColorLabel")} value={tagColor} onChange={setTagColor} worldId={world?.id} />
        </div>
        <div style={{ display: "flex", justifyContent: world ? "space-between" : "flex-end", gap: 8, marginTop: 8 }}>
          {world && (
            <button className="btn" onClick={() => setShowHistory(true)}>
              {t("common.versionHistory")}
            </button>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim()}>
              {world ? t("common.save") : t("common.create")}
            </button>
          </div>
        </div>
      </div>
      {world && showHistory && <VersionHistoryDialog entityType="worlds" entityId={world.id} onClose={() => setShowHistory(false)} />}
    </Modal>
  );
}
