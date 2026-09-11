import { useEffect, useRef, useState } from "react";
import { useTheme } from "../theme";
import { useLanguage, type Language } from "../i18n";
import { useLocalUser } from "../localUser";
import { listLocalUsers, createLocalUser } from "../data/repositories/localUser";
import LocalUserSelectPage from "./LocalUserSelectPage";
import LastLocalUserButton from "../components/localUser/LastLocalUserButton";

/** app 進來的第一個畫面（見規格文件「帳號與世界系統」的「主畫面」）。雲端帳號（Google／Apple）
 * 是唯一真正的「登入」概念，還沒做，先用停用按鈕＋「即將推出」標示佔位；本地使用者不是跟雲端
 * 平起平坐的另一種登入方式，只是「這台裝置上的本機資料」，見 LocalUser 型別完整說明。
 *
 * 「略過登入，使用本機」點下去的邏輯（見 handleUseLocal）：裝置上如果完全沒有本地使用者就自動建
 * 一個；剛好只有一個就直接用他，不會多此一舉跳出來問——反正沒有雲端帳號可以「切換」，多問一次
 * 選擇畫面沒有意義；只有真的存在兩個以上本地使用者時才顯示選擇畫面。
 *
 * 從 WorldListPage／UserSettingsPage「登出／切換帳號」點過來時，`useLocalUser().forcePicker`
 * 會是 true——這種情況是使用者明確想「切換／管理」本地使用者，不管有幾個都直接顯示完整的
 * 選擇畫面（含新增/編輯/刪除），不套用上面的自動略過邏輯 */
export default function MainPage() {
  const { setCurrentUserId, forcePicker, setForcePicker } = useLocalUser();
  const [showLocalUsers, setShowLocalUsers] = useState(forcePicker);
  const [resolving, setResolving] = useState(false);
  // resolvingRef（而不是只看 resolving state）：state 要等重新 render 才會反映到畫面／被下一次
  // 呼叫的 closure 讀到，兩次點擊之間如果快到還沒 render 完，兩次呼叫讀到的 resolving 可能都還是
  // 舊的 false，state 擋不住；ref 是同一個物件、寫入立即對所有 closure 可見，才能真正防連點兩次
  // 建出兩個重複的預設使用者
  const resolvingRef = useRef(false);
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  // 掛載當下的 useState(forcePicker) 初始值已經吃到旗標了，這裡消費掉、恢復成 false，
  // 避免下次「登出／切換帳號」設回 true 之前，這個旗標一直殘留著；放進 useEffect（而不是直接在
  // render body 呼叫）是因為 setForcePicker 屬於 LocalUserProvider 這個不同元件的 state，
  // render 期間呼叫別的元件的 setState 會被 React 視為違規（"Cannot update a component while
  // rendering a different component"），只有呼叫自己這個元件的 setState 才允許在 render 期間做
  useEffect(() => {
    if (forcePicker) setForcePicker(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUseLocal = async () => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setResolving(true);
    try {
      const users = await listLocalUsers();
      if (users.length === 0) {
        const user = await createLocalUser({ name: t("mainPage.defaultUserName") });
        setCurrentUserId(user.id);
      } else if (users.length === 1) {
        setCurrentUserId(users[0].id);
      } else {
        setShowLocalUsers(true);
      }
    } finally {
      resolvingRef.current = false;
      setResolving(false);
    }
  };

  if (showLocalUsers) {
    return <LocalUserSelectPage onBack={() => setShowLocalUsers(false)} />;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: 16 }}>
        <LastLocalUserButton onSwitch={() => setShowLocalUsers(true)} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: 24 }}>
        <h1>Building Island</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 280 }}>
          <button className="btn" disabled title={t("mainPage.comingSoon")}>
            {t("mainPage.googleLogin")}
          </button>
          <button className="btn" disabled title={t("mainPage.comingSoon")}>
            {t("mainPage.appleLogin")}
          </button>
        </div>
        <button className="btn-ghost" onClick={handleUseLocal} disabled={resolving}>
          {t("mainPage.skipLogin")}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 16 }}>
        <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
          <option value="zh-TW">繁體中文</option>
          <option value="en">English</option>
        </select>
        <button className="btn" onClick={toggleTheme} title={t("common.toggleDisplayMode")}>
          {theme === "dark" ? "🌙" : "☀️"}
        </button>
      </div>
    </div>
  );
}
