import { Navigate, Outlet, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import Sidebar from "../components/layout/Sidebar";
import { SidePanelProvider } from "../components/common/SidePanelProvider";
import SidePanelHost from "../components/layout/SidePanel";
import { useLocalUser } from "../localUser";

export default function WorldWorkspace() {
  const { worldId } = useParams<{ worldId: string }>();
  const { currentUserId } = useLocalUser();
  // db.worlds.get() 對不存在的 id 也是回傳 undefined，跟「查詢中」無法區分；
  // 這裡把「查無此世界」明確轉成 null，讓下面能正確分辨載入中／真的找不到
  const world = useLiveQuery(async () => (worldId ? ((await db.worlds.get(worldId)) ?? null) : null), [worldId]);

  if (world === undefined) return null; // 載入中
  // 世界不存在，或不屬於目前登入的本地使用者（例如切換使用者後瀏覽器還留著另一個使用者的世界
  // 網址、或直接貼網址硬闖）都視同查無此世界，導回首頁——避免同一台裝置的不同使用者互相看到
  // 彼此的世界內容，這正是本地使用者系統要解決的問題
  if (world === null || world.localUserId !== currentUserId) return <Navigate to="/" replace />;

  return (
    // key={world.id}：切換世界時強制重新掛載，側邊面板狀態不會跨世界殘留
    <SidePanelProvider key={world.id}>
      <div style={{ display: "flex" }}>
        <Sidebar worldId={world.id} worldName={world.name} />
        <main style={{ flex: 1, minWidth: 0, padding: "24px 32px" }}>
          <Outlet context={{ world }} />
        </main>
        <SidePanelHost world={world} />
      </div>
    </SidePanelProvider>
  );
}
