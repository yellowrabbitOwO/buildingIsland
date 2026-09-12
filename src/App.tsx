import type { ReactElement } from "react";
import { Navigate, createBrowserRouter, RouterProvider, useParams } from "react-router-dom";
import { ThemeProvider } from "./theme";
import { LanguageProvider } from "./i18n";
import { LocalUserProvider, useLocalUser } from "./localUser";
import { ConfirmProvider } from "./components/common/ConfirmProvider";
import WorldListPage from "./pages/WorldListPage";
import MainPage from "./pages/MainPage";
import AccountSettingsPage from "./pages/AccountSettingsPage";
import WorldWorkspace from "./pages/WorldWorkspace";
import WorldHomePage from "./pages/WorldHomePage";
import CategoryPage from "./pages/CategoryPage";
import EntryPage from "./pages/EntryPage";
import TemplateManagerPage from "./pages/TemplateManagerPage";
import UserSettingsPage from "./pages/UserSettingsPage";
import SearchPage from "./pages/SearchPage";
import RelationGraphPage from "./pages/RelationGraphPage";
import RelationGraphViewPage from "./pages/RelationGraphViewPage";
import MapPage from "./pages/MapPage";
import MapViewPage from "./pages/MapViewPage";
import NarrativeGraphPage from "./pages/NarrativeGraphPage";
import NarrativeGraphViewPage from "./pages/NarrativeGraphViewPage";
import WritingDocPage from "./pages/WritingDocPage";
import WritingDocViewPage from "./pages/WritingDocViewPage";
import StoryboardPage from "./pages/StoryboardPage";
import StoryboardViewPage from "./pages/StoryboardViewPage";
import ScriptDocPage from "./pages/ScriptDocPage";
import ScriptDocViewPage from "./pages/ScriptDocViewPage";
import TimelinePage from "./pages/TimelinePage";
import TimelineViewPage from "./pages/TimelineViewPage";
import StoryOutlinePage from "./pages/StoryOutlinePage";
import StoryOutlineViewPage from "./pages/StoryOutlineViewPage";
import { isReadOnlyDemo } from "./demoMode";

// react-router 對同一路由只換參數不會重新掛載元件；分類/條目切換時強制以 id 作為
// key 重新掛載，避免頁面內部的本地 UI 狀態（如批量選取）殘留跨到別的分類/條目。
function KeyedCategoryPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  return <CategoryPage key={categoryId} />;
}

function KeyedEntryPage() {
  const { entryId } = useParams<{ entryId: string }>();
  return <EntryPage key={entryId} />;
}

function KeyedRelationGraphViewPage() {
  const { graphId } = useParams<{ graphId: string }>();
  return <RelationGraphViewPage key={graphId} />;
}

function KeyedMapViewPage() {
  const { mapId } = useParams<{ mapId: string }>();
  return <MapViewPage key={mapId} />;
}

function KeyedNarrativeGraphViewPage() {
  const { graphId } = useParams<{ graphId: string }>();
  return <NarrativeGraphViewPage key={graphId} />;
}

function KeyedWritingDocViewPage() {
  const { docId } = useParams<{ docId: string }>();
  return <WritingDocViewPage key={docId} />;
}

function KeyedStoryboardViewPage() {
  const { storyboardId } = useParams<{ storyboardId: string }>();
  return <StoryboardViewPage key={storyboardId} />;
}

function KeyedScriptDocViewPage() {
  const { docId } = useParams<{ docId: string }>();
  return <ScriptDocViewPage key={docId} />;
}

function KeyedTimelineViewPage() {
  const { timelineId } = useParams<{ timelineId: string }>();
  return <TimelineViewPage key={timelineId} />;
}

function KeyedStoryOutlineViewPage() {
  const { outlineId } = useParams<{ outlineId: string }>();
  return <StoryOutlineViewPage key={outlineId} />;
}

// 進 app 先看到主畫面（選登入方式），選完本地使用者（currentUserId 有值）才放行看到世界列表
// ——見規格文件「帳號與世界系統」的主畫面流程
function HomeGate() {
  const { currentUserId } = useLocalUser();
  return currentUserId ? <WorldListPage /> : <MainPage />;
}

// /settings（帳號層級的使用者設定，見 AccountSettingsPage）跟世界列表一樣，只有選好本地使用者
// 才放行，避免直接用網址列跳過 HomeGate 的登入流程
function SettingsGate() {
  const { currentUserId } = useLocalUser();
  if (isReadOnlyDemo) return <Navigate to="/" replace />;
  return currentUserId ? <AccountSettingsPage /> : <Navigate to="/" replace />;
}

// 公開唯讀展示版（見 demoMode.ts）用網址列直接打深層工具頁面（地圖編輯器、範本管理…）一律導回
// 世界首頁——擋的是路由本身，不是只藏按鈕，即使訪客手動改網址也進不去
function DemoBlocked() {
  const { worldId } = useParams<{ worldId: string }>();
  return <Navigate to={`/world/${worldId}`} replace />;
}

function demoGuarded(element: ReactElement): ReactElement {
  return isReadOnlyDemo ? <DemoBlocked /> : element;
}

const router = createBrowserRouter([
  { path: "/", element: <HomeGate /> },
  { path: "/settings", element: <SettingsGate /> },
  {
    path: "/world/:worldId",
    element: <WorldWorkspace />,
    children: [
      { index: true, element: <WorldHomePage /> },
      { path: "category/:categoryId", element: <KeyedCategoryPage /> },
      { path: "entry/:entryId", element: <KeyedEntryPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "templates", element: demoGuarded(<TemplateManagerPage />) },
      { path: "settings", element: demoGuarded(<UserSettingsPage />) },
      { path: "relations", element: demoGuarded(<RelationGraphPage />) },
      { path: "relations/:graphId", element: demoGuarded(<KeyedRelationGraphViewPage />) },
      { path: "map", element: demoGuarded(<MapPage />) },
      { path: "map/:mapId", element: demoGuarded(<KeyedMapViewPage />) },
      { path: "narrative", element: demoGuarded(<NarrativeGraphPage />) },
      { path: "narrative/:graphId", element: demoGuarded(<KeyedNarrativeGraphViewPage />) },
      { path: "writing", element: demoGuarded(<WritingDocPage />) },
      { path: "writing/:docId", element: demoGuarded(<KeyedWritingDocViewPage />) },
      { path: "storyboard", element: demoGuarded(<StoryboardPage />) },
      { path: "storyboard/:storyboardId", element: demoGuarded(<KeyedStoryboardViewPage />) },
      { path: "script", element: demoGuarded(<ScriptDocPage />) },
      { path: "script/:docId", element: demoGuarded(<KeyedScriptDocViewPage />) },
      { path: "timeline", element: demoGuarded(<TimelinePage />) },
      { path: "timeline/:timelineId", element: demoGuarded(<KeyedTimelineViewPage />) },
      { path: "outline", element: demoGuarded(<StoryOutlinePage />) },
      { path: "outline/:outlineId", element: demoGuarded(<KeyedStoryOutlineViewPage />) },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
], {
  // GitHub Pages 專案頁面部署在 /<repo>/ 子路徑下時，Vite 會把這裡設成該子路徑（見
  // vite.config.ts 的 base）；本機開發／根路徑部署時就是預設的 "/"，basename 給 "/" 等同不設
  basename: import.meta.env.BASE_URL,
});

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <LocalUserProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </LocalUserProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
