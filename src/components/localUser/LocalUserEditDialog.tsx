import { useState } from "react";
import Modal from "../common/Modal";
import ColorInput from "../common/ColorInput";
import ImageUpload from "../common/ImageUpload";
import type { LocalUser } from "../../data/types";
import { isColorValue } from "../../data/colorResolve";
import { useSaveShortcut } from "../../data/useSaveShortcut";
import { useLanguage } from "../../i18n";

interface LocalUserEditDialogProps {
  user?: LocalUser;
  onClose: () => void;
  onSubmit: (input: { name: string; avatar?: string }) => void;
}

/** 建立／編輯本地使用者：名稱＋頭像（圖片或純色，跟 EntryPage.tsx「插入頭像」同一套
 * isColorValue() 判斷寫法），結構仿 WorldEditDialog.tsx */
export default function LocalUserEditDialog({ user, onClose, onSubmit }: LocalUserEditDialogProps) {
  const [name, setName] = useState(user?.name ?? "");
  const [avatar, setAvatar] = useState(user?.avatar);
  const { t } = useLanguage();

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), avatar });
  };
  useSaveShortcut(handleSubmit, true);

  return (
    <Modal title={user ? t("localUserEdit.editTitle") : t("localUserEdit.createTitle")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {t("localUserEdit.nameLabel")}
          <input
            style={{ width: "100%", marginTop: 4 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("localUserEdit.namePlaceholder")}
            autoFocus
          />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className={!isColorValue(avatar) ? "btn btn-primary" : "btn"}
              disabled={!isColorValue(avatar)}
              onClick={() => setAvatar(undefined)}
            >
              {t("localUserEdit.avatarImage")}
            </button>
            <button
              className={isColorValue(avatar) ? "btn btn-primary" : "btn"}
              disabled={isColorValue(avatar)}
              onClick={() => setAvatar("#888888")}
            >
              {t("localUserEdit.avatarColor")}
            </button>
          </div>
          {isColorValue(avatar) ? (
            <ColorInput value={avatar} onChange={setAvatar} />
          ) : (
            <ImageUpload value={avatar} onChange={setAvatar} label={t("localUserEdit.avatarLabel")} />
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim()}>
            {user ? t("common.save") : t("common.create")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
