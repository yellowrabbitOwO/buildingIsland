type SaveFn = () => void;

/** 目前「可以用 Ctrl/Cmd+S 存檔」的處理函式堆疊，依註冊順序排列；按下 Ctrl/Cmd+S 時只呼叫
 * 最上層那一個——跟 escapeStack 同樣的堆疊設計，這樣「頁面本身在編輯模式、上面又開了一個
 * 對話框」的巢狀情境，Ctrl+S 存的會是使用者目前實際在操作的那一層，不會兩邊同時存到。
 * 監聽器掛在 window 上而且不檢查焦點在哪裡（輸入框／文字區也會觸發）——跟 escapeStack 用
 * Escape 關閉浮層不同，存檔常常是打完字、游標還留在輸入框裡就想按，這時候還擋掉反而不合直覺 */
const stack: SaveFn[] = [];
let listenerInstalled = false;

function ensureListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && stack.length > 0) {
      e.preventDefault();
      stack[stack.length - 1]();
    }
  });
}

/** 註冊一個「目前可存檔」的處理函式；回傳取消註冊的函式，供 useEffect 的 cleanup 使用 */
export function pushSaveHandler(save: SaveFn): () => void {
  ensureListener();
  stack.push(save);
  return () => {
    const idx = stack.indexOf(save);
    if (idx !== -1) stack.splice(idx, 1);
  };
}
