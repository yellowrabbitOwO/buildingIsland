import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/theme.css";
import App from "./App.tsx";
import { ensureBuiltInContent, ensureDefaultLocalUserForExistingWorlds } from "./data/seed";
import { isReadOnlyDemo } from "./demoMode";
import { db, markDemoBootstrapDone } from "./data/db";
import { createLocalUser } from "./data/repositories/localUser";
import { LOCAL_USER_STORAGE_KEY } from "./localUser";

/** 公開唯讀展示版專用：訪客不用自己選登入方式／建帳號，開機時就自動生出唯一一個展示帳號
 * （連帶 ensureSampleWorld 建好的範例世界，見 createLocalUser），並直接寫進 localStorage
 * 讓 LocalUserProvider 掛載當下就讀到、視同「已登入」，直接看到有內容的世界列表。
 * 已經存在展示帳號（例如重新整理頁面）就重用第一個既有帳號，不會每次都新建一個 */
async function ensureDemoUser(): Promise<void> {
  if (!isReadOnlyDemo) return;
  const existing = await db.localUsers.toArray();
  const userId = existing[0]?.id ?? (await createLocalUser({ name: "Demo" })).id;
  localStorage.setItem(LOCAL_USER_STORAGE_KEY, userId);
}

// 先 await 一次 ensureBuiltInContent() 讓「事後才加的內建種子資料」（例如內建曆法）也能透過各自
// 獨立的守衛補齊，再接著跑 ensureDefaultLocalUserForExistingWorlds()——依序而非平行執行，避免
// 兩邊同時看到「尚未建立」而重複塞入兩份內建範本/群組/模組。範例世界不再是開機時全域建一份
// （見本地使用者系統：每個本地使用者各自透過 createLocalUser → ensureSampleWorld 取得自己的
// 一份），這裡只處理「升級前的既有世界要歸到自動建立的預設使用者名下」這件事
ensureBuiltInContent()
  .then(() => ensureDefaultLocalUserForExistingWorlds())
  .then(() => ensureDemoUser())
  .finally(() => {
    // 展示版的初始化寫入到這裡就全部完成了，正式鎖上唯讀防線（見 db.ts）
    markDemoBootstrapDone();
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
