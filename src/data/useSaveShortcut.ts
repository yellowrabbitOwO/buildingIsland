import { useEffect, useRef } from "react";
import { pushSaveHandler } from "../components/common/saveStack";

/** 掛上 Ctrl/Cmd+S 存檔快捷鍵（實際監聽邏輯在共用的 saveStack，見該檔案說明：只有堆疊最上層
 * 的處理函式會被呼叫，讓「頁面本身在編輯、上面又開了對話框」時不會兩邊同時存到）。
 *
 * 註冊進堆疊只在 enabled 從 false→true（或元件掛載時已是 true）那一刻做一次，依賴陣列鎖定在
 * [enabled]——比照 Modal.tsx 用 pushEscapeHandler 的寫法：若每次 render 都重新註冊（不看
 * enabled 變沒變），頁面本身用 useLiveQuery 之類的資料一有更新就會重新註冊一次，這時如果上面
 * 疊了一個對話框（對話框沒有重新 render），頁面反而會被擠到堆疊最上層，Ctrl+S 就變成存到頁面
 * 而不是使用者實際在操作的對話框——所以用 ref 保存最新的 onSave，堆疊裡放的是一個穩定的
 * wrapper，呼叫端不需要自己包 useCallback，也不會因為重新註冊而打亂堆疊順序。
 *
 * enabled 為 false（例如目前不在編輯模式、沒有可存的草稿）時完全不會註冊進堆疊。 */
export function useSaveShortcut(onSave: () => void, enabled: boolean) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  useEffect(() => {
    if (!enabled) return;
    return pushSaveHandler(() => onSaveRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
