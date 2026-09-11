import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/theme.css";
import App from "./App.tsx";
import { ensureBuiltInContent, ensureDefaultLocalUserForExistingWorlds } from "./data/seed";

// 先 await 一次 ensureBuiltInContent() 讓「事後才加的內建種子資料」（例如內建曆法）也能透過各自
// 獨立的守衛補齊，再接著跑 ensureDefaultLocalUserForExistingWorlds()——依序而非平行執行，避免
// 兩邊同時看到「尚未建立」而重複塞入兩份內建範本/群組/模組。範例世界不再是開機時全域建一份
// （見本地使用者系統：每個本地使用者各自透過 createLocalUser → ensureSampleWorld 取得自己的
// 一份），這裡只處理「升級前的既有世界要歸到自動建立的預設使用者名下」這件事
ensureBuiltInContent()
  .then(() => ensureDefaultLocalUserForExistingWorlds())
  .finally(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
