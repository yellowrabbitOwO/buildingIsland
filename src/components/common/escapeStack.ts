type CloseFn = () => void;

/** 目前開啟中的浮層（Modal、DropdownMenu 等）關閉函式堆疊，依開啟順序排列；
 * 按 Escape 時只關閉最上層那一個，而非全部一起關掉。所有用到 Escape 關閉的浮層元件共用同一個堆疊，
 * 這樣「Modal 裡開了一個 DropdownMenu」這種混合巢狀情境，Escape 順序也會正確 */
const stack: CloseFn[] = [];
let listenerInstalled = false;

function ensureListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && stack.length > 0) {
      stack[stack.length - 1]();
    }
  });
}

/** 註冊一個浮層的關閉函式；回傳取消註冊的函式，供 useEffect 的 cleanup 使用 */
export function pushEscapeHandler(close: CloseFn): () => void {
  ensureListener();
  stack.push(close);
  return () => {
    const idx = stack.indexOf(close);
    if (idx !== -1) stack.splice(idx, 1);
  };
}
