import { useLiveQuery } from "dexie-react-hooks";
import { getLocalUser } from "../../data/repositories/localUser";
import { useLocalUser } from "../../localUser";
import { useLanguage } from "../../i18n";
import AccountPopoverShell from "./AccountPopoverShell";

interface LastLocalUserButtonProps {
  /** 使用者想換一個帳號時呼叫——交給 MainPage 打開完整的「選擇本地使用者」畫面 */
  onSwitch: () => void;
}

/** 登入畫面（MainPage）右上角：顯示這台裝置上「最近使用」的本地帳號（見 localUser.tsx 的
 * lastLocalUserId，跟目前使用中的 currentUserId 是分開追蹤的，登出／返回主畫面不會清掉），
 * 讓使用者不用每次都重新走一次「略過登入」流程；同時提供「更換帳號」，需要用別的本地帳號時
 * 可以直接切換，不受限於這個捷徑 */
export default function LastLocalUserButton({ onSwitch }: LastLocalUserButtonProps) {
  const { lastLocalUserId, setCurrentUserId } = useLocalUser();
  const lastUser = useLiveQuery(() => (lastLocalUserId ? getLocalUser(lastLocalUserId) : undefined), [lastLocalUserId]);
  const { t } = useLanguage();

  if (!lastUser) return null;

  return (
    <AccountPopoverShell avatar={lastUser.avatar} name={lastUser.name}>
      {(close) => (
        <>
          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={() => {
              close();
              setCurrentUserId(lastUser.id);
            }}
          >
            {t("lastAccountButton.continueAsThis")}
          </button>
          <button
            className="btn"
            style={{ width: "100%" }}
            onClick={() => {
              close();
              onSwitch();
            }}
          >
            {t("lastAccountButton.switchAccount")}
          </button>
        </>
      )}
    </AccountPopoverShell>
  );
}
