import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { getLocalUser, updateLocalUser } from "../../data/repositories/localUser";
import { useLocalUser } from "../../localUser";
import { useLanguage } from "../../i18n";
import LocalUserAvatar from "./LocalUserAvatar";
import LocalUserEditDialog from "./LocalUserEditDialog";

/** 「目前使用者」區塊：頭像＋名稱、編輯、切換使用者，供帳號層級的 AccountSettingsPage 與
 * 世界內的 UserSettingsPage 共用，避免同一段 JSX 兩處各刻一次 */
export default function CurrentUserSection() {
  const { currentUserId, setCurrentUserId, setForcePicker } = useLocalUser();
  const currentLocalUser = useLiveQuery(() => (currentUserId ? getLocalUser(currentUserId) : undefined), [currentUserId]);
  const [showEditUser, setShowEditUser] = useState(false);
  const navigate = useNavigate();
  const { t } = useLanguage();

  if (!currentLocalUser) return null;

  return (
    <div>
      <h3 style={{ marginBottom: 8 }}>{t("currentUser.heading")}</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <LocalUserAvatar avatar={currentLocalUser.avatar} size={40} />
        <strong style={{ flex: 1 }}>{currentLocalUser.name}</strong>
        <button className="btn" onClick={() => setShowEditUser(true)}>
          {t("common.edit")}
        </button>
        <button
          className="btn"
          onClick={() => {
            setForcePicker(true);
            setCurrentUserId(null);
            navigate("/");
          }}
        >
          {t("currentUser.switchUser")}
        </button>
      </div>

      {showEditUser && (
        <LocalUserEditDialog
          user={currentLocalUser}
          onClose={() => setShowEditUser(false)}
          onSubmit={async (input) => {
            await updateLocalUser(currentLocalUser.id, input);
            setShowEditUser(false);
          }}
        />
      )}
    </div>
  );
}
