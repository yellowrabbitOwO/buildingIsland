import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { listLocalUsers, createLocalUser, updateLocalUser, deleteLocalUser } from "../data/repositories/localUser";
import { isColorValue } from "../data/colorResolve";
import ResolvedColor from "../components/common/ResolvedColor";
import LocalUserEditDialog from "../components/localUser/LocalUserEditDialog";
import { useConfirm } from "../components/common/ConfirmProvider";
import { useLocalUser } from "../localUser";
import { useLanguage } from "../i18n";
import type { LocalUser } from "../data/types";

interface LocalUserSelectPageProps {
  /** 從 MainPage「使用本地帳號」點進來時提供，讓使用者可以回到主畫面重新選登入方式 */
  onBack?: () => void;
}

/** 選一個本地使用者才會進入他名下的世界列表，避免同一台裝置給多人共用時互相看到彼此的世界。
 * 是 MainPage「使用本地帳號」點下去之後的下一步，不是 app 的第一個畫面（見 MainPage.tsx） */
export default function LocalUserSelectPage({ onBack }: LocalUserSelectPageProps) {
  const users = useLiveQuery(() => listLocalUsers(), []);
  const { setCurrentUserId } = useLocalUser();
  const confirm = useConfirm();
  const { t } = useLanguage();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<LocalUser | null>(null);
  const [creating, setCreating] = useState(false);

  const handleDelete = async (user: LocalUser) => {
    const ok = await confirm({
      title: t("localUserSelect.deleteConfirm.title"),
      message: t("localUserSelect.deleteConfirm.message", { name: user.name }),
    });
    if (!ok) return;
    await deleteLocalUser(user.id);
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
      {onBack && (
        <button className="btn-ghost" style={{ padding: 0, marginBottom: 16 }} onClick={onBack}>
          {t("localUserSelect.back")}
        </button>
      )}
      <h1 style={{ marginBottom: 8 }}>{t("localUserSelect.heading")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>{t("localUserSelect.subheading")}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {users?.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("localUserSelect.empty")}</p>}
        {(users ?? []).map((user) => (
          <div
            key={user.id}
            className="card"
            style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, cursor: "pointer" }}
            onClick={() => setCurrentUserId(user.id)}
          >
            {isColorValue(user.avatar) ? (
              <ResolvedColor value={user.avatar}>
                {(hex) => <div style={{ width: 48, height: 48, borderRadius: "50%", background: hex ?? "var(--bg-hover)", flexShrink: 0 }} />}
              </ResolvedColor>
            ) : user.avatar ? (
              <img src={user.avatar} alt="" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--bg-hover)", flexShrink: 0 }} />
            )}
            <strong style={{ flex: 1 }}>{user.name}</strong>
            <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
              <button className="btn" onClick={() => setEditing(user)}>
                {t("common.edit")}
              </button>
              <button className="btn btn-danger" onClick={() => handleDelete(user)}>
                {t("common.delete")}
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
        {t("localUserSelect.addUser")}
      </button>

      {showCreate && (
        <LocalUserEditDialog
          onClose={() => !creating && setShowCreate(false)}
          onSubmit={async (input) => {
            setCreating(true);
            const user = await createLocalUser(input);
            setShowCreate(false);
            setCreating(false);
            setCurrentUserId(user.id);
          }}
        />
      )}
      {editing && (
        <LocalUserEditDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            await updateLocalUser(editing.id, input);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
