import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface LocalUserContextValue {
  currentUserId: string | null;
  setCurrentUserId: (id: string | null) => void;
  /** 這台裝置上最近一次「變成目前使用者」的本地使用者 id——跟 currentUserId 不同，登出／
   * 返回主畫面（currentUserId 變 null）不會清掉這個值，讓登入畫面能顯示「以上次的帳號繼續」
   * 這個捷徑。只在 setCurrentUserId 被呼叫且傳入非 null 值時更新（見下方 setCurrentUserId 包裝），
   * 該本地使用者被刪除時不用特地清掉——MainPage 那端用 getLocalUser() 查不到就自然不顯示 */
  lastLocalUserId: string | null;
  /** 「登出／切換帳號」按下時設成 true：讓 MainPage 直接顯示本地使用者選擇畫面，跳過「裝置上只有
   * 一個本地使用者就自動選用、不用問」那套略過登入的邏輯（不然明明是想切換/管理帳號，畫面卻自動
   * 選回同一個使用者、像沒反應一樣）。原本想靠 react-router 的 navigate(path, {state}) 傳這個旗標，
   * 但 currentUserId 變 null（觸發 HomeGate 把 WorldListPage 換成 MainPage）跟 navigate() 更新
   * location.state 是兩個互相獨立的狀態來源，同一個事件處理常式裡呼叫兩者時，MainPage 掛載當下
   * 讀到的 location.state 時機不可靠（實測會讀到舊值）；改成同一個 Context 裡的旗標，
   * 保證跟 currentUserId 同一批 state 更新一起生效，MainPage 掛載時讀到的一定是最新值 */
  forcePicker: boolean;
  setForcePicker: (v: boolean) => void;
}

const LocalUserContext = createContext<LocalUserContextValue | null>(null);

const STORAGE_KEY = "building-island-local-user";
const LAST_USER_STORAGE_KEY = "building-island-last-local-user";

export function LocalUserProvider({ children }: { children: ReactNode }) {
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [lastLocalUserId, setLastLocalUserId] = useState<string | null>(() => localStorage.getItem(LAST_USER_STORAGE_KEY));
  const [forcePicker, setForcePicker] = useState(false);

  const setCurrentUserId = (id: string | null) => {
    setCurrentUserIdState(id);
    if (id) setLastLocalUserId(id);
  };

  useEffect(() => {
    if (currentUserId) localStorage.setItem(STORAGE_KEY, currentUserId);
    else localStorage.removeItem(STORAGE_KEY);
  }, [currentUserId]);

  useEffect(() => {
    if (lastLocalUserId) localStorage.setItem(LAST_USER_STORAGE_KEY, lastLocalUserId);
    else localStorage.removeItem(LAST_USER_STORAGE_KEY);
  }, [lastLocalUserId]);

  return (
    <LocalUserContext.Provider value={{ currentUserId, setCurrentUserId, lastLocalUserId, forcePicker, setForcePicker }}>
      {children}
    </LocalUserContext.Provider>
  );
}

export function useLocalUser(): LocalUserContextValue {
  const ctx = useContext(LocalUserContext);
  if (!ctx) throw new Error("useLocalUser 必須在 LocalUserProvider 內使用");
  return ctx;
}
