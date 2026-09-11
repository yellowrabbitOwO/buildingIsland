import { useState } from "react";
import Modal from "../common/Modal";
import ColorInput from "../common/ColorInput";
import type { Scope } from "../../data/types";
import { useLanguage } from "../../i18n";

interface CreateFolderDialogProps {
  worldId?: string;
  onClose: () => void;
  onSubmit: (input: { name: string; scope: Scope; tagColor: string }) => void;
}

export default function CreateFolderDialog({ worldId, onClose, onSubmit }: CreateFolderDialogProps) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>("world");
  const [tagColor, setTagColor] = useState("#c9a463");
  const { t } = useLanguage();

  return (
    <Modal title={t("newFolderDialog.title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {t("newFolderDialog.nameLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          {t("createFolderDialog.scopeLabel")}
          <select style={{ width: "100%", marginTop: 4 }} value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="world">{t("templateManagerPage.scopeSingleWorld")}</option>
            <option value="global">{t("managerFolder.globalScopeOption")}</option>
          </select>
        </label>
        <ColorInput label={t("worldEdit.tagColorLabel")} value={tagColor} onChange={setTagColor} worldId={worldId} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" disabled={!name.trim()} onClick={() => onSubmit({ name: name.trim(), scope, tagColor })}>
            {t("common.create")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
