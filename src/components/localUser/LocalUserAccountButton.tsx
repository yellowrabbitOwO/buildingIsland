import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { getLocalUser } from "../../data/repositories/localUser";
import { useLocalUser } from "../../localUser";
import { useLanguage } from "../../i18n";
import AccountPopoverShell from "./AccountPopoverShell";

/** 帳號按鈕：頭貼＋名稱，點下去彈出頭貼／名稱／切換帳號——取代原本分開的
 * 「登出／切換帳號」按鈕，把帳號資訊收攏成一個入口。世界列表頁右上角使用（跟標題同一列）；
 * 雲端登入頁的對應功能改用 LastLocalUserButton（顯示「最近使用」帳號，不是「目前使用者」） */
export default function LocalUserAccountButton() {
  const { currentUserId, setCurrentUserId, setForcePicker } = useLocalUser();
  const currentLocalUser = useLiveQuery(() => (currentUserId ? getLocalUser(currentUserId) : undefined), [currentUserId]);
  const navigate = useNavigate();
  const { t } = useLanguage();

  if (!currentLocalUser) return null;

  return (
    <AccountPopoverShell avatar={currentLocalUser.avatar} name={currentLocalUser.name}>
      {(close) => (
        <button
          className="btn"
          style={{ width: "100%" }}
          onClick={() => {
            close();
            setForcePicker(true);
            setCurrentUserId(null);
            navigate("/");
          }}
        >
          {t("accountButton.signOutSwitch")}
        </button>
      )}
    </AccountPopoverShell>
  );
}
